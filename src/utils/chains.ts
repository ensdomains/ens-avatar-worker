import { addEnsContracts, createEnsPublicClient } from "@ensdomains/ensjs";
import { mainnet, goerli, sepolia, holesky } from "viem/chains";
import { BaseEnv } from "./hono";
import { createMiddleware } from "hono/factory";
import { http } from "viem";
import { addLocalhostEnsContracts } from "./localhost-chain";
import { ensPublicActions, ensSubgraphActions } from "@ensdomains/ensjs";
import { createPublicClient } from "viem";
import { Context } from "hono";
import { getErrorMessage } from "./error";

const baseChains = [
  addEnsContracts(mainnet),
  addEnsContracts(goerli),
  addEnsContracts(sepolia),
  addEnsContracts(holesky),
] as const;

// Note: localhost chain will be dynamically added based on environment
export const chains = baseChains;

export type Chain =
  | (typeof baseChains)[number]
  | ReturnType<typeof addLocalhostEnsContracts>;
export type Network = "mainnet" | "goerli" | "sepolia" | "holesky" | "localhost";
export type EnsPublicClient = ReturnType<typeof createEnsPublicClient>;

const isDev = (c?: Context<BaseEnv & NetworkMiddlewareEnv, string, object>) => c?.env.ENVIRONMENT === "dev";

export const getChainFromNetwork = (
  _network: string,
  c?: Context<BaseEnv & NetworkMiddlewareEnv, string, object>,
) => {
  const lowercased = _network.toLowerCase();

  // Handle localhost network in development mode
  if (lowercased === "localhost" && c && isDev(c)) {
    return addLocalhostEnsContracts(c.env);
  }

  const network = lowercased === "mainnet" ? "ethereum" : lowercased;
  return chains.find(chain => chain.name.toLowerCase() === network);
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
    if (network === "localhost" && !isDev(c)) throw new Error("localhost is only available in development mode");

    const chain = getChainFromNetwork(network, c);

    if (!chain) {
      return c.text("Network is not supported", 400);
    }

    c.set("chain", chain);
    c.set("network", network as Network);

    await next();
  }
  catch (e) {
    return c.text(getErrorMessage(e, "Network middleware error: "), 400);
  }
});

export type ClientMiddlewareEnv = NetworkMiddlewareEnv & {
  Variables: {
    client: EnsPublicClient;
  };
};
export const clientMiddleware = createMiddleware<BaseEnv & ClientMiddlewareEnv>(
  async (c, next) => {
    const configuredMap = c.env.WEB3_ENDPOINT_MAP;
    const endpointMap = (typeof configuredMap === "string" ? JSON.parse(configuredMap) : configuredMap ?? {}) as Record<
      Network,
      string
    >;

    // Did not use createEnsPublicClinet because it does not support localhost
    const client = createPublicClient({
      chain: c.var.chain,
      key: "ensPublic",
      name: "ENS Public Client",
      ccipRead: false,
      transport: http(endpointMap[c.var.network], { timeout: 5000, retryCount: 0 }),
    })
      .extend(ensPublicActions)
      .extend(ensSubgraphActions) as unknown as EnsPublicClient;

    c.set("client", client);

    await next();
  },
);
