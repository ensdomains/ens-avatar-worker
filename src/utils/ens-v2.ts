import { addEnsContracts } from "@ensdomains/ensjs-v2";
import { getChainContractAddress } from "@ensdomains/ensjs-v2/chain";
import { getNameRegistries, getOwner } from "@ensdomains/ensjs-v2/public/v2";
import {
  Address, createPublicClient, custom, getAddress, isAddressEqual,
  labelhash, parseAbi, zeroAddress,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import type { EnsPublicClient } from "./chains";
import { isContractFailure } from "./error";

const stateAbi = parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State state)",
]);
const hcaAbi = parseAbi([
  "function owner() view returns (address)",
  "function accountId() view returns (string)",
]);
const hcaFactoryAbi = parseAbi([
  "function authorizedOwnerOf(address hca) view returns (address)",
]);
const verifiableFactoryAbi = parseAbi([
  "function verifyContract(address proxy) view returns (address implementation)",
]);
const wrapperAbi = parseAbi([
  "function getExpiry(uint256 id) view returns (uint64)",
  "function getResolver(string label) view returns (address)",
  "function V1_RESOLVER() view returns (address)",
]);

// Same pinned deployments as Manager's standalone-HCA manifest. ENS-side
// factory addresses come from ENSjs rather than an independently copied table.
const hcaImplementations: Record<number, Address> = {
  [mainnet.id]: "0x116F462FA078ec0009e9b25DCd60309E70aaC4F4",
  [sepolia.id]: "0xC940e5C5bF263C0e097054AECf73826769A72CEE",
};
const wrapperImplementations: Record<number, Address> = {
  [mainnet.id]: "0xCF3Edb3f5501DE63B57254D910b6782eE370039B",
  [sepolia.id]: "0xBe768b63E5fBBFBB0Ae97E9064E0002dF8001880",
};

export const getV2Client = (client: EnsPublicClient) => {
  const chain = client.chain.id === mainnet.id
    ? mainnet
    : client.chain.id === sepolia.id ? sepolia : null;
  if (!chain) return null;
  return createPublicClient({
    chain: addEnsContracts(chain),
    transport: custom({ request: client.request }, { retryCount: 0 }),
    ccipRead: false,
  });
};

const isLegacyWrapperChild = async (client: NonNullable<ReturnType<typeof getV2Client>>, name: string) => {
  const registries = await getNameRegistries(client, { name });
  // Descendants beneath a V1 mirror have zero entries up to the mirror's
  // containing registry. Check that boundary's label, then resolve the full
  // requested name through V1 rather than requiring its parent's authority.
  const boundary = registries.findIndex((registry, index) => index > 0 && !isAddressEqual(registry, zeroAddress));
  const containing = registries[boundary];
  const label = name.split(".")[boundary - 1];
  if (!containing || !label) return false;
  try {
    const implementation = await client.readContract({
      address: getChainContractAddress({ chain: client.chain, contract: "ensVerifiableFactory" }),
      abi: verifiableFactoryAbi, functionName: "verifyContract", args: [containing],
    });
    if (!isAddressEqual(implementation, wrapperImplementations[client.chain.id])) return false;
    const [expiry, resolver, mirror] = await Promise.all([
      client.readContract({ address: containing, abi: wrapperAbi, functionName: "getExpiry", args: [BigInt(labelhash(label))] }),
      client.readContract({ address: containing, abi: wrapperAbi, functionName: "getResolver", args: [label] }),
      client.readContract({ address: containing, abi: wrapperAbi, functionName: "V1_RESOLVER" }),
    ]);
    return expiry === 0n && !isAddressEqual(mirror, zeroAddress) && isAddressEqual(resolver, mirror);
  }
  catch (error) {
    if (isContractFailure(error)) return false;
    throw error;
  }
};

export const getV2Ownership = async (client: EnsPublicClient, name: string) => {
  const labels = name.split(".");
  if (labels.length < 2 || labels.at(-1) !== "eth") return null;
  const v2 = getV2Client(client);
  if (!v2) return null;
  const state = await v2.readContract({
    address: getChainContractAddress({ chain: v2.chain, contract: "ensRegistry" }),
    abi: stateAbi,
    functionName: "getState",
    args: [BigInt(labelhash(labels[labels.length - 2]))],
  });
  // RESERVED is the legitimate V1 premigration marker. AVAILABLE with a
  // retained expiry can instead be a burned V2 token and must not use V1.
  if (state.status === 1 || (state.expiry === 0n && isAddressEqual(state.latestOwner, zeroAddress))) return null;
  const active = state.status === 2 && state.expiry > BigInt(Math.floor(Date.now() / 1000));
  const owner = active ? await getOwner(v2, { name }) : zeroAddress;
  if (active && labels.length > 2 && isAddressEqual(owner, zeroAddress)
    && await isLegacyWrapperChild(v2, name)) return null;
  return {
    owner: isAddressEqual(owner, zeroAddress) ? null : getAddress(owner),
    available: active && isAddressEqual(owner, zeroAddress),
    protocol: "v2" as const,
  };
};

export const getSupportedHcaOwner = async (
  client: EnsPublicClient,
  hca: Address,
) => {
  const v2 = getV2Client(client);
  if (!v2) return null;
  try {
    const authorizedOwner = await v2.readContract({
      address: getChainContractAddress({ chain: v2.chain, contract: "ensHcaFactory" }),
      abi: hcaFactoryAbi,
      functionName: "authorizedOwnerOf",
      args: [hca],
    });
    if (isAddressEqual(authorizedOwner, zeroAddress)) return null;
    const [owner, accountId, implementation] = await Promise.all([
      v2.readContract({ address: hca, abi: hcaAbi, functionName: "owner" }),
      v2.readContract({ address: hca, abi: hcaAbi, functionName: "accountId" }),
      v2.readContract({
        address: getChainContractAddress({ chain: v2.chain, contract: "ensVerifiableFactory" }),
        abi: verifiableFactoryAbi,
        functionName: "verifyContract",
        args: [hca],
      }),
    ]);
    return isAddressEqual(owner, authorizedOwner)
      && accountId === "ens-standalone-hca.1.1.0"
      && isAddressEqual(implementation, hcaImplementations[v2.chain.id])
      ? getAddress(owner)
      : null;
  }
  catch (error) {
    if (isContractFailure(error)) return null;
    throw error;
  }
};
