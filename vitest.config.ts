import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@test": new URL("./test", import.meta.url).pathname,
    },
  },
});
