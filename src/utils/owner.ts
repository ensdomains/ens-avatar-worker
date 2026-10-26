import { EnsPublicClient } from "./chains";
import type { Address } from "viem";
import { getV2Ownership } from "./ens-v2";

export const getOwnerAndAvailable = async ({
  client,
  name,
}: {
  client: EnsPublicClient;
  name: string;
}): Promise<{ owner: Address | null; available: boolean; protocol?: "v1" | "v2" }> => {
  const v2 = await getV2Ownership(client, name);
  if (v2) return v2;
  const labels = name.split(".");
  const is2LDDotEth = labels.length === 2 && labels.at(-1) === "eth";

  const [ownership, available] = await Promise.all([
    client.getOwner({ name }),
    is2LDDotEth ? client.getAvailable({ name }) : undefined,
  ]);

  return {
    owner: ownership?.owner ?? null,
    available: available ?? !ownership?.owner,
    protocol: "v1",
  };
};
