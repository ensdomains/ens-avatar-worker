import type { Env } from "./types";

import { getAvailable, getOwner } from "@ensdomains/ensjs/public";
import { getAddress, type Address, type Hex } from "viem";
import { verifyTypedData } from "viem/actions";
import { getClient, type chains } from "./chains";

export const getOwnerAndAvailable = async ({
  env,
  chain,
  name,
}: {
  env: Env;
  chain: (typeof chains)[number];
  name: string;
}) => {
  const client = getClient({ env, chain });

  const labels = name.split(".");
  const isDotEth = labels.length === 2 && labels[1] === "eth";

  const [ownership, available] = await Promise.all([
    getOwner(client, { name }),
    isDotEth ? getAvailable(client, { name }) : false,
  ]);

  return {
    owner: ownership?.owner ?? null,
    available,
  };
};

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
  env,
  chain,
  sig,
  expiry,
  name,
  hash,
  unverifiedAddress,
}: {
  env: Env;
  chain: (typeof chains)[number];
  sig: Hex;
  expiry: string;
  name: string;
  hash: Hex;
  unverifiedAddress: Address;
}) => {
  const client = getClient({ env, chain });
  const address = getAddress(unverifiedAddress);

  const valid = await verifyTypedData(client, {
    ...typedDataParameters,
    address,
    signature: sig,
    message: {
      upload: "avatar",
      expiry,
      name,
      hash,
    },
  }).catch((e) => {
    console.error("Error while verifying typed data");
    console.error(e);
    return false;
  });

  return valid ? address : null;
};
