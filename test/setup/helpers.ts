import { addEnsContracts } from "@ensdomains/ensjs";
import { type Address, createClient, type Hex, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { typedDataParameters } from "@/utils/eth";

export const TEST_ACCOUNT = mnemonicToAccount(
  "test test test test test test test test test test test junk",
);

const mainnetWithEns = addEnsContracts(mainnet);

export const TEST_CLIENT = createClient({
  chain: mainnetWithEns,
  transport: http(),
});

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

  const signature = await TEST_ACCOUNT.signTypedData({
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
