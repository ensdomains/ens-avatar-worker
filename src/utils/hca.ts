import { Address, Client, getAddress, isAddressEqual, parseAbi, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import type { EnsPublicClient } from "./chains";

// Pinned to the standalone-HCA 1.1.0 deployments used by Manager.
const deployments: Record<number, { factory: Address; verifier: Address; implementation: Address }> = {
  1: {
    factory: "0x742bf21897a78e2C98cC5f5C5473A370a081e561",
    verifier: "0x77510ba162dfeA3d8989E3f0928a691B345730D2",
    implementation: "0x116F462FA078ec0009e9b25DCd60309E70aaC4F4",
  },
  11155111: {
    factory: "0x6Bad0176236e97b346B5Dd13BCc8325B931EE8ab",
    verifier: "0xDa70306C98E97eCe36F997a21368e53298572991",
    implementation: "0xC940e5C5bF263C0e097054AECf73826769A72CEE",
  },
};
const abi = parseAbi([
  "function authorizedOwnerOf(address hca) view returns (address)",
  "function verifyContract(address proxy) view returns (address)",
  "function owner() view returns (address)",
  "function accountId() view returns (string)",
]);

const readSupportedHcaOwner = async (client: EnsPublicClient, hca: Address) => {
  const deployment = deployments[client.chain.id];
  if (!deployment) return null;
  // The factory returns zero for accounts it does not certify. Do not trust an
  // arbitrary contract's owner() getter as permission to upload for a name.
  const publicClient = client as unknown as Client;
  const authorizedOwner = await readContract(publicClient, {
    address: deployment.factory, abi, functionName: "authorizedOwnerOf", args: [hca],
  });
  if (isAddressEqual(authorizedOwner, zeroAddress)) return null;
  const [owner, accountId, implementation] = await Promise.all([
    readContract(publicClient, { address: hca, abi, functionName: "owner" }),
    readContract(publicClient, { address: hca, abi, functionName: "accountId" }),
    readContract(publicClient, {
      address: deployment.verifier, abi, functionName: "verifyContract", args: [hca],
    }),
  ]);
  return isAddressEqual(owner, authorizedOwner)
    && accountId === "ens-standalone-hca.1.1.0"
    && isAddressEqual(implementation, deployment.implementation)
    ? getAddress(owner)
    : null;
};

// A failed or unsupported proof must never grant access. Existing EOA owner
// uploads remain valid even if the HCA factory cannot be reached.
export const getSupportedHcaOwner = (client: EnsPublicClient, hca: Address) =>
  readSupportedHcaOwner(client, hca).catch(() => null);
