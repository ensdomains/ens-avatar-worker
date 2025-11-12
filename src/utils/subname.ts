import type { ClientWithEns } from "@ensdomains/ensjs/contracts";
import { getOwner } from "@ensdomains/ensjs/public";
import type { Address } from "viem";

export const isSubname = (name: string) => {
  return name.split(".").length > 2;
};

export const isParentOwner = async ({
  name,
  client,
  verifiedAddress,
}: {
  name: string;
  client: ClientWithEns;
  verifiedAddress: Address;
}) => {
  const parentOwner = await getOwner(client, {
    name: name.split(".").slice(1).join("."),
  });
  return parentOwner?.owner?.toLowerCase() === verifiedAddress.toLowerCase();
};
