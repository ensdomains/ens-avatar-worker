import { EnsPublicClient } from "@/utils/chains";
import { typedDataParameters } from "@/utils/eth";
import { createEnsPublicClient, createEnsWalletClient } from "@ensdomains/ensjs";
import { Address, Hex, http } from "viem";

import {
  mnemonicToAccount,
} from "viem/accounts";
import { mainnet } from "viem/chains";

export const TEST_ACCOUNT = mnemonicToAccount(
  "test test test test test test test test test test test junk",
);

export const TEST_WALLET_CLIENT = createEnsWalletClient({
  account: TEST_ACCOUNT,
  chain: mainnet,
  transport: http(),
});

export const TEST_PUBLIC_CLIENT = createEnsPublicClient({
  chain: mainnet,
  transport: http(),
}) as EnsPublicClient;

/**
 * Creates test data for avatar/header upload testing
 * @param uploadType The type of upload (avatar or header)
 * @param name The ENS name
 * @param hash The hash of the uploaded data
 * @param account The account to sign with (defaults to TEST_ACCOUNT)
 * @returns Test data with expiry, signature, etc.
 */
export const createTestUploadData = async (
  uploadType: "avatar" | "header",
  name: string,
  hash: Hex,
  expiry: string = (Date.now() + 3_600_000).toString(),
  account = TEST_ACCOUNT,
): Promise<{
  address: Address;
  expiry: string;
  sig: Hex;
  hash: Hex;
}> => {
  const message = {
    upload: uploadType,
    expiry,
    name,
    hash,
  };

  const signature = await TEST_WALLET_CLIENT.signTypedData({
    ...typedDataParameters,
    message,
  });

  return {
    address: account.address,
    expiry,
    sig: signature,
    hash,
  };
};
