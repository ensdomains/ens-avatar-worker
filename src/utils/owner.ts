import { EnsPublicClient } from "./chains";
import { getSupportedHcaOwner } from "./hca";
import { getV2Ownership } from "./ens-v2";
import type { Address } from "viem";

export const getOwnerAndAvailable = async ({
  client,
  name,
}: {
  client: EnsPublicClient;
  name: string;
}): Promise<{ owner: Address | null; available: boolean; signingOwner?: Address | null }> => {
  const labels = name.split(".");
  const is2LDDotEth = labels.length === 2 && labels.at(-1) === "eth";

  const v2 = await getV2Ownership(client, name);
  const [ownership, available] = v2
    ? [{ owner: v2.owner }, v2.available]
    : await Promise.all([
      client.getOwner({ name }),
      is2LDDotEth ? client.getAvailable({ name }) : undefined,
    ]);

  const owner = ownership?.owner ?? null;
  const isAvailable = available ?? !owner;
  return {
    owner,
    available: isAvailable,
    signingOwner: owner && !isAvailable ? await getSupportedHcaOwner(client, owner) : null,
  };
};
