import { Address } from "viem";
import { EnsPublicClient } from "./chains";
import { getOwnerAndAvailable } from "./owner";
import { getSupportedHcaOwner } from "./hca";

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
  const { owner, available } = await getOwnerAndAvailable({ client, name: name.split(".").slice(1).join(".") });
  if (!owner) return false;
  return owner.toLowerCase() === verifiedAddress.toLowerCase()
    || (!available && (await getSupportedHcaOwner(client, owner))?.toLowerCase() === verifiedAddress.toLowerCase());
};
