import { getResolver as getV2Resolver } from "@ensdomains/ensjs-v2/public";
import { dnsEncodeName } from "@ensdomains/ensjs-v2/utils/v2";
import {
  Address, createPublicClient, custom, encodeFunctionData,
  Hex, isAddressEqual, namehash, parseAbi,
  PublicClient, toFunctionSelector, zeroAddress,
} from "viem";
import type { EnsPublicClient } from "./chains";
import { getV2Client, getSupportedHcaOwner } from "./ens-v2";
import { isContractFailure } from "./error";

const textSetters = parseAbi([
  "function setText(bytes name, string key, string value)",
  "function setText(bytes32 node, string key, string value)",
]);
const interfaceAbi = parseAbi([
  "function supportsInterface(bytes4 id) view returns (bool)",
]);

export const isAccountOwner = async (
  client: EnsPublicClient,
  owner: Address | null,
  signer: Address,
  protocol?: "v1" | "v2",
) => {
  if (!owner || isAddressEqual(owner, zeroAddress)) return false;
  if (isAddressEqual(owner, signer)) return true;
  if (protocol !== "v2") return false;
  try {
    const hcaOwner = await getSupportedHcaOwner(client, owner);
    return !!hcaOwner && isAddressEqual(hcaOwner, signer);
  }
  catch (error) {
    if (isContractFailure(error)) return false;
    throw error;
  }
};

const canWriteText = async (
  client: PublicClient,
  resolver: Address,
  account: Address,
  data: Hex,
) => {
  try {
    await client.call({ account, to: resolver, data });
    return true;
  }
  catch (error) {
    if (isContractFailure(error)) return false;
    throw error;
  }
};

export const isAuthorizedUpload = async ({
  client, owner, protocol, signer, name, kind, imageUrl,
}: {
  client: EnsPublicClient;
  owner: Address | null;
  protocol?: "v1" | "v2";
  signer: Address;
  name: string;
  kind: "avatar" | "header";
  imageUrl: string;
}) => {
  if (await isAccountOwner(client, owner, signer, protocol)) return true;
  if (!owner) return false;
  const v2 = protocol === "v2" ? getV2Client(client) : null;
  const publicClient = v2 ?? createPublicClient({
    chain: client.chain,
    transport: custom({ request: client.request }, { retryCount: 0 }),
    ccipRead: false,
  });
  const resolver = v2
    ? await getV2Resolver(v2, { name })
    : await client.getResolver({ name });
  if (!resolver || isAddressEqual(resolver, zeroAddress)) return false;
  const code = await publicClient.getCode({ address: resolver });
  if (!code || code === "0x") return false;
  const interfaces = [
    toFunctionSelector("setText(bytes,string,string)"),
    toFunctionSelector("text(bytes32,string)"),
    "0x01ffc9a7", "0xffffffff",
  ] as const;
  const probes = await publicClient.multicall({
    contracts: interfaces.map(id => ({
      address: resolver, abi: interfaceAbi,
      functionName: "supportsInterface", args: [id],
    })),
  });
  const failure = probes.find(probe => probe.status === "failure");
  if (failure?.status === "failure") {
    if (isContractFailure(failure.error)) return false;
    throw failure.error;
  }
  const [nameBased, nodeBased, erc165, invalid] = probes.map(
    probe => probe.status === "success" && probe.result,
  );
  if (!erc165 || invalid || (!nameBased && !nodeBased)) return false;
  const data = nameBased
    ? encodeFunctionData({ abi: [textSetters[0]], functionName: "setText", args: [dnsEncodeName(name), kind, imageUrl] })
    : encodeFunctionData({ abi: [textSetters[1]], functionName: "setText", args: [namehash(name), kind, imageUrl] });
  return !(await canWriteText(publicClient, resolver, zeroAddress, data))
    && await canWriteText(publicClient, resolver, signer, data);
};
