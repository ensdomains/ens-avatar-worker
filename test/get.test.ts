/**
 * @jest-environment miniflare
 * @jest-environment-options {"modules":"true","r2Buckets":["AVATAR_BUCKET"],"bindings":{"WEB3_ENDPOINT":"http://localhost/","REGISTRY_ADDRESS":"0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e","WRAPPER_ADDRESS":"{ \"mainnet\": \"0x582224b8d4534F4749EFA4f22eF7241E0C56D4B8\" }"}}
 */

import onRequestGet from "@/get";
import { EMPTY_ADDRESS } from "../src/utils";
import { mockOwnersAvailability, ResObj } from "./test-utils";

const putBucketItem = (bucket: R2Bucket, name: string, owner?: string) =>
  bucket.put(
    owner
      ? `mainnet/unregistered/${name}/${owner}`
      : `mainnet/registered/${name}`,
    new ArrayBuffer(12),
    { httpMetadata: { contentType: "image/png" } }
  );

describe("get", () => {
  it("returns file if found", async () => {
    const request = new Request("http://localhost/test");
    const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;
    await putBucketItem(AVATAR_BUCKET, "test");

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
  describe("unregistered", () => {
    it("tries to fetch an owner if the file is not found", async () => {
      mockOwnersAvailability(EMPTY_ADDRESS, EMPTY_ADDRESS, true, true);
      const request = new Request("http://localhost/test");
      await onRequestGet(
        request,
        getMiniflareBindings() as any,
        {} as any,
        "test",
        "mainnet"
      );
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    it("returns 404 if the name is not registered", async () => {
      mockOwnersAvailability(EMPTY_ADDRESS, EMPTY_ADDRESS, true, true);
      const request = new Request("http://localhost/test");
      const response = await onRequestGet(
        request,
        getMiniflareBindings() as any,
        {} as any,
        "test",
        "mainnet"
      );
      const { message } = await response.json<ResObj>();

      expect(message).toBe("test not found on mainnet");
      expect(response.status).toBe(404);
    });
    it("returns 404 if there is no associated unregistered file for the owner", async () => {
      mockOwnersAvailability(
        "0x0000000000000000000000000000000000000123",
        EMPTY_ADDRESS,
        true,
        false
      );
      const request = new Request("http://localhost/test");
      const response = await onRequestGet(
        request,
        getMiniflareBindings() as any,
        {} as any,
        "test",
        "mainnet"
      );
      const { message } = await response.json<ResObj>();

      expect(message).toBe("test not found on mainnet");
      expect(response.status).toBe(404);
    });
    it("returns the unregistered file if found from matching owner", async () => {
      mockOwnersAvailability(
        "0x0000000000000000000000000000000000000123",
        EMPTY_ADDRESS,
        true,
        false
      );
      const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;
      await putBucketItem(
        AVATAR_BUCKET,
        "test",
        "0x0000000000000000000000000000000000000123"
      );

      const request = new Request("http://localhost/test");
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
    it("deletes all the unregistered files for the name once there is an owner", async () => {
      mockOwnersAvailability(
        "0x0000000000000000000000000000000000000123",
        EMPTY_ADDRESS,
        true,
        false
      );

      const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;

      const imageUploaders = Array.from({ length: 124 }, (_, i) =>
        `0x${i.toString(16)}`.padStart(42, "0")
      );
      await Promise.all(
        imageUploaders.map((uploader) =>
          putBucketItem(AVATAR_BUCKET, "test.eth", uploader)
        )
      );

      const request = new Request("http://localhost/test.eth");
      await onRequestGet(
        request,
        getMiniflareBindings() as any,
        {} as any,
        "test.eth",
        "mainnet"
      );

      const files = await AVATAR_BUCKET.list({
        prefix: "mainnet/unregistered/test.eth",
      });
      expect(files.objects).toHaveLength(0);
    });
  });
});
