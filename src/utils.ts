import type { Env } from "./types";

import { getAvailable, getOwner } from "@ensdomains/ensjs/public";
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
  const isDotEth = labels[labels.length - 1] === "eth";

  const [ownership, available] = await Promise.all([
    getOwner(client, { name }),
    isDotEth ? getAvailable(client, { name }) : false,
  ]);

  return {
    owner: ownership?.owner ?? null,
    available,
  };
};
