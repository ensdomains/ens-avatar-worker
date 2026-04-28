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

const notify = async (instance: string, payload: ChangePayload) => {
  const id = env.MEDIA_NOTIFIER.idFromName(instance);
  const stub = env.MEDIA_NOTIFIER.get(id);
  return stub.fetch("https://do/notify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

  // Note: cross-fetch WebSocket message delivery (DO -> test runner client end)
  // is not observable in @cloudflare/vitest-pool-workers — the pair only carries
  // messages within a single fetch invocation. We assert delivery via the
  // DO-reported count (X-Delivered header) instead of waiting for the client
  // socket to receive the message. End-to-end message flow is verified manually
  // against `wrangler dev`.
  test("notify only delivers to sockets with matching tag", async () => {
    const instance = "tag-filter";
    await subscribe(instance, "mainnet", "alice.eth", "avatar");
    await subscribe(instance, "mainnet", "alice.eth", "avatar");
    await subscribe(instance, "mainnet", "bob.eth", "avatar");
    await subscribe(instance, "mainnet", "alice.eth", "header");

    const payload = samplePayload({ name: "alice.eth", mediaType: "avatar" });
    const notifyRes = await notify(instance, payload);
    expect(notifyRes.status).toBe(204);
    expect(notifyRes.headers.get("X-Delivered")).toBe("2");
  });

  test("notify with mismatched mediaType is filtered out", async () => {
    const instance = "tag-filter-media";
    await subscribe(instance, "mainnet", "alice.eth", "avatar");

    const headerPayload = samplePayload({ name: "alice.eth", mediaType: "header" });
    const res = await notify(instance, headerPayload);
    expect(res.headers.get("X-Delivered")).toBe("0");
  });

  test("notify with mismatched network is filtered out", async () => {
    const instance = "tag-filter-network";
    await subscribe(instance, "mainnet", "alice.eth", "avatar");

    const sepoliaPayload = samplePayload({ network: "sepolia", name: "alice.eth" });
    const res = await notify(instance, sepoliaPayload);
    expect(res.headers.get("X-Delivered")).toBe("0");
  });

  test("notify with no matching subscribers returns 204 and does not throw", async () => {
    const res = await notify("empty", samplePayload({ name: "nobody.eth" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("X-Delivered")).toBe("0");
  });

  test("closed sockets are removed from the subscriber set", async () => {
    const instance = "closed-socket";
    const wsClosed = await subscribe(instance, "mainnet", "alice.eth", "avatar");
    await subscribe(instance, "mainnet", "alice.eth", "avatar");

    wsClosed.close();
    // Give the close a moment to propagate to the DO.
    await new Promise(resolve => setTimeout(resolve, 100));

    const res = await notify(instance, samplePayload());
    expect(res.status).toBe(204);
    expect(res.headers.get("X-Delivered")).toBe("1");
  });

  test("returns 404 for unknown DO paths", async () => {
    const id = env.MEDIA_NOTIFIER.idFromName("unknown-path");
    const stub = env.MEDIA_NOTIFIER.get(id);
    const res = await stub.fetch("https://do/something-else");
    expect(res.status).toBe(404);
  });
});
