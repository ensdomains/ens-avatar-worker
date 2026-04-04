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
  // TODO: Fix verification
  const address = getAddress(unverifiedAddress);
  return address;

  // const valid = await verifyTypedData(client as Client, {
  //   ...typedDataParameters,
  //   address,
  //   signature: sig,
  //   message: {
  //     upload: uploadType,
  //     expiry,
  //     name,
  //     hash,
  //   },
  // }).catch((e) => {
  //   console.error("Error while verifying typed data");
  //   console.error(e);
  //   return false;
  // });

  // return valid ? address : null;
};
