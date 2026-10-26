import { Address, Client, getAddress, isAddressEqual, labelhash, parseAbi, toHex, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import { namehash, packetToBytes } from "viem/ens";
import type { EnsPublicClient } from "./chains";

// ENSjs 5.2.5 deployments, matching the current Manager without upgrading the
// legacy worker's ENSjs dependency or changing its V1 ownership lookup.
const deployments: Record<number, { registry: Address; helper: Address; verifier: Address; wrapper: Address }> = {
  1: {
    registry: "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2",
    helper: "0x46AE127D14683Ac74eF151e46ae2117A1A25C676",
    verifier: "0x77510ba162dfeA3d8989E3f0928a691B345730D2",
    wrapper: "0xCF3Edb3f5501DE63B57254D910b6782eE370039B",
  },
  11155111: {
    registry: "0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4",
    helper: "0xd453e5Bdb62CC3beA84341B1e306319C8Ffd7DFe",
    verifier: "0xDa70306C98E97eCe36F997a21368e53298572991",
    wrapper: "0xBe768b63E5fBBFBB0Ae97E9064E0002dF8001880",
  },
};
const abi = parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State state)",
  "function findExactOwner(bytes name) view returns (address)",
  "function findRegistries(bytes name) view returns (address[])",
  "function verifyContract(address proxy) view returns (address implementation)",
  "function getExpiry(uint256 id) view returns (uint64)",
  "function getResolver(string label) view returns (address)",
  "function V1_RESOLVER() view returns (address)",
  "function getWrappedNode() view returns (bytes32)",
]);

export const getV2Ownership = async (
  client: EnsPublicClient,
  name: string,
): Promise<{ owner: Address | null; available: boolean } | null> => {
  const deployment = deployments[client.chain.id];
  const labels = name.split(".");
  if (!deployment || labels.length < 2 || labels.at(-1) !== "eth") return null;
  const publicClient = client as unknown as Client;
  const state = await readContract(publicClient, {
    address: deployment.registry, abi, functionName: "getState",
    args: [BigInt(labelhash(labels[labels.length - 2]))],
  });
  // RESERVED names and untouched AVAILABLE slots still belong to V1.
  // A burned V2 registration retains its expiry and must not revive V1 rights.
  if (state.status === 1 || (state.status === 0 && state.expiry === 0n
    && isAddressEqual(state.latestOwner, zeroAddress))) return null;
  if (state.status !== 2 || state.expiry <= BigInt(Math.floor(Date.now() / 1000)))
    return { owner: null, available: true };

  const encodedName = toHex(packetToBytes(name));
  const owner = await readContract(publicClient, {
    address: deployment.helper, abi, functionName: "findExactOwner", args: [encodedName],
  });
  if (!isAddressEqual(owner, zeroAddress)) return { owner: getAddress(owner), available: false };

  if (labels.length > 2) {
    // Unmigrated V1 children can remain beneath a migrated parent. Only use
    // V1 ownership when the nearest registry is a verified WrapperRegistry
    // whose boundary label still points at its V1 resolver with no V2 expiry.
    const registries = await readContract(publicClient, {
      address: deployment.helper, abi, functionName: "findRegistries", args: [encodedName],
    });
    const boundary = registries.findIndex((registry, index) => index > 0 && !isAddressEqual(registry, zeroAddress));
    const registry = registries[boundary];
    const label = labels[boundary - 1];
    if (registry && label) {
      const implementation = await readContract(publicClient, {
        address: deployment.verifier, abi, functionName: "verifyContract", args: [registry],
      });
      if (isAddressEqual(implementation, deployment.wrapper)) {
        const [expiry, resolver, mirror, wrappedNode] = await Promise.all([
          readContract(publicClient, { address: registry, abi, functionName: "getExpiry", args: [BigInt(labelhash(label))] }),
          readContract(publicClient, { address: registry, abi, functionName: "getResolver", args: [label] }),
          readContract(publicClient, { address: registry, abi, functionName: "V1_RESOLVER" }),
          readContract(publicClient, { address: registry, abi, functionName: "getWrappedNode" }),
        ]);
        if (expiry === 0n && wrappedNode === namehash(labels.slice(boundary).join("."))
          && !isAddressEqual(mirror, zeroAddress) && isAddressEqual(resolver, mirror)) return null;
      }
    }
  }
  return { owner: null, available: labels.length > 2 };
};
