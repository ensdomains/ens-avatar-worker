import { addEnsContracts } from "@ensdomains/ensjs";
import type { ClientWithEns } from "@ensdomains/ensjs/contracts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createClient, http } from "viem";
import { holesky, mainnet, sepolia } from "viem/chains";

import { getErrorMessage } from "./error";
import type { BaseEnv } from "./hono";
import { addLocalhostEnsContracts } from "./localhost-chain";

const baseChains = [
  addEnsContracts(mainnet),
  addEnsContracts(sepolia),
  addEnsContracts(holesky),
] as const;

// Note: localhost chain will be dynamically added based on environment
export const chains = baseChains;

export type Chain =
  | (typeof baseChains)[number]
  | ReturnType<typeof addLocalhostEnsContracts>;
export type Network = "mainnet" | "sepolia" | "holesky" | "localhost";

const isDev = (c: Context<BaseEnv & NetworkMiddlewareEnv, string, object>) =>
  c.env.ENVIRONMENT === "dev";

export const getChainFromNetwork = (
  _network: string,
  c: Context<BaseEnv & NetworkMiddlewareEnv, string, object>,
) => {
  const lowercased = _network.toLowerCase();

  // Handle localhost network in development mode
  if (lowercased === "localhost" && isDev(c)) {
    return addLocalhostEnsContracts(c.env);
  }

  const network = lowercased === "mainnet" ? "ethereum" : lowercased;
  return chains.find((chain) => chain.name.toLowerCase() === network);
};

export type NetworkMiddlewareEnv = {
  Variables: {
    chain: Chain;
    network: Network;
  };
};

export const networkMiddleware = createMiddleware<
  BaseEnv & NetworkMiddlewareEnv
>(async (c, next) => {
  try {
    const network = c.req.param("network")?.toLowerCase() ?? "mainnet";

    // Check if localhost is being accessed in non-dev mode
    if (network === "localhost" && !isDev(c))
      throw new Error("localhost is only available in development mode");

    const chain = getChainFromNetwork(network, c);

    if (!chain) {
      return c.text("Network is not supported", 400);
    }

    c.set("chain", chain);
    c.set("network", network as Network);

    await next();
  } catch (e) {
    return c.text(getErrorMessage(e, "Network middleware error: "), 400);
  }
});

export type ClientMiddlewareEnv = NetworkMiddlewareEnv & {
  Variables: {
    client: ClientWithEns;
  };
};
export const clientMiddleware = createMiddleware<BaseEnv & ClientMiddlewareEnv>(
  async (c, next) => {
    const endpointMap = JSON.parse(c.env.WEB3_ENDPOINT_MAP ?? "{}") as Record<
      Network,
      string
    >;

    const client = createClient({
      chain: c.var.chain,
      transport: http(endpointMap[c.var.network]),
    });

    c.set("client", client);

    await next();
  },
);
