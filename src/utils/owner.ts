import type { EnsPublicClient } from "./chains";

export const getOwnerAndAvailable = async ({
  client,
  name,
}: {
  client: EnsPublicClient;
  name: string;
}) => {
  const labels = name.split(".");
  const is2LDDotEth = labels.length === 2 && labels.at(-1) === "eth";

  const [ownership, available] = await Promise.all([
    client.getOwner({ name }),
    is2LDDotEth ? client.getAvailable({ name }) : undefined,
  ]);

  return {
    owner: ownership?.owner ?? null,
    available: available ?? !ownership?.owner,
  };
};
