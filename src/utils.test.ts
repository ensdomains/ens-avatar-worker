import { getAvailable, getOwner } from "@ensdomains/ensjs/public";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getChainFromNetwork } from "./chains";
import { getOwnerAndAvailable } from "./utils";

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
        BASE_WEB3_ENDPOINT: "https://example.com",
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
        BASE_WEB3_ENDPOINT: "https://example.com",
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
  test("null owner", async () => {
    vi.mocked(getOwner).mockResolvedValueOnce(null);
    vi.mocked(getAvailable).mockResolvedValueOnce(true);

    const { owner } = await getOwnerAndAvailable({
      env: {
        BASE_WEB3_ENDPOINT: "https://example.com",
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
