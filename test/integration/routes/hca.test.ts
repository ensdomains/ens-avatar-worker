import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Address, ContractFunctionExecutionError, ContractFunctionRevertedError, createPublicClient, custom, parseAbi, sha256, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import { privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";
import { typedDataParameters } from "@/utils/eth";
import app from "@/index";

const state = vi.hoisted(() => ({
  nameOwner: "0x2222222222222222222222222222222222222222" as Address,
  hcaOwner: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A" as Address,
  certified: true,
  implementation: "0xC940e5C5bF263C0e097054AECf73826769A72CEE" as Address,
  accountId: "ens-standalone-hca.1.1.0",
  childAvailable: false,
  parentAvailable: false,
  v2Status: 1,
  v2Owner: "0x0000000000000000000000000000000000000000" as Address,
  v2Expired: false,
  v2Untouched: false,
  hcaRpcFailure: false,
  factoryOwner: undefined as Address | undefined,
  hcaAddress: "0x2222222222222222222222222222222222222222" as Address,
  v1Mirror: false,
  mirrorExpired: false,
  wrappedName: "alice.eth",
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
        getAvailable: async () => state.parentAvailable,
      })));
      await next();
    }),
  };
});

const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const verifierAbi = parseAbi(["function verifyContract(address proxy) view returns (address)"]);
const imageUrl = (kind: "avatar" | "header", name = "alice.eth") =>
  `https://avatar-upload-staging.ens-cf.workers.dev/sepolia/${name}${kind === "header" ? "/h" : ""}`;
const hcaCalls = () => vi.mocked(readContract).mock.calls.filter(([, { functionName }]) =>
  ["authorizedOwnerOf", "owner", "accountId", "verifyContract"].includes(functionName));
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
    accountId: "ens-standalone-hca.1.1.0", childAvailable: false, parentAvailable: false,
    v2Status: 1, v2Owner: zeroAddress, v2Expired: false, v2Untouched: false,
    hcaRpcFailure: false, factoryOwner: undefined,
    hcaAddress: "0x2222222222222222222222222222222222222222",
    v1Mirror: false, mirrorExpired: false,
    wrappedName: "alice.eth",
  });
  vi.mocked(readContract).mockReset();
  vi.mocked(readContract).mockImplementation(async (_client, parameters) => {
    switch (parameters.functionName) {
      case "getState": return {
        status: state.v2Status,
        expiry: state.v2Untouched ? 0n : BigInt(Math.floor(Date.now() / 1000) + (state.v2Expired ? -60 : 3600)),
        latestOwner: state.v2Untouched ? zeroAddress : state.v2Owner,
        tokenId: 1n,
        resource: 1n,
      };
      case "findExactOwner": return parameters.args?.[0] === "0x05616c6963650365746800" ? state.v2Owner : zeroAddress;
      case "findRegistries": return [
        ...(parameters.args?.[0] === "0x046465657003626f6205616c6963650365746800" ? [zeroAddress] : []),
        zeroAddress, "0x5555555555555555555555555555555555555555",
      ];
      case "getExpiry": return state.mirrorExpired ? 1n : 0n;
      case "getWrappedNode": return namehash(state.wrappedName);
      case "getResolver":
      case "V1_RESOLVER": return "0x6666666666666666666666666666666666666666";
      case "authorizedOwnerOf": {
        if (state.hcaRpcFailure) throw new Error("Unavailable");
        return state.certified && parameters.args?.[0] === state.hcaAddress ? state.factoryOwner ?? state.hcaOwner : zeroAddress;
      }
      case "owner": return state.hcaOwner;
      case "accountId": return state.accountId;
      case "verifyContract": {
        if (parameters.args?.[0] !== "0x5555555555555555555555555555555555555555") return state.implementation;
        if (state.v1Mirror) return "0xBe768b63E5fBBFBB0Ae97E9064E0002dF8001880";
        throw new ContractFunctionExecutionError(new ContractFunctionRevertedError({
          abi: verifierAbi,
          functionName: "verifyContract",
          data: "0x4c87e2b60000000000000000000000005555555555555555555555555555555555555555",
        }), { abi: verifierAbi, functionName: "verifyContract", args: parameters.args });
      }
      default: throw new Error("Unexpected contract call");
    }
  });
  for (const bucket of [env.AVATAR_BUCKET, env.HEADER_BUCKET]) {
    const { objects } = await bucket.list();
    await bucket.delete(objects.map(object => object.key));
  }
});

describe("legacy uploads for HCA-owned names", () => {
  test.each(["avatar", "header"] as const)("skips HCA reads for a direct EOA %s upload", async (kind) => {
    state.nameOwner = signer.address;
    state.hcaRpcFailure = true;
    expect((await upload(kind)).status).toBe(200);
    expect(hcaCalls()).toHaveLength(0);
  });

  test.each(["avatar", "header"] as const)("skips HCA reads when the %s preupload is stored under the name owner", async (kind) => {
    const bucket = kind === "avatar" ? env.AVATAR_BUCKET : env.HEADER_BUCKET;
    await bucket.put(`sepolia/unregistered/alice.eth/${state.nameOwner}`, jpeg, {
      httpMetadata: { contentType: "image/jpeg" },
    });
    const response = await app.fetch(new Request(imageUrl(kind)), env);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    expect(hcaCalls()).toHaveLength(0);
  });

  test.each(["avatar", "header"] as const)("skips HCA reads when no %s preupload exists", async (kind) => {
    expect((await app.fetch(new Request(imageUrl(kind)), env)).status).toBe(404);
    expect(hcaCalls()).toHaveLength(0);
  });

  test.each(["avatar", "header"] as const)("skips HCA reads when the %s uploader owns the parent directly", async (kind) => {
    state.nameOwner = signer.address;
    state.childAvailable = true;
    expect((await upload(kind, "bob.alice.eth")).status).toBe(200);
    expect(hcaCalls()).toHaveLength(0);
  });

  test("does not grant HCA authority for an available V1 parent", async () => {
    state.childAvailable = true;
    state.parentAvailable = true;
    expect((await upload("avatar", "bob.alice.eth")).status).toBe(403);
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
    if (mode === "factory-owner") state.factoryOwner = "0x4444444444444444444444444444444444444444";
    if (mode === "rpc-failure") state.hcaRpcFailure = true;
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

  test.each(["avatar", "header"] as const)("uses the V2 owner instead of a different V1 owner for %s", async (kind) => {
    state.v2Status = 2;
    state.v2Owner = signer.address;
    state.certified = false;
    expect((await upload(kind)).status).toBe(200);
  });

  test("verifies the HCA returned by the V2 ownership lookup", async () => {
    state.v2Status = 2;
    state.v2Owner = "0x3333333333333333333333333333333333333333";
    state.hcaAddress = state.v2Owner;
    expect((await upload("avatar")).status).toBe(200);
    state.hcaOwner = "0x4444444444444444444444444444444444444444";
    expect((await upload("avatar")).status).toBe(403);
  });

  test("rejects the V1 HCA signer when a different wallet owns the V2 name", async () => {
    state.v2Status = 2;
    state.v2Owner = "0x4444444444444444444444444444444444444444";
    expect((await upload("avatar")).status).toBe(403);
  });

  test.each(["expired", "unregistered"])("only preuploads after a V2 name is %s, without using stale V1 authority", async (status) => {
    state.nameOwner = signer.address;
    state.v2Status = status === "expired" ? 2 : 0;
    state.v2Owner = signer.address;
    state.v2Expired = true;
    const existing = new Uint8Array([1, 2, 3]);
    await env.AVATAR_BUCKET.put("sepolia/registered/alice.eth", existing);
    expect((await upload("avatar")).status).toBe(200);
    const registered = await env.AVATAR_BUCKET.get("sepolia/registered/alice.eth");
    expect(new Uint8Array(await registered!.arrayBuffer())).toEqual(existing);
    expect((await env.AVATAR_BUCKET.list()).objects.map(object => object.key)).toEqual([
      "sepolia/registered/alice.eth", `sepolia/unregistered/alice.eth/${signer.address}`,
    ]);
  });

  test("retains V1 ownership when the V2 name has never been registered", async () => {
    state.v2Status = 0;
    state.v2Untouched = true;
    state.nameOwner = signer.address;
    expect((await upload("avatar")).status).toBe(200);
  });

  test.each(["bob.alice.eth", "deep.bob.alice.eth"])("retains V1 ownership of the mirrored child %s", async (name) => {
    state.v2Status = 2;
    state.v2Owner = "0x3333333333333333333333333333333333333333";
    state.nameOwner = signer.address;
    state.v1Mirror = true;
    expect((await upload("avatar", name)).status).toBe(200);
  });

  test.each(["avatar", "header"] as const)("handles a non-proxy registry during %s preupload and lookup", async (kind) => {
    state.v2Status = 2;
    state.v2Owner = signer.address;
    expect((await upload(kind, "bob.alice.eth")).status).toBe(200);
    const bucket = kind === "avatar" ? env.AVATAR_BUCKET : env.HEADER_BUCKET;
    expect((await bucket.list()).objects.map(object => object.key)).toEqual([
      `sepolia/unregistered/bob.alice.eth/${signer.address}`,
    ]);
    expect((await app.fetch(new Request(imageUrl(kind, "bob.alice.eth")), env)).status).toBe(404);
  });

  test("does not restore stale V1 child ownership after its mirror is replaced", async () => {
    state.v2Status = 2;
    state.v2Owner = "0x3333333333333333333333333333333333333333";
    state.nameOwner = signer.address;
    state.v1Mirror = true;
    state.mirrorExpired = true;
    state.certified = false;
    expect((await upload("avatar", "bob.alice.eth")).status).toBe(403);
  });

  test("rejects V1 ownership through a wrapper mounted under a different name", async () => {
    state.v2Status = 2;
    state.v2Owner = "0x3333333333333333333333333333333333333333";
    state.nameOwner = signer.address;
    state.v1Mirror = true;
    state.wrappedName = "other.eth";
    state.certified = false;
    expect((await upload("avatar", "bob.alice.eth")).status).toBe(403);
  });
});
