import { addEnsContracts } from "@ensdomains/ensjs";
import { IRequest, IRequestStrict } from "itty-router/Router";
import { error } from "itty-router/error";
import { createClient, http } from "viem";
import { goerli, mainnet, sepolia } from "viem/chains";
import { Env } from "./types";

export type Network = "mainnet" | "goerli" | "sepolia";

export type ValidatedRequest = IRequestStrict & {
  chain: (typeof chains)[number];
  network: Network;
  name: string;
};

export const chains = [
  addEnsContracts(mainnet),
  addEnsContracts(goerli),
  addEnsContracts(sepolia),
] as const;

export const getChainFromNetwork = (network_: string) => {
  const lowercased = network_.toLowerCase();
  const network = lowercased === "mainnet" ? "ethereum" : lowercased;
  return chains.find((chain) => chain.name.toLowerCase() === network);
};

export const getClient = ({
  env,
  chain,
}: {
  env: Env;
  chain: (typeof chains)[number];
}) => {
  const chainName_ = chain.name.toLowerCase();
  const chainName = chainName_ === "ethereum" ? "mainnet" : chainName_;
  return createClient({
    chain,
    transport: http(env.BASE_WEB3_ENDPOINT + "/" + chainName),
  });
};

export const validateChain = (request: IRequest) => {
  let {
    params: { network, name },
  } = request;

  if (!name) {
    if (!network) return error(400, "Missing name");
    name = network;
    network = "mainnet";
  }

  if (!network) {
    return error(400, "Missing network");
  }

  // make sure name is decoded
  name = decodeURIComponent(name);
  network = network.toLowerCase();

  const chain = getChainFromNetwork(network);

  if (!chain) {
    return error(400, "Network not supported");
  }

  request.chain = chain;
  request.network = network as Network;
  request.name = name;
};
