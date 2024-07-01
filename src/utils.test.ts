import { getAvailable, getOwner } from "@ensdomains/ensjs/public";
import { createAnvil } from "@viem/anvil";
import { padHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { getChainFromNetwork } from "./chains";
import {
  getOwnerAndAvailable,
  getVerifiedAddress,
  typedDataParameters,
} from "./utils";

vi.mock("@ensdomains/ensjs/public", () => ({
  getAvailable: vi.fn(),
  getOwner: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOwnerAndAvailable", () => {
  test("return owner and available - .eth", async () => {
    vi.mocked(getOwner).mockResolvedValueOnce({
      owner: "0x123",
      ownershipLevel: "nameWrapper",
    });
    vi.mocked(getAvailable).mockResolvedValueOnce(false);

    const { owner, available } = await getOwnerAndAvailable({
      env: {
        WEB3_ENDPOINT_MAP: JSON.stringify({
          mainnet: "https://example.com/mainnet",
        }),
      } as any,
      chain: getChainFromNetwork("mainnet")!,
      name: "test.eth",
    });

    expect(getOwner).toHaveBeenCalledWith(expect.anything(), {
      name: "test.eth",
    });
    expect(getAvailable).toHaveBeenCalledWith(expect.anything(), {
      name: "test.eth",
    });

    expect(owner).toBe("0x123");
    expect(available).toBe(false);
  });
  test("return owner and available - other", async () => {
    vi.mocked(getOwner).mockResolvedValueOnce({
      owner: "0x123",
      ownershipLevel: "registry",
    });
    vi.mocked(getAvailable).mockResolvedValueOnce(false);

    const { owner, available } = await getOwnerAndAvailable({
      env: {
        WEB3_ENDPOINT_MAP: JSON.stringify({
          mainnet: "https://example.com/mainnet",
        }),
      } as any,
      chain: getChainFromNetwork("mainnet")!,
      name: "test",
    });

    expect(getOwner).toHaveBeenCalledWith(expect.anything(), {
      name: "test",
    });
    expect(getAvailable).not.toHaveBeenCalled();

    expect(owner).toBe("0x123");
    expect(available).toBe(false);
  });
  test("return owner and available - eth 3ld", async () => {
    vi.mocked(getOwner).mockResolvedValueOnce({
      owner: "0x123",
      ownershipLevel: "registry",
    });
    vi.mocked(getAvailable).mockResolvedValueOnce(false);

    const { owner, available } = await getOwnerAndAvailable({
      env: {
        WEB3_ENDPOINT_MAP: JSON.stringify({
          mainnet: "https://example.com/mainnet",
        }),
      } as any,
      chain: getChainFromNetwork("mainnet")!,
      name: "sub.test.eth",
    });

    expect(getOwner).toHaveBeenCalledWith(expect.anything(), {
      name: "sub.test.eth",
    });
    expect(getAvailable).not.toHaveBeenCalled();

    expect(owner).toBe("0x123");
    expect(available).toBe(false);
  });
  test("null owner", async () => {
    vi.mocked(getOwner).mockResolvedValueOnce(null);
    vi.mocked(getAvailable).mockResolvedValueOnce(true);

    const { owner } = await getOwnerAndAvailable({
      env: {
        WEB3_ENDPOINT_MAP: JSON.stringify({
          mainnet: "https://example.com/mainnet",
        }),
      } as any,
      chain: getChainFromNetwork("mainnet")!,
      name: "test.eth",
    });

    expect(getOwner).toHaveBeenCalledWith(expect.anything(), {
      name: "test.eth",
    });
    expect(owner).toBe(null);
  });
});

describe("getVerifiedAddress", () => {
  const account = mnemonicToAccount(
    "test test test test test test test test test test test junk"
  );
  const server = createAnvil({ port: 8552 });

  beforeAll(async () => {
    await server.start();
  });
  afterAll(async () => {
    await server.stop();
  });

  test("return address for valid sig", async () => {
    const unverifiedAddress = account.address;
    const expiry = `${Date.now() + 1000 * 60 * 60 * 24 * 7}`;
    const hash = padHex("0x00", { size: 32 });
    const name = "test.eth";
    const sig = await account.signTypedData({
      ...typedDataParameters,
      message: {
        upload: "avatar",
        expiry,
        name,
        hash,
      },
    });

    const verifiedAddress = await getVerifiedAddress({
      env: {
        WEB3_ENDPOINT_MAP: JSON.stringify({
          mainnet: `http://${server.host}:${server.port}`,
        }),
      } as any,
      chain: getChainFromNetwork("mainnet")!,
      sig,
      expiry,
      name,
      hash,
      unverifiedAddress,
    });

    expect(verifiedAddress).toBe(unverifiedAddress);
  });
  test("return null for invalid sig", async () => {
    const unverifiedAddress = account.address;
    const expiry = `${Date.now() + 1000 * 60 * 60 * 24 * 7}`;
    const hash = padHex("0x00", { size: 32 });
    const name = "test.eth";
    const sig = padHex("0x01", { size: 32 });

    const verifiedAddress = await getVerifiedAddress({
      env: {
        WEB3_ENDPOINT_MAP: JSON.stringify({
          mainnet: `http://${server.host}:${server.port}`,
        }),
      } as any,
      chain: getChainFromNetwork("mainnet")!,
      sig,
      expiry,
      name,
      hash,
      unverifiedAddress,
    });

    expect(verifiedAddress).toBe(null);
  });
});
