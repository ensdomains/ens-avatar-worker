import type { Address, Chain } from "viem";
import { localhost } from "viem/chains";

// Add ENS contracts to localhost chain for development
export const addLocalhostEnsContracts = (env: Env): Chain => {
  // Check for required ENS contract addresses
  const requiredContracts = {
    LOCALHOST_ENS_REGISTRY: env.LOCALHOST_ENS_REGISTRY,
    LOCALHOST_ENS_NAME_WRAPPER: env.LOCALHOST_ENS_NAME_WRAPPER,
    LOCALHOST_ENS_UNIVERSAL_RESOLVER: env.LOCALHOST_ENS_UNIVERSAL_RESOLVER,
    LOCALHOST_ENS_PUBLIC_RESOLVER: env.LOCALHOST_ENS_PUBLIC_RESOLVER,
    LOCALHOST_ENS_BASE_REGISTRAR_IMPLEMENTATION:
      env.LOCALHOST_ENS_BASE_REGISTRAR_IMPLEMENTATION,
    LOCALHOST_ENS_ETH_REGISTRAR_CONTROLLER:
      env.LOCALHOST_ENS_ETH_REGISTRAR_CONTROLLER,
    LOCALHOST_ENS_REVERSE_REGISTRAR: env.LOCALHOST_ENS_REVERSE_REGISTRAR,
    LOCALHOST_MULTICALL3: env.LOCALHOST_MULTICALL3,
  };

  // Check for missing addresses
  const missingContracts = Object.entries(requiredContracts)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([_, address]) => !address)
    .map(([name]) => name);

  if (missingContracts.length > 0) {
    throw new Error(
      `Missing required localhost ENS contract addresses: ${missingContracts.join(", ")}`,
    );
  }

  return {
    ...localhost,
    contracts: {
      ...localhost.contracts,
      ensRegistry: {
        address: env.LOCALHOST_ENS_REGISTRY as Address,
      },
      ensNameWrapper: {
        address: env.LOCALHOST_ENS_NAME_WRAPPER as Address,
      },
      ensUniversalResolver: {
        address: env.LOCALHOST_ENS_UNIVERSAL_RESOLVER as Address,
        blockCreated: 16773775,
      },
      ensPublicResolver: {
        address: env.LOCALHOST_ENS_PUBLIC_RESOLVER as Address,
      },
      ensBaseRegistrarImplementation: {
        address: env.LOCALHOST_ENS_BASE_REGISTRAR_IMPLEMENTATION as Address,
      },
      ensEthRegistrarController: {
        address: env.LOCALHOST_ENS_ETH_REGISTRAR_CONTROLLER as Address,
      },
      ensReverseRegistrar: {
        address: env.LOCALHOST_ENS_REVERSE_REGISTRAR as Address,
      },
      multicall3: {
        address: env.LOCALHOST_MULTICALL3 as Address,
        blockCreated: 14353601,
      },
    },
  };
};
