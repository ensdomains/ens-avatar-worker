import { describe, expect, test } from "vitest";

import { getChainFromNetwork } from "./chains";

describe("getChainFromNetwork", () => {
  test("return chain for mainnet", () => {
    expect(getChainFromNetwork("mainnet")).toBeDefined();
  });
  test("return chain for goerli", () => {
    expect(getChainFromNetwork("goerli")).toBeDefined();
  });
  test("return chain for sepolia", () => {
    expect(getChainFromNetwork("sepolia")).toBeDefined();
  });
  test("return chain for holesky", () => {
    expect(getChainFromNetwork("holesky")).toBeDefined();
  });
  test("return undefined for unknown network", () => {
    expect(getChainFromNetwork("unknown")).toBeUndefined();
  });
  test("return chain for unnormalised network value", () => {
    expect(getChainFromNetwork("goERLI")).toBeDefined();
  });
});
