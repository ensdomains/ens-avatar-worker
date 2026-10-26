import { Address, Client, getAddress, Hex } from "viem";
import { EnsPublicClient } from "./chains";
import { verifyTypedData } from "viem/actions";

export const typedDataParameters = {
  domain: {
    name: "Ethereum Name Service",
    version: "1",
  },
  types: {
    Upload: [
      { name: "upload", type: "string" },
      { name: "expiry", type: "string" },
      { name: "name", type: "string" },
      { name: "hash", type: "string" },
    ],
  },
  primaryType: "Upload",
} as const;

export const getVerifiedAddress = async ({
  client,
  sig,
  expiry,
  name,
  hash,
  unverifiedAddress,
  uploadType,
}: {
  client: EnsPublicClient;
  sig: Hex;
  expiry: string;
  name: string;
  hash: Hex;
  unverifiedAddress: Address;
  uploadType: "avatar" | "header";
}) => {
  const address = getAddress(unverifiedAddress);

  const verify = (imageHash: string) => verifyTypedData(client as unknown as Client, {
    ...typedDataParameters,
    address,
    signature: sig,
    message: {
      upload: uploadType,
      expiry,
      name,
      hash: imageHash,
    },
  }).catch((e) => {
    console.error("Error while verifying typed data");
    console.error(e);
    return false;
  });

  // Existing Manager builds sign the hex digest without its 0x prefix.
  // Both representations bind the signature to the same uploaded bytes.
  return await verify(hash) || await verify(hash.slice(2)) ? address : null;
};
