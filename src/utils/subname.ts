import type { Address } from "viem";

import type { EnsPublicClient } from "./chains";

export const isSubname = (name: string) => {
  return name.split(".").length > 2;
};

export const isParentOwner = async ({
  name,
  client,
  verifiedAddress,
}: {
  name: string;
  client: EnsPublicClient;
  verifiedAddress: Address;
}) => {
  const parentOwner = await client.getOwner({
    name: name.split(".").slice(1).join("."),
  });
  return parentOwner?.owner?.toLowerCase() === verifiedAddress.toLowerCase();
};
