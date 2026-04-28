import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["test/integration/durable-objects/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        isolatedStorage: false,
      },
    },
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@test": new URL("./test", import.meta.url).pathname,
    },
  },
});
