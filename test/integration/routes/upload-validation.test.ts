import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import app from "@/index";

const payload = {
  expiry: String(Date.now() + 60_000),
  dataURL: "data:image/jpeg;base64,/9j/2Q==",
  sig: "0x1234",
  unverifiedAddress: "0x1111111111111111111111111111111111111111",
};
const put = (path: string, body: BodyInit, headers: Record<string, string> = {}) => app.fetch(
  new Request(`https://avatar-upload-staging.ens-cf.workers.dev/sepolia/${path}`, {
    method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body,
  }), env,
);

test("rejects malformed normalized names as a client error", async () => {
  const response = await put("%00", JSON.stringify(payload));
  expect(response.status).toBe(400);
});

test("rejects an explicitly signed name that disagrees with the path", async () => {
  const response = await put("alice.eth", JSON.stringify({ ...payload, name: "bob.eth" }));
  expect(response.status).toBe(400);
});

test.each(["avatar", "header"])("rejects malformed image data for the %s slot", async (slot) => {
  const response = await put(`alice.eth${slot === "header" ? "/h" : ""}`, JSON.stringify({ ...payload, dataURL: "data:image/jpeg;base64,%broken" }));
  expect(response.status).toBe(400);
});

test.each([0, 14 * 24 * 60 * 60 * 1000])("rejects an invalid signature validity window %s", async (future) => {
  const response = await put("alice.eth", JSON.stringify({ ...payload, expiry: future ? String(Date.now() + future) : "0" }));
  expect(response.status).toBe(403);
});

test("rejects malformed JSON before signature or chain verification", async () => {
  expect((await put("alice.eth", "{broken")).status).toBe(400);
});

test.each<Record<string, string>>([{}, { "Content-Length": "1" }])("bounds the actual request stream with headers %j", async (headers) => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(800 * 1024));
      controller.close();
    },
  });
  expect((await put("alice.eth", body, headers)).status).toBe(413);
});

test("rejects decoded images above the limit before verifying the signature", async () => {
  const dataURL = `data:image/jpeg;base64,${btoa("x".repeat(512 * 1024 + 1))}`;
  expect((await put("alice.eth", JSON.stringify({ ...payload, dataURL }))).status).toBe(413);
});
