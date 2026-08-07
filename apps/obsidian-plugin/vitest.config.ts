import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@omni/shared-core": fileURLToPath(
        new URL("../../packages/shared-core/src/index.ts", import.meta.url),
      ),
      "@omni/engine": fileURLToPath(new URL("../../apps/engine/src/index.ts", import.meta.url)),
      "@omni/database": fileURLToPath(
        new URL("../../packages/database/src/index.ts", import.meta.url),
      ),
    },
  },
});
