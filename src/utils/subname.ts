import { Address } from "viem";
import { EnsPublicClient } from "./chains";
import { getOwnerAndAvailable } from "./owner";

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
  const { owner, signingOwner } = await getOwnerAndAvailable({ client, name: name.split(".").slice(1).join(".") });
  return [owner, signingOwner].some(address => address?.toLowerCase() === verifiedAddress.toLowerCase());
};
