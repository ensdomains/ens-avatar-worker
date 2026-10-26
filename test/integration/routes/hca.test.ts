import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Address, createPublicClient, custom, sha256, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import { privateKeyToAccount } from "viem/accounts";
import { typedDataParameters } from "@/utils/eth";
import app from "@/index";

const state = vi.hoisted(() => ({
  nameOwner: "0x2222222222222222222222222222222222222222" as Address,
  hcaOwner: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A" as Address,
  certified: true,
  implementation: "0xC940e5C5bF263C0e097054AECf73826769A72CEE" as Address,
  accountId: "ens-standalone-hca.1.1.0",
  childAvailable: false,
}));
vi.mock("viem/actions", async original => ({
  ...await original<typeof import("viem/actions")>(),
  readContract: vi.fn(),
}));
vi.mock("@/utils/chains", async (original) => {
  const actual = await original<typeof import("@/utils/chains")>();
  const { createMiddleware } = await import("hono/factory");
  return {
    ...actual,
    clientMiddleware: createMiddleware(async (c, next) => {
      c.set("client", createPublicClient({
        chain: c.var.chain,
        transport: custom({ request: async () => { throw new Error("Unexpected RPC"); } }),
      }).extend(() => ({
        getOwner: async ({ name }: { name: string }) => ({ owner: state.childAvailable && name === "bob.alice.eth" ? null : state.nameOwner }),
        getAvailable: async () => false,
      })));
      await next();
    }),
  };
});

const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const imageUrl = (kind: "avatar" | "header", name = "alice.eth") =>
  `https://avatar-upload-staging.ens-cf.workers.dev/sepolia/${name}${kind === "header" ? "/h" : ""}`;
const upload = async (kind: "avatar" | "header", name = "alice.eth") => {
  const expiry = (Date.now() + 60_000).toString();
  const sig = await signer.signTypedData({
    ...typedDataParameters,
    message: { upload: kind, expiry, name, hash: sha256(jpeg).slice(2) },
  });
  return app.fetch(new Request(imageUrl(kind, name), {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expiry, sig, unverifiedAddress: signer.address,
      dataURL: `data:image/jpeg;base64,${btoa(String.fromCharCode(...jpeg))}`,
    }),
  }), env);
};

beforeEach(async () => {
  Object.assign(state, {
    nameOwner: "0x2222222222222222222222222222222222222222", hcaOwner: signer.address,
    certified: true, implementation: "0xC940e5C5bF263C0e097054AECf73826769A72CEE",
    accountId: "ens-standalone-hca.1.1.0", childAvailable: false,
  });
  vi.mocked(readContract).mockReset();
  vi.mocked(readContract).mockImplementation(async (_client, parameters) => {
    switch (parameters.functionName) {
      case "authorizedOwnerOf": return state.certified ? state.hcaOwner : zeroAddress;
      case "owner": return state.hcaOwner;
      case "accountId": return state.accountId;
      case "verifyContract": return state.implementation;
      default: throw new Error("Unexpected contract call");
    }
  });
  for (const bucket of [env.AVATAR_BUCKET, env.HEADER_BUCKET]) {
    const { objects } = await bucket.list();
    await bucket.delete(objects.map(object => object.key));
  }
});

describe("legacy uploads for HCA-owned names", () => {
  test("keeps direct EOA uploads working when the HCA lookup fails", async () => {
    state.nameOwner = signer.address;
    vi.mocked(readContract).mockRejectedValue(new Error("Unavailable"));
    expect((await upload("avatar")).status).toBe(200);
  });

  test.each(["avatar", "header"] as const)("allows the current HCA owner to upload and read %s", async (kind) => {
    expect((await upload(kind)).status).toBe(200);
    const response = await app.fetch(new Request(imageUrl(kind)), env);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    state.hcaOwner = "0x4444444444444444444444444444444444444444";
    expect((await upload(kind)).status).toBe(403);
  });

  test.each(["uncertified", "implementation", "account-id", "factory-owner", "rpc-failure"])("rejects %s without publishing", async (mode) => {
    if (mode === "uncertified") state.certified = false;
    if (mode === "implementation") state.implementation = zeroAddress;
    if (mode === "account-id") state.accountId = "unknown";
    if (mode === "factory-owner") vi.mocked(readContract).mockImplementation(async (_client, parameters) =>
      parameters.functionName === "authorizedOwnerOf" ? "0x4444444444444444444444444444444444444444" : signer.address);
    if (mode === "rpc-failure") vi.mocked(readContract).mockRejectedValue(new Error("Unavailable"));
    expect((await upload("avatar")).status).toBe(403);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });

  test.each(["avatar", "header"] as const)("promotes the HCA owner's existing %s preupload", async (kind) => {
    const bucket = kind === "avatar" ? env.AVATAR_BUCKET : env.HEADER_BUCKET;
    await bucket.put(`sepolia/unregistered/alice.eth/${signer.address}`, jpeg, {
      httpMetadata: { contentType: "image/jpeg" },
    });
    const response = await app.fetch(new Request(imageUrl(kind)), env);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    expect((await bucket.list()).objects.map(object => object.key)).toEqual(["sepolia/registered/alice.eth"]);
  });

  test("does not promote a previous HCA owner's preupload", async () => {
    await env.AVATAR_BUCKET.put(`sepolia/unregistered/alice.eth/${signer.address}`, jpeg);
    state.hcaOwner = "0x4444444444444444444444444444444444444444";
    expect((await app.fetch(new Request(imageUrl("avatar")), env)).status).toBe(404);
  });

  test("allows an HCA owner to preupload for an unregistered child", async () => {
    state.childAvailable = true;
    expect((await upload("avatar", "bob.alice.eth")).status).toBe(200);
    expect((await env.AVATAR_BUCKET.list()).objects[0].key).toBe(`sepolia/unregistered/bob.alice.eth/${signer.address}`);
  });
});
