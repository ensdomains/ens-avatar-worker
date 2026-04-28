import { describe, expect, test } from "vitest";
import { env } from "cloudflare:test";
import type { ChangePayload } from "@/durable-objects/media-notifier";
import type { Address, Hex } from "viem";

const subscribe = async (
  instance: string,
  network: string,
  name: string,
  mediaType: "avatar" | "header",
) => {
  const id = env.MEDIA_NOTIFIER.idFromName(instance);
  const stub = env.MEDIA_NOTIFIER.get(id);
  const url = new URL("https://do/subscribe");
  url.searchParams.set("network", network);
  url.searchParams.set("name", name);
  url.searchParams.set("mediaType", mediaType);
  const res = await stub.fetch(url, { headers: { Upgrade: "websocket" } });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (!ws) throw new Error("DO did not return a webSocket");
  ws.accept();
  return ws;
};

const notify = (instance: string, payload: ChangePayload) => {
  const id = env.MEDIA_NOTIFIER.idFromName(instance);
  return env.MEDIA_NOTIFIER.get(id).notify(payload);
};

const nextMessage = (ws: WebSocket, timeoutMs = 1000) =>
  new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no message within ${timeoutMs}ms`)),
      timeoutMs,
    );
    ws.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(event.data as string);
    }, { once: true });
  });

const samplePayload = (overrides: Partial<ChangePayload> = {}): ChangePayload => ({
  type: "media.changed",
  mediaType: "avatar",
  network: "mainnet",
  name: "alice.eth",
  hash: "0xabc" as Hex,
  size: 100,
  key: "mainnet/registered/alice.eth",
  address: "0x0000000000000000000000000000000000000001" as Address,
  source: "upload",
  timestamp: 1735689600000,
  ...overrides,
});

describe("MediaNotifier DO", () => {
  test("sends a hello frame on connect", async () => {
    const ws = await subscribe("hello-test", "mainnet", "test.eth", "avatar");
    const message = await nextMessage(ws);
    expect(JSON.parse(message)).toEqual({ type: "hello", protocol: 1 });
  });

  test("returns 426 if Upgrade header is missing", async () => {
    const id = env.MEDIA_NOTIFIER.idFromName("upgrade-missing");
    const stub = env.MEDIA_NOTIFIER.get(id);
    const res = await stub.fetch("https://do/subscribe?network=mainnet&name=test.eth&mediaType=avatar");
    expect(res.status).toBe(426);
  });

  test("returns 400 if subscription params are missing", async () => {
    const id = env.MEDIA_NOTIFIER.idFromName("params-missing");
    const stub = env.MEDIA_NOTIFIER.get(id);
    const res = await stub.fetch("https://do/subscribe", {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 if network is not in the allowlist", async () => {
    const id = env.MEDIA_NOTIFIER.idFromName("bad-network");
    const stub = env.MEDIA_NOTIFIER.get(id);
    const res = await stub.fetch(
      "https://do/subscribe?network=evil&name=alice.eth&mediaType=avatar",
      { headers: { Upgrade: "websocket" } },
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 if mediaType is not in the allowlist", async () => {
    const id = env.MEDIA_NOTIFIER.idFromName("bad-mediatype");
    const stub = env.MEDIA_NOTIFIER.get(id);
    const res = await stub.fetch(
      "https://do/subscribe?network=mainnet&name=alice.eth&mediaType=junk",
      { headers: { Upgrade: "websocket" } },
    );
    expect(res.status).toBe(400);
  });

  // Note: cross-fetch WebSocket message delivery (DO -> test runner client end)
  // is not observable in @cloudflare/vitest-pool-workers — the pair only carries
  // messages within a single fetch invocation. We assert delivery via the
  // DO-reported count instead of waiting for the client socket to receive the
  // message. End-to-end message flow is verified manually against `wrangler dev`.
  test("notify only delivers to sockets with matching tag", async () => {
    const instance = "tag-filter";
    await subscribe(instance, "mainnet", "alice.eth", "avatar");
    await subscribe(instance, "mainnet", "alice.eth", "avatar");
    await subscribe(instance, "mainnet", "bob.eth", "avatar");
    await subscribe(instance, "mainnet", "alice.eth", "header");

    const result = await notify(instance, samplePayload({ name: "alice.eth", mediaType: "avatar" }));
    expect(result).toEqual({ delivered: 2 });
  });

  test("notify with mismatched mediaType is filtered out", async () => {
    const instance = "tag-filter-media";
    await subscribe(instance, "mainnet", "alice.eth", "avatar");

    const result = await notify(instance, samplePayload({ name: "alice.eth", mediaType: "header" }));
    expect(result).toEqual({ delivered: 0 });
  });

  test("notify with mismatched network is filtered out", async () => {
    const instance = "tag-filter-network";
    await subscribe(instance, "mainnet", "alice.eth", "avatar");

    const result = await notify(instance, samplePayload({ network: "sepolia", name: "alice.eth" }));
    expect(result).toEqual({ delivered: 0 });
  });

  test("notify with no matching subscribers returns delivered: 0 and does not throw", async () => {
    const result = await notify("empty", samplePayload({ name: "nobody.eth" }));
    expect(result).toEqual({ delivered: 0 });
  });

  test("closed sockets are removed from the subscriber set", async () => {
    const instance = "closed-socket";
    const wsClosed = await subscribe(instance, "mainnet", "alice.eth", "avatar");
    await subscribe(instance, "mainnet", "alice.eth", "avatar");

    wsClosed.close();
    // Give the close a moment to propagate to the DO.
    await new Promise(resolve => setTimeout(resolve, 100));

    const result = await notify(instance, samplePayload());
    expect(result).toEqual({ delivered: 1 });
  });

  test("returns 404 for unknown DO HTTP paths", async () => {
    const id = env.MEDIA_NOTIFIER.idFromName("unknown-path");
    const stub = env.MEDIA_NOTIFIER.get(id);
    const res = await stub.fetch("https://do/something-else");
    expect(res.status).toBe(404);
  });
});
