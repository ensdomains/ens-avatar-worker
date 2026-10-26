import { Address } from "viem";
import { EnsPublicClient } from "./chains";
import { getOwnerAndAvailable } from "./owner";
import { isAccountOwner } from "./authorization";

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
  const parent = await getOwnerAndAvailable({ client, name: name.split(".").slice(1).join(".") });
  return isAccountOwner(client, parent.owner, verifiedAddress, parent.protocol);
};
