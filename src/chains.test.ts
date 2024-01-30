import { describe, expect, test } from "vitest";
import { getChainFromNetwork, getClient, validateChain } from "./chains";

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
  test("return undefined for unknown network", () => {
    expect(getChainFromNetwork("unknown")).toBeUndefined();
  });
  test("return chain for unnormalised network value", () => {
    expect(getChainFromNetwork("goERLI")).toBeDefined();
  });
});

describe("getClient", () => {
  test("return client with transport", () => {
    const client = getClient({
      env: {
        WEB3_ENDPOINT_MAP: JSON.stringify({
          mainnet: "https://example.com/mainnet",
        }),
      } as any,
      chain: getChainFromNetwork("mainnet")!,
    });
    expect(client.transport.url).toBe("https://example.com/mainnet");
  });
});

describe("validateChain", () => {
  test("add chain/network/name to request", () => {
    const request = {
      params: {
        network: "mainnet",
        name: "foo",
      },
    } as any;
    validateChain(request);
    expect(request.chain).toBeDefined();
    expect(request.network).toBe("mainnet");
    expect(request.name).toBe("foo");
  });
  test("lowercase network name", () => {
    const request = {
      params: {
        network: "GOERLI",
        name: "foo",
      },
    } as any;
    validateChain(request);
    expect(request.network).toBe("goerli");
  });
  test("decode name", () => {
    const request = {
      params: {
        network: "mainnet",
        name: "with-apostrophe%E2%80%99s.eth",
      },
    } as any;
    validateChain(request);
    expect(request.name).toBe("with-apostrophe’s.eth");
  });
  test("no name param - assume mainnet, use network param for name", () => {
    const request = {
      params: {
        network: "foo",
      },
    } as any;
    validateChain(request);
    expect(request.network).toBe("mainnet");
    expect(request.name).toBe("foo");
  });
  test("return error when name is missing", async () => {
    const request = {
      params: {
        network: "",
      },
    } as any;
    const response = validateChain(request)!;
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Missing name",
        "status": 400,
      }
    `);
  });
  test("return error when network is missing", async () => {
    const request = {
      params: {
        network: "",
        name: "test",
      },
    } as any;
    const response = validateChain(request)!;
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Missing network",
        "status": 400,
      }
    `);
  });
  test("return error when network is not supported", async () => {
    const request = {
      params: {
        network: "foo",
        name: "test",
      },
    } as any;
    const response = validateChain(request)!;
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchInlineSnapshot(`
      {
        "error": "Network not supported",
        "status": 400,
      }
    `);
  });
});
