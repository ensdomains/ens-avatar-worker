/**
 * @jest-environment miniflare
 * @jest-environment-options {"modules":"true"}
 */

import { EMPTY_ADDRESS, getOwnersAndAvailable } from "../src/utils";
import { mockOwnersAvailability } from "./test-utils";

const env = {
  BASE_WEB3_ENDPOINT: "http://localhost",
  REGISTRY_ADDRESS: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
  BASE_REGISTRAR_ADDRESS: "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85",
  WRAPPER_ADDRESS: '{"mainnet":"0x582224b8d4534F4749EFA4f22eF7241E0C56D4B8"}',
} as any;

describe("utils", () => {
  describe("getOwnersAndAvailable", () => {
    it("checks if the name is available if 2LD .eth", async () => {
      mockOwnersAvailability(
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        true,
        true
      );
      const { available, owner } = await getOwnersAndAvailable(
        env,
        "mainnet",
        "test.eth"
      );
      expect(available).toBe(true);
      expect(owner).toBe(EMPTY_ADDRESS);
    });
    it("doesn't check if the name is available if not 2LD .eth", async () => {
      mockOwnersAvailability(
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000"
      );
      const { available, owner } = await getOwnersAndAvailable(
        env,
        "mainnet",
        "test.test"
      );
      expect(available).toBe(false);
      expect(owner).toBe(EMPTY_ADDRESS);
    });
    it("returns the registry owner if not the namewrapper address", async () => {
      mockOwnersAvailability(
        "0x0000000000000000000000000000000000000111",
        "0x0000000000000000000000000000000000000123",
        true,
        true
      );
      const { owner } = await getOwnersAndAvailable(env, "mainnet", "test.eth");
      expect(owner).toBe("0x0000000000000000000000000000000000000111");
    });
    it("returns the namewrapper owner if registry address is namewrapper address", async () => {
      mockOwnersAvailability(
        "0x582224b8d4534F4749EFA4f22eF7241E0C56D4B8",
        "0x0000000000000000000000000000000000000123",
        true,
        true
      );
      const { owner } = await getOwnersAndAvailable(env, "mainnet", "test.eth");
      expect(owner).toBe("0x0000000000000000000000000000000000000123");
    });
  });
});
