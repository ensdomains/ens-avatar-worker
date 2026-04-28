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

const tagFor = (network: Network, name: string, mediaType: MediaType) =>
  `${network}:${name}:${mediaType}`;

export class MediaNotifier extends DurableObject<Env> {
  // Plain in-memory subscriber map. The DO is a single global instance that
  // stays alive while clients are connected, so we don't need hibernation or
  // SQLite-backed persistence for v1.
  #subscribers: Map<string, Set<WebSocket>> = new Map();

  // Only the WebSocket upgrade is HTTP. `notify` is exposed as an RPC method
  // below so the worker can invoke it through the typed stub without going
  // through HTTP.
  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/subscribe") return this.#subscribe(req, url);
    return new Response("not found", { status: 404 });
  }

  #subscribe(req: Request, url: URL): Response {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const network = url.searchParams.get("network");
    const name = url.searchParams.get("name");
    const mediaType = url.searchParams.get("mediaType");

    if (!name || !network || !NETWORKS.has(network as Network)) {
      return new Response("invalid network or name", { status: 400 });
    }
    if (!mediaType || !MEDIA_TYPES.has(mediaType as MediaType)) {
      return new Response("invalid mediaType", { status: 400 });
    }

    const tag = tagFor(network as Network, name, mediaType as MediaType);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

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

    server.send(JSON.stringify({ type: "hello", protocol: 1 }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async notify(payload: ChangePayload): Promise<{ delivered: number }> {
    const message = JSON.stringify(payload);
    const tag = tagFor(payload.network, payload.name, payload.mediaType);
    const bucket = this.#subscribers.get(tag);

    let delivered = 0;
    if (bucket) {
      for (const ws of bucket) {
        try {
          ws.send(message);
          delivered += 1;
        }
        catch {
          bucket.delete(ws);
        }
      }
    }

    return { delivered };
  }
}
