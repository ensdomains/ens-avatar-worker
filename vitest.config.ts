import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        // Reuse one runtime to avoid exhausting local module-fetch sockets
        // while loading both ENS protocol libraries. Storage stays isolated.
        singleWorker: true,
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@test": new URL("./test", import.meta.url).pathname,
    },
  },
});
