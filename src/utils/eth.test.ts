import type { Address, Hex } from "viem";
import { verifyTypedData } from "viem/actions";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  createTestUploadData,
  TEST_ACCOUNT,
  TEST_CLIENT,
} from "@test/setup/helpers";

import { getVerifiedAddress, typedDataParameters } from "@/utils/eth";

vi.mock("viem/actions", {
  spy: true,
});

describe("getVerifiedAddress", () => {
  // Sample ENS name and hash for testing
  const TEST_NAME = "test.eth";
  const TEST_HASH =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  test("should return the address when signature is valid", async () => {
    // Arrange
    const { address, expiry, sig } = await createTestUploadData(
      "avatar",
      TEST_NAME,
      TEST_HASH,
    );

    // Act
    const result = await getVerifiedAddress({
      client: TEST_CLIENT,
      sig,
      expiry,
      name: TEST_NAME,
      hash: TEST_HASH,
      unverifiedAddress: address,
      uploadType: "avatar",
    });

    // Assert
    expect(result).toEqual(address);
    expect(vi.mocked(verifyTypedData)).toHaveBeenCalledWith(expect.anything(), {
      ...typedDataParameters,
      address,
      signature: sig,
      message: {
        upload: "avatar",
        expiry,
        name: TEST_NAME,
        hash: TEST_HASH,
      },
    });
  });

  test("should return null when signature is invalid", async () => {
    // Arrange
    const { address, expiry } = await createTestUploadData(
      "avatar",
      TEST_NAME,
      TEST_HASH,
    );

    // Act
    const result = await getVerifiedAddress({
      client: TEST_CLIENT,
      sig: "0x0",
      expiry,
      name: TEST_NAME,
      hash: TEST_HASH,
      unverifiedAddress: address,
      uploadType: "avatar",
    });

    // Assert
    expect(result).toBeNull();
    expect(vi.mocked(verifyTypedData)).toHaveBeenCalledWith(expect.anything(), {
      ...typedDataParameters,
      address,
      signature: "0x0",
      message: {
        upload: "avatar",
        expiry,
        name: TEST_NAME,
        hash: TEST_HASH,
      },
    });
  });

  test("should return null when verification throws an error", async () => {
    // Arrange
    const { address, expiry, sig } = await createTestUploadData(
      "avatar",
      TEST_NAME,
      TEST_HASH,
    );

    // Mock the verifyTypedData function to throw an error
    vi.mocked(verifyTypedData).mockRejectedValue(
      new Error("Verification error"),
    );

    // Act
    const result = await getVerifiedAddress({
      client: TEST_CLIENT,
      sig,
      expiry,
      name: TEST_NAME,
      hash: TEST_HASH,
      unverifiedAddress: address,
      uploadType: "avatar",
    });

    // Assert
    expect(result).toBeNull();
    expect(verifyTypedData).toHaveBeenCalled();
  });

  test("should normalize the address", async () => {
    // Arrange
    const { expiry, sig } = await createTestUploadData(
      "avatar",
      TEST_NAME,
      TEST_HASH,
    );

    // Lowercase address (not checksummed)
    const lowercaseAddress = TEST_ACCOUNT.address.toLowerCase() as Address;

    // Mock the verifyTypedData function to return true
    // vi.mocked(verifyTypedData).mockResolvedValue(true);

    // Act
    const result = await getVerifiedAddress({
      client: TEST_CLIENT,
      sig,
      expiry,
      name: TEST_NAME,
      hash: TEST_HASH,
      unverifiedAddress: lowercaseAddress,
      uploadType: "avatar",
    });

    // Assert
    expect(result).toEqual(TEST_ACCOUNT.address);
  });

  test("should work with both avatar and header upload types", async () => {
    // Arrange
    const { address, expiry, sig } = await createTestUploadData(
      "header",
      TEST_NAME,
      TEST_HASH,
    );

    // Mock the verifyTypedData function to return true
    // vi.mocked(verifyTypedData).mockResolvedValue(true);

    // Act
    const result = await getVerifiedAddress({
      client: TEST_CLIENT,
      sig,
      expiry,
      name: TEST_NAME,
      hash: TEST_HASH,
      unverifiedAddress: address,
      uploadType: "header",
    });

    // Assert
    expect(result).toEqual(address);
    expect(verifyTypedData).toHaveBeenCalledWith(expect.anything(), {
      ...typedDataParameters,
      address,
      signature: sig,
      message: {
        upload: "header",
        expiry,
        name: TEST_NAME,
        hash: TEST_HASH,
      },
    });
  });

  test("integration: signature verification should work for real signatures", async () => {
    // Skip mocking for this test to verify real signature validation
    vi.restoreAllMocks();

    // Arrange - Create real test data
    const { address, expiry, sig } = await createTestUploadData(
      "avatar",
      TEST_NAME,
      TEST_HASH,
    );

    // Act - Use real verification
    const result = await getVerifiedAddress({
      client: TEST_CLIENT,
      sig,
      expiry,
      name: TEST_NAME,
      hash: TEST_HASH,
      unverifiedAddress: address,
      uploadType: "avatar",
    });

    // Assert
    expect(result).toEqual(address);
  });
});
