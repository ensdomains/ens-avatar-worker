import { Interface, namehash, solidityKeccak256 } from "ethers/lib/utils";
import { Env } from "./types";

export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

export const registry = new Interface([
  "function owner(bytes32 node) public view returns (address)",
]);

export const nameWrapper = new Interface([
  "function ownerOf(uint256 id) public view returns (address)",
]);

export const baseRegistrar = new Interface([
  "function available(uint256 id) public view returns (bool)",
]);

export const multicall = new Interface([
  "function aggregate((address,bytes)[]) returns (uint256, bytes[])",
]);

export const _handleFetch =
  (endpoint: string) =>
  async (
    to: string,
    data: string
  ): Promise<{
    jsonrpc: string;
    result: string;
    id: number;
  }> => {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to,
            data,
          },
          "latest",
        ],
        id: 1,
      }),
    }).then((res) => res.json());
  };

export const getOwnersAndAvailable = async (
  env: Env,
  network: string,
  labels: string[]
) => {
  const handleFetch = _handleFetch(env.BASE_WEB3_ENDPOINT + "/" + network);
  const wrapperAddress = JSON.parse(env.WRAPPER_ADDRESS)[network];

  const nameHash = namehash(labels.join("."));
  const labelHash = solidityKeccak256(["string"], [labels[0]]);
  const isDotETH2ld = labels.length === 2 && labels[1] === "eth";

  const calls: [string, string][] = [
    [env.REGISTRY_ADDRESS, registry.encodeFunctionData("owner", [nameHash])],
    [wrapperAddress, nameWrapper.encodeFunctionData("ownerOf", [nameHash])],
  ];

  if (isDotETH2ld) {
    calls.push([
      env.BASE_REGISTRAR_ADDRESS,
      baseRegistrar.encodeFunctionData("available", [labelHash]),
    ]);
  }

  const multicallResult = await handleFetch(
    env.MULTICALL_ADDRESS,
    multicall.encodeFunctionData("aggregate", [calls])
  );
  const [, [registryOwnerResult, nameWrapperOwnerResult, baseRegistrarResult]] =
    multicall.decodeFunctionResult("aggregate", multicallResult.result);

  const [registryOwner] = registry.decodeFunctionResult(
    "owner",
    registryOwnerResult
  );
  const [nameWrapperOwner] = nameWrapper.decodeFunctionResult(
    "ownerOf",
    nameWrapperOwnerResult
  );
  let available = false;

  if (isDotETH2ld) {
    [available] = baseRegistrar.decodeFunctionResult(
      "available",
      baseRegistrarResult
    );
  }

  let owner = EMPTY_ADDRESS;

  console.log(registryOwner, nameWrapperOwner);

  if (registryOwner === wrapperAddress) {
    owner = nameWrapperOwner;
  } else {
    owner = registryOwner;
  }

  return {
    owner,
    available,
  };
};
