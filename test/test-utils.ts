import { Address, encodeFunctionResult } from "viem";
import { baseRegistrarAbi, nameWrapperAbi, registryAbi } from "../src/utils";

export const j = (import.meta as any).jest as typeof jest;

export const mockOwnersAvailability = (
  registryOwner: Address,
  nameWrapperOwner: Address,
  tryAvailable?: boolean,
  available?: boolean
) => {
  const resultsArray = [
    encodeFunctionResult({
      abi: registryAbi,
      functionName: "owner",
      result: registryOwner,
    }),
    encodeFunctionResult({
      abi: nameWrapperAbi,
      functionName: "ownerOf",
      result: nameWrapperOwner,
    }),
  ];
  if (tryAvailable) {
    resultsArray.push(
      encodeFunctionResult({
        abi: baseRegistrarAbi,
        functionName: "available",
        result: available,
      })
    );
  }
  const result = encodeFunctionResult({
    abi: [
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
    ],
    functionName: "aggregate3",
    result: [resultsArray.map((result) => [true, result])],
  });

  j.spyOn(globalThis, "fetch").mockImplementation(async (url, req) => {
    const { id } = JSON.parse(req!.body as string);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        result,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  });
};

export type ResObj = {
  message: string;
  name: string;
};
