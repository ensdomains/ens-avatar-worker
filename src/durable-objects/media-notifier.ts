import { DurableObject } from "cloudflare:workers";
import type { Address, Hex } from "viem";
import type { Network } from "@/utils/chains";
import type { MediaType } from "@/utils/media";

export type ChangePayload = {
  type: "media.changed";
  mediaType: MediaType;
  network: Network;
  name: string;
  hash: Hex;
  size: number;
  key: string;
  address: Address;
  source: "upload" | "promotion";
  timestamp: number;
};

const NETWORKS = new Set<Network>(["mainnet", "goerli", "sepolia", "holesky", "localhost"]);
const MEDIA_TYPES = new Set<MediaType>(["avatar", "header"]);

// Firehose subscribers land here. Real tags are always `network:name:mediaType`,
// so "*" can never collide with one.
const GLOBAL_TAG = "*";

// ":" is rejected by ENSIP-15 normalization, so the separator is unambiguous.
const tagFor = (network: Network, name: string, mediaType: MediaType) =>
  `${network}:${name}:${mediaType}`;

export class MediaNotifier extends DurableObject<Env> {
  #subscribers: Map<string, Set<WebSocket>> = new Map();

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/subscribe") return this.#subscribe(req, url);
    return new Response("not found", { status: 404 });
  }

  #subscribe(req: Request, url: URL): Response {
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    let tag: string;
    if (url.searchParams.get("scope") === "global") {
      tag = GLOBAL_TAG;
    }
    else {
      const network = url.searchParams.get("network");
      const name = url.searchParams.get("name");
      const mediaType = url.searchParams.get("mediaType");

      if (!name || !network || !NETWORKS.has(network as Network)) {
        return new Response("invalid network or name", { status: 400 });
      }
      if (!mediaType || !MEDIA_TYPES.has(mediaType as MediaType)) {
        return new Response("invalid mediaType", { status: 400 });
      }

      tag = tagFor(network as Network, name, mediaType as MediaType);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Standard accept() (not the hibernation API) keeps the DO in memory while
    // any socket is open, so the in-memory subscriber map can't desync via
    // eviction. Hibernation would cut idle cost but is deferred: the pinned
    // vitest-pool-workers version can't exercise it, and a single global DO
    // rarely idles, so the saving would be small.
    server.accept();
    this.#addSubscriber(tag, server);
    server.send(JSON.stringify({ type: "hello", protocol: 1 }));

    return new Response(null, { status: 101, webSocket: client });
  }

  #addSubscriber(tag: string, server: WebSocket): void {
    let bucket = this.#subscribers.get(tag);
    if (!bucket) {
      bucket = new Set();
      this.#subscribers.set(tag, bucket);
    }
    bucket.add(server);

    const cleanup = () => {
      const current = this.#subscribers.get(tag);
      if (!current) return;
      current.delete(server);
      if (current.size === 0) this.#subscribers.delete(tag);
    };
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);
  }

  async notify(payload: ChangePayload): Promise<{ delivered: number }> {
    const message = JSON.stringify(payload);
    const tag = tagFor(payload.network, payload.name, payload.mediaType);

    return {
      delivered:
        this.#send(message, this.#subscribers.get(tag))
        + this.#send(message, this.#subscribers.get(GLOBAL_TAG)),
    };
  }

  #send(message: string, bucket: Set<WebSocket> | undefined): number {
    if (!bucket) return 0;
    let delivered = 0;
    for (const ws of bucket) {
      try {
        ws.send(message);
        delivered += 1;
      }
      catch {
        bucket.delete(ws);
      }
    }
    return delivered;
  }
}
