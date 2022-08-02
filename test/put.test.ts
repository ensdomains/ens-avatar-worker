/**
 * @jest-environment miniflare
 * @jest-environment-options {"modules":"true","r2Buckets":["AVATAR_BUCKET"],"bindings":{"REGISTRY_ADDRESS":"0x123","WEB3_ENDPOINT":"http://localhost/"}}
 */

import onRequestPut from "@/put";
import { Wallet } from "ethers";
import { defaultAbiCoder, sha256 } from "ethers/lib/utils";

const j = (import.meta as any).jest as typeof jest;

const dataURLToBytes = (dataURL: string) => {
  const base64 = dataURL.split(",")[1];
  const mime = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return { mime, bytes };
};

const wallet = Wallet.fromMnemonic(
  "test test test test test test test test test test test junk"
);
const expiry = String(Date.now() + 1000);
const name = "test";

const walletAddress = wallet.address;
const _makeSig = (obj: Record<string, string>) =>
  wallet._signTypedData(
    {
      name: "Ethereum Name Service",
      version: "1",
    },
    {
      Upload: [
        { name: "upload", type: "string" },
        { name: "expiry", type: "string" },
        { name: "name", type: "string" },
        { name: "hash", type: "string" },
      ],
    },
    obj
  );

const makeSigWithHash = (hash: string) =>
  _makeSig({
    upload: "avatar",
    expiry,
    name,
    hash,
  });

const makeSig = (dataURL: string) =>
  makeSigWithHash(sha256(dataURLToBytes(dataURL).bytes));

describe("put", () => {
  it("returns not found if there is an error", async () => {
    j.spyOn(globalThis, "fetch").mockImplementation((() => {
      new Error("test");
    }) as any);
    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/test", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSig(dataURL),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      "test"
    );
    const { message } = await response.json();

    expect(message).toBe("test not found");
    expect(response.status).toBe(404);
  });
  it("returns error if image is too large", async () => {
    j.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          result: defaultAbiCoder.encode(["address"], [walletAddress]),
        })
      );
    });

    const dataURL =
      "data:image/jpeg;base64," +
      Array(512 * 1024)
        .fill(0)
        .map(() => Math.floor(Math.random() * 256).toString(16))
        .join("");

    const request = new Request("http://localhost/test", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSigWithHash(dataURL),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      "test"
    );
    const { message } = await response.json();

    expect(message).toBe("Image is too large");
    expect(response.status).toBe(413);
  });
  it("returns error if owner is not name owner", async () => {
    j.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          result: defaultAbiCoder.encode(
            ["address"],
            ["0x0000000000000000000000000000000000000000"]
          ),
        })
      );
    });

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/test", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSig(dataURL),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      "test"
    );
    const { message } = await response.json();

    expect(message).toBe(`Address ${walletAddress} is not the owner of test`);
    expect(response.status).toBe(403);
  });
  it("returns error if signature has expired", async () => {
    j.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          result: defaultAbiCoder.encode(["address"], [walletAddress]),
        })
      );
    });

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/test", {
      body: JSON.stringify({
        expiry: "1",
        dataURL,
        sig: await _makeSig({
          upload: "avatar",
          expiry: "1",
          name: "test",
          hash: sha256(dataURLToBytes(dataURL).bytes),
        }),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      "test"
    );
    const { message } = await response.json();

    expect(message).toBe("Signature expired");
    expect(response.status).toBe(403);
  });
  it("uploads image if checks pass", async () => {
    j.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          result: defaultAbiCoder.encode(["address"], [walletAddress]),
        })
      );
    });

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/test", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSig(dataURL),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      "test"
    );
    const { message } = await response.json();

    expect(message).toBe("uploaded");
    expect(response.status).toBe(200);

    const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;
    const result = await AVATAR_BUCKET.get("test");
    const buffer = await result!.arrayBuffer();
    expect(buffer).toEqual(dataURLToBytes(dataURL).bytes.buffer);
  });
});
