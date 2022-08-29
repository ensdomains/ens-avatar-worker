/**
 * @jest-environment miniflare
 * @jest-environment-options {"modules":"true","r2Buckets":["AVATAR_BUCKET"],"bindings":{"REGISTRY_ADDRESS":"0x123","WEB3_ENDPOINT":"http://localhost/"}}
 */

import onRequestGet from "@/get";

describe("get", () => {
  it("returns 404 if file not found", async () => {
    const request = new Request("http://localhost/test");
    const response = await onRequestGet(
      request,
      getMiniflareBindings() as any,
      {} as any,
      "test",
      "mainnet"
    );
    const { message } = await response.json();

    expect(message).toBe("test not found on mainnet");
    expect(response.status).toBe(404);
  });
  it("returns file if found", async () => {
    const request = new Request("http://localhost/test");
    const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;
    await AVATAR_BUCKET.put("mainnet-test", new ArrayBuffer(12), {
      httpMetadata: {
        contentType: "image/png",
      },
    });

    const response = await onRequestGet(
      request,
      getMiniflareBindings() as any,
      {} as any,
      "test",
      "mainnet"
    );

    expect(await response.arrayBuffer()).toEqual(new ArrayBuffer(12));
    expect(response.status).toBe(200);
  });
});
