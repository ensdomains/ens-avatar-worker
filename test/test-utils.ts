import { baseRegistrar, multicall, nameWrapper, registry } from "../src/utils";

export const j = (import.meta as any).jest as typeof jest;

export const mockOwnersAvailability = (
  registryOwner: string,
  nameWrapperOwner: string,
  tryAvailable?: boolean,
  available?: boolean
) => {
  const resultsArray = [
    registry.encodeFunctionResult("owner", [registryOwner]),
    nameWrapper.encodeFunctionResult("ownerOf", [nameWrapperOwner]),
  ];
  if (tryAvailable) {
    resultsArray.push(
      baseRegistrar.encodeFunctionResult("available", [available])
    );
  }
  const result = multicall.encodeFunctionResult(
    "aggregate((address,bytes)[])",
    [0, resultsArray]
  );

  j.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({
        result,
      })
    );
  });
};

export type ResObj = {
  message: string;
  name: string;
};
