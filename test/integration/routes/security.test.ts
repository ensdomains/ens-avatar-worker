import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Address, Hex, sha256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { typedDataParameters } from "@/utils/eth";
import app from "@/index";

const chain = vi.hoisted(() => ({
  owner: "0x2222222222222222222222222222222222222222" as Address,
  hcaOwner: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A" as Address,
  resolver: "0x3333333333333333333333333333333333333333" as Address,
  expired: false,
  v2: true,
  isHca: false,
  allowedKey: "avatar",
  allowed: false,
  code: "0x6000" as Hex | undefined,
  fallback: false,
  text: true,
  invalidInterface: false,
  rpcFailure: false,
  stateStatus: 2,
  emptyOwner: false,
  stateExpiry: undefined as bigint | undefined,
  topOwner: undefined as Address | undefined,
  v1Owner: undefined as Address | undefined,
  v1ParentOwner: undefined as Address | undefined,
  v1Available: false,
  containingRegistry: "0x5555555555555555555555555555555555555555" as Address,
  wrapperImplementation: "0xBe768b63E5fBBFBB0Ae97E9064E0002dF8001880" as Address,
  leafExpiry: 0n,
  v1Resolver: "0x6666666666666666666666666666666666666666" as Address,
  hcaFactoryOwner: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A" as Address,
  hcaAccountId: "ens-standalone-hca.1.1.0",
  hcaImplementation: "0xC940e5C5bF263C0e097054AECf73826769A72CEE" as Address,
}));

// Substitute the external chain boundary. Signature recovery, ENS lookups,
// encoded setter checks, routing and local R2 storage are exercised together.
vi.mock("viem", async (original) => {
  const actual = await original<typeof import("viem")>();
  const setter = actual.parseAbi(["function setText(bytes name, string key, string value)"]);
  return {
    ...actual,
    createPublicClient: (options: Parameters<typeof actual.createPublicClient>[0]) => actual.createPublicClient(options).extend(() => ({
      readContract: async ({ address, functionName, args }: {
        address: Address;
        functionName: string;
        args?: readonly unknown[];
      }) => {
        if (chain.rpcFailure) throw new Error("RPC unavailable");
        if (functionName === "getState") return {
          status: chain.v2 ? chain.stateStatus : 1,
          expiry: chain.stateExpiry ?? BigInt(Math.floor(Date.now() / 1000) + (chain.expired ? -1 : 3600)),
          latestOwner: chain.v2 && !chain.emptyOwner ? chain.topOwner ?? chain.owner : actual.zeroAddress,
          tokenId: 1n,
          resource: 1n,
        };
        if (functionName === "findExactOwner") return args?.[0] === "0x05616c6963650365746800"
          ? chain.topOwner ?? chain.owner
          : chain.owner;
        if (functionName === "findResolver") return [chain.resolver];
        if (functionName === "supportsInterface") return false;
        if (functionName === "findRegistries") return [
          ...(args?.[0] === "0x046465657003626f6205616c6963650365746800" ? [actual.zeroAddress] : []),
          actual.zeroAddress, chain.containingRegistry,
          "0x7777777777777777777777777777777777777777",
          "0x8888888888888888888888888888888888888888",
        ];
        if (functionName === "getExpiry" && address === chain.containingRegistry
          && args?.[0] === BigInt(actual.labelhash("bob"))) return chain.leafExpiry;
        if (functionName === "getResolver" && address === chain.containingRegistry
          && args?.[0] === "bob") return chain.v1Resolver;
        if (functionName === "V1_RESOLVER" && address === chain.containingRegistry) return chain.v1Resolver;
        if (functionName === "authorizedOwnerOf") return chain.isHca ? chain.hcaFactoryOwner : actual.zeroAddress;
        if (functionName === "owner") return chain.hcaOwner;
        if (functionName === "accountId") return chain.hcaAccountId;
        if (functionName === "verifyContract") return args?.[0] === chain.containingRegistry
          ? chain.wrapperImplementation
          : chain.hcaImplementation;
        throw new Error(`Unexpected chain read: ${functionName}`);
      },
      getCode: async () => chain.code,
      multicall: async () => [chain.text, false, true, chain.invalidInterface].map(result => ({ status: "success", result })),
      call: async ({ account, to, data }: { account: Address; to: Address; data: Hex }) => {
        if (to?.toLowerCase() !== chain.resolver.toLowerCase()) return { data: "0x00" };
        if (chain.fallback) return { data: "0x" };
        const decoded = actual.decodeFunctionData({ abi: setter, data });
        const [name, key, value] = decoded.args;
        if (account !== chain.hcaOwner || !chain.allowed || key !== chain.allowedKey
          || name !== "0x05616c6963650365746800"
          || value !== `https://avatar-upload-staging.ens-cf.workers.dev/sepolia/alice.eth${key === "header" ? "/h" : ""}`)
          throw new actual.BaseError("reverted", { cause: new actual.ExecutionRevertedError() });
        return { data: "0x" };
      },
    } as unknown as Pick<ReturnType<typeof actual.createPublicClient>, "readContract" | "getCode" | "multicall" | "call">)),
  };
});

vi.mock("@/utils/chains", async (original) => {
  const actual = await original<typeof import("@/utils/chains")>();
  const { createMiddleware } = await import("hono/factory");
  const { createPublicClient, custom } = await import("viem");
  return {
    ...actual,
    clientMiddleware: createMiddleware(async (c, next) => {
      c.set("client", createPublicClient({
        chain: c.var.chain,
        transport: custom({ request: async () => { throw new Error("Unexpected external RPC"); } }, { retryCount: 0 }),
      }).extend(() => ({
        getOwner: async ({ name }: { name: string }) => ({
          owner: name === "bob.alice.eth" && chain.v1ParentOwner
            ? chain.v1ParentOwner
            : chain.v1Owner ?? chain.owner,
        }),
        getAvailable: async () => chain.v1Available,
        getResolver: async () => chain.resolver,
      })));
      await next();
    }),
  };
});

const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const dataURL = `data:image/jpeg;base64,${btoa(String.fromCharCode(...jpeg))}`;
const request = async ({
  signedName = "alice.eth", pathName = "alice.eth", kind = "avatar", pathKind = kind,
}: { signedName?: string; pathName?: string; kind?: "avatar" | "header"; pathKind?: "avatar" | "header" } = {}) => {
  const expiry = (Date.now() + 60_000).toString();
  const sig = await signer.signTypedData({
    ...typedDataParameters,
    message: { upload: kind, expiry, name: signedName, hash: sha256(jpeg).slice(2) },
  });
  return app.fetch(new Request(`https://avatar-upload-staging.ens-cf.workers.dev/sepolia/${pathName}${pathKind === "header" ? "/h" : ""}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiry, dataURL, sig, unverifiedAddress: signer.address }),
  }), env);
};

beforeEach(async () => {
  Object.assign(chain, {
    owner: "0x2222222222222222222222222222222222222222", hcaOwner: signer.address,
    expired: false, v2: true, isHca: false, allowedKey: "avatar", allowed: false,
    code: "0x6000", fallback: false, text: true, invalidInterface: false, rpcFailure: false,
    stateStatus: 2, emptyOwner: false,
    stateExpiry: undefined, topOwner: undefined, v1Owner: undefined, v1ParentOwner: undefined, v1Available: false,
    wrapperImplementation: "0xBe768b63E5fBBFBB0Ae97E9064E0002dF8001880", leafExpiry: 0n,
    v1Resolver: "0x6666666666666666666666666666666666666666",
    hcaFactoryOwner: signer.address, hcaAccountId: "ens-standalone-hca.1.1.0",
    hcaImplementation: "0xC940e5C5bF263C0e097054AECf73826769A72CEE",
  });
  for (const bucket of [env.AVATAR_BUCKET, env.HEADER_BUCKET]) {
    const { objects } = await bucket.list();
    await bucket.delete(objects.map(object => object.key));
  }
});

describe("verified uploads across ENS versions", () => {
  test.each(["avatar", "header"] as const)("allows a V2 EOA owner to publish the %s and read it back", async (kind) => {
    chain.owner = signer.address;
    const response = await request({ kind });
    expect(response.status).toBe(200);
    const image = await app.fetch(new Request(`https://avatar-upload-staging.ens-cf.workers.dev/sepolia/alice.eth${kind === "header" ? "/h" : ""}`), env);
    expect(image.headers.get("Content-Type")).toBe("image/jpeg");
    expect(image.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(jpeg);
  });
  test("allows the verified current owner of a supported HCA", async () => {
    chain.isHca = true;
    expect((await request()).status).toBe(200);
    chain.hcaOwner = "0x4444444444444444444444444444444444444444";
    expect((await request()).status).toBe(403);
  });
  test.each(["unknown-implementation", "wrong-account-id", "factory-owner-mismatch"])("rejects an HCA owner with %s", async (mode) => {
    chain.isHca = true;
    if (mode === "unknown-implementation") chain.hcaImplementation = "0x9999999999999999999999999999999999999999";
    if (mode === "wrong-account-id") chain.hcaAccountId = "untrusted-hca.1.1.0";
    if (mode === "factory-owner-mismatch") chain.hcaFactoryOwner = "0x4444444444444444444444444444444444444444";
    expect((await request()).status).toBe(403);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
  test("keeps an existing V1 owner's uploads working", async () => {
    chain.v2 = false;
    chain.owner = signer.address;
    expect((await request()).status).toBe(200);
  });
  test("allows the V1 owner of an unmigrated child through its known WrapperRegistry mirror", async () => {
    chain.owner = "0x0000000000000000000000000000000000000000";
    chain.topOwner = "0x2222222222222222222222222222222222222222";
    chain.v1Owner = signer.address;
    const response = await request({ signedName: "bob.alice.eth", pathName: "bob.alice.eth" });
    expect(response.status).toBe(200);
    const image = await app.fetch(new Request("https://avatar-upload-staging.ens-cf.workers.dev/sepolia/bob.alice.eth"), env);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(jpeg);
  });
  test.each(["registered-leaf", "unknown-wrapper"])("rejects stale V1 child ownership for a %s", async (mode) => {
    chain.owner = "0x0000000000000000000000000000000000000000";
    chain.topOwner = "0x2222222222222222222222222222222222222222";
    chain.v1Owner = signer.address;
    if (mode === "registered-leaf") chain.leafExpiry = BigInt(Math.floor(Date.now() / 1000) - 1);
    if (mode === "unknown-wrapper") chain.wrapperImplementation = "0x9999999999999999999999999999999999999999";
    expect((await request({ signedName: "bob.alice.eth", pathName: "bob.alice.eth" })).status).toBe(403);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
  test("allows a V1 descendant below the explicit WrapperRegistry mirror boundary", async () => {
    chain.owner = "0x0000000000000000000000000000000000000000";
    chain.topOwner = "0x2222222222222222222222222222222222222222";
    chain.v1Owner = signer.address;
    chain.v1ParentOwner = "0x4444444444444444444444444444444444444444";
    const response = await request({ signedName: "deep.bob.alice.eth", pathName: "deep.bob.alice.eth" });
    expect(response.status).toBe(200);
    const image = await app.fetch(new Request("https://avatar-upload-staging.ens-cf.workers.dev/sepolia/deep.bob.alice.eth"), env);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(jpeg);
  });
  test("rejects stale V1 descendant ownership once the mirror boundary has a registration expiry", async () => {
    chain.owner = "0x0000000000000000000000000000000000000000";
    chain.topOwner = "0x2222222222222222222222222222222222222222";
    chain.v1Owner = signer.address;
    chain.v1ParentOwner = "0x4444444444444444444444444444444444444444";
    chain.leafExpiry = BigInt(Math.floor(Date.now() / 1000) - 1);
    expect((await request({ signedName: "deep.bob.alice.eth", pathName: "deep.bob.alice.eth" })).status).toBe(403);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
  test.each(["avatar", "header"] as const)("promotes an EOA preupload after the name is registered to its supported HCA for %s", async (kind) => {
    Object.assign(chain, {
      owner: "0x0000000000000000000000000000000000000000", emptyOwner: true,
      stateStatus: 0, stateExpiry: 0n, v1Available: true,
    });
    expect((await request({ kind })).status).toBe(200);
    const bucket = kind === "avatar" ? env.AVATAR_BUCKET : env.HEADER_BUCKET;
    expect((await bucket.list()).objects.map(object => object.key)).toEqual([
      `sepolia/unregistered/alice.eth/${signer.address}`,
    ]);
    Object.assign(chain, {
      owner: "0x2222222222222222222222222222222222222222", emptyOwner: false,
      stateStatus: 2, stateExpiry: undefined, v1Available: false, isHca: true,
    });
    const image = await app.fetch(new Request(`https://avatar-upload-staging.ens-cf.workers.dev/sepolia/alice.eth${kind === "header" ? "/h" : ""}`), env);
    expect(image.status).toBe(200);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(jpeg);
    expect((await bucket.list()).objects.map(object => object.key)).toEqual(["sepolia/registered/alice.eth"]);
  });
  test("does not promote a former EOA owner's preupload when the HCA current owner differs", async () => {
    Object.assign(chain, {
      owner: "0x0000000000000000000000000000000000000000", emptyOwner: true,
      stateStatus: 0, stateExpiry: 0n, v1Available: true,
    });
    expect((await request()).status).toBe(200);
    Object.assign(chain, {
      owner: "0x2222222222222222222222222222222222222222", emptyOwner: false,
      stateStatus: 2, stateExpiry: undefined, v1Available: false, isHca: true,
      hcaOwner: "0x4444444444444444444444444444444444444444",
    });
    const image = await app.fetch(new Request("https://avatar-upload-staging.ens-cf.workers.dev/sepolia/alice.eth"), env);
    expect(image.status).toBe(404);
    expect((await env.AVATAR_BUCKET.list()).objects.map(object => object.key)).toEqual([
      `sepolia/unregistered/alice.eth/${signer.address}`,
    ]);
  });
  test("rejects an unrelated wallet without writing an object", async () => {
    expect((await request()).status).toBe(403);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
  test("rejects a signature for a different path name", async () => {
    chain.owner = signer.address;
    expect((await request({ signedName: "bob.eth" })).status).toBe(400);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
  test("rejects an avatar signature replayed against the header", async () => {
    chain.owner = signer.address;
    expect((await request({ pathKind: "header" })).status).toBe(400);
    expect((await env.HEADER_BUCKET.list()).objects).toHaveLength(0);
  });
  test("does not authorize a stale V1 owner after V2 expiry", async () => {
    chain.owner = signer.address;
    chain.expired = true;
    expect((await request()).status).toBe(404);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
  test("does not authorize a stale V1 owner after a V2 token was unregistered", async () => {
    chain.owner = signer.address;
    chain.stateStatus = 0;
    chain.emptyOwner = true;
    chain.expired = true;
    expect((await request()).status).toBe(404);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
  test("checks the exact text slot for an authorized delegate", async () => {
    chain.allowed = true;
    expect((await request()).status).toBe(200);
    expect((await request({ kind: "header" })).status).toBe(403);
    chain.allowed = false;
    expect((await request()).status).toBe(403);
  });
  test.each(["no-code", "fallback", "unsupported-text", "invalid-erc165"])("rejects the %s resolver bypass", async (mode) => {
    chain.allowed = true;
    if (mode === "no-code") chain.code = undefined;
    if (mode === "fallback") chain.fallback = true;
    if (mode === "unsupported-text") chain.text = false;
    if (mode === "invalid-erc165") chain.invalidInterface = true;
    expect((await request()).status).toBe(403);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
  test("returns a service error rather than authorizing when RPC is unavailable", async () => {
    chain.rpcFailure = true;
    expect((await request()).status).toBe(503);
    expect((await env.AVATAR_BUCKET.list()).objects).toHaveLength(0);
  });
});
