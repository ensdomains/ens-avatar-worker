import type { ClientWithEns } from "@ensdomains/ensjs/contracts";
import { getAvailable, getOwner } from "@ensdomains/ensjs/public";

export const getOwnerAndAvailable = async ({
  client,
  name,
}: {
  client: ClientWithEns;
  name: string;
}) => {
  const labels = name.split(".");
  const is2LDDotEth = labels.length === 2 && labels.at(-1) === "eth";

  const [ownership, available] = await Promise.all([
    getOwner(client, { name }),
    is2LDDotEth ? getAvailable(client, { name }) : undefined,
  ]);

  return {
    owner: ownership?.owner ?? null,
    available: available ?? !ownership?.owner,
  };
};
