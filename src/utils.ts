import type { Env } from "./types";

import {
  Hex,
  decodeFunctionResult,
  encodeFunctionData,
  hexToBigInt,
  type Address,
  type ContractFunctionConfig,
} from "viem";

import { labelhash, namehash } from "viem/ens";

export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

export const registryAbi = [
  {
    inputs: [
      {
        name: "node",
        type: "bytes32",
      },
    ],
    name: "owner",
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const nameWrapperAbi = [
  {
    inputs: [
      {
        name: "id",
        type: "uint256",
      },
    ],
    name: "ownerOf",
    outputs: [
      {
        name: "owner",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const baseRegistrarAbi = [
  {
    inputs: [
      {
        name: "id",
        type: "uint256",
      },
    ],
    name: "available",
    outputs: [
      {
        name: "available",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const multicallAbi = [
  {
    inputs: [
      {
        components: [
          {
            name: "target",
            type: "address",
          },
          {
            name: "allowFailure",
            type: "bool",
          },
          {
            name: "callData",
            type: "bytes",
          },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate3",
    outputs: [
      {
        components: [
          {
            name: "success",
            type: "bool",
          },
          {
            name: "returnData",
            type: "bytes",
          },
        ],
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

type RegistryCall = ContractFunctionConfig<typeof registryAbi, "owner", "view">;

type NameWrapperCall = ContractFunctionConfig<
  typeof nameWrapperAbi,
  "ownerOf",
  "view"
>;

type AvailableCall = ContractFunctionConfig<
  typeof baseRegistrarAbi,
  "available",
  "view"
>;

type MulticallCall = ContractFunctionConfig<
  typeof multicallAbi,
  "aggregate3",
  "view"
>;

export const getOwnersAndAvailable = async (
  env: Env,
  network: string,
  name: string
) => {
  const wrapperAddress = JSON.parse(env.WRAPPER_ADDRESS)[network];
  const endpoint = env.BASE_WEB3_ENDPOINT + "/" + network;

  const labels = name.split(".");
  const nameHash = namehash(name);
  const labelHash = labelhash(labels[0]);
  const isDotETH2ld = labels.length === 2 && labels[1] === "eth";

  const registryCall: RegistryCall = {
    address: env.REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "owner",
    args: [nameHash],
  };

  const nameWrapperCall: NameWrapperCall = {
    address: wrapperAddress,
    abi: nameWrapperAbi,
    functionName: "ownerOf",
    args: [hexToBigInt(nameHash)],
  };

  const availableCall: AvailableCall = {
    address: env.BASE_REGISTRAR_ADDRESS,
    abi: baseRegistrarAbi,
    functionName: "available",
    args: [hexToBigInt(labelHash)],
  };

  const calls = [
    registryCall,
    nameWrapperCall,
    ...(isDotETH2ld ? [availableCall] : []),
  ];

  const multicallData: MulticallCall = {
    address: env.MULTICALL_ADDRESS,
    abi: multicallAbi,
    functionName: "aggregate3",
    args: [
      calls.map(({ abi, address, args, functionName }) => ({
        target: address,
        allowFailure: false,
        callData: encodeFunctionData({ abi, args, functionName } as any),
      })),
    ],
  };

  const data = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        {
          to: multicallData.address,
          data: encodeFunctionData(multicallData),
        },
      ],
    }),
  }).then((res) => res.json<{ jsonrpc: string; id: number; result: Hex }>());

  const [registryOwner, nameWrapperOwner, available = false] =
    decodeFunctionResult({
      abi: multicallAbi,
      functionName: "aggregate3",
      data: data.result,
    }).map(({ returnData, success }, i) => {
      if (!success) throw new Error("Call failed");
      const call = calls[i];
      return decodeFunctionResult({
        ...call,
        data: returnData,
      } as any);
    }) as [Address, Address, boolean | undefined];

  let owner = EMPTY_ADDRESS;

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
