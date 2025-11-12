import type { Context } from "hono";
import { describe, expect, test } from "vitest";

import { getChainFromNetwork, type NetworkMiddlewareEnv } from "./chains";
import type { BaseEnv } from "./hono";

const mockContext = {} as unknown as Context<
  BaseEnv & NetworkMiddlewareEnv,
  string,
  object
>;

describe("getChainFromNetwork", () => {
  test("return chain for mainnet", () => {
    expect(getChainFromNetwork("mainnet", mockContext)).toEqual(
      expect.objectContaining({
        name: "Ethereum",
        id: 1,
        contracts: expect.objectContaining({
          ensBaseRegistrarImplementation: expect.objectContaining({
            address: expect.any(String),
          }),
        }),
      }),
    );
  });
  test("return chain for sepolia", () => {
    expect(getChainFromNetwork("sepolia", mockContext)).toEqual(
      expect.objectContaining({
        name: "Sepolia",
        id: 11155111,
        contracts: expect.objectContaining({
          ensBaseRegistrarImplementation: expect.objectContaining({
            address: expect.any(String),
          }),
        }),
      }),
    );
  });
  test("return chain for holesky", () => {
    expect(getChainFromNetwork("holesky", mockContext)).toEqual(
      expect.objectContaining({
        name: "Holesky",
        id: 17000,
        contracts: expect.objectContaining({
          ensBaseRegistrarImplementation: expect.objectContaining({
            address: expect.any(String),
          }),
        }),
      }),
    );
  });
  test("return undefined for unknown network", () => {
    expect(getChainFromNetwork("unknown", mockContext)).toBeUndefined();
  });
  test("return chain for unnormalised network value", () => {
    expect(getChainFromNetwork("sepOLIA", mockContext)).toEqual(
      expect.objectContaining({
        name: "Sepolia",
        id: 11155111,
        contracts: expect.objectContaining({
          ensBaseRegistrarImplementation: expect.objectContaining({
            address: expect.any(String),
          }),
        }),
      }),
    );
  });
});
