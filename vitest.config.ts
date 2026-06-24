import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The invariant property suite explores large random op-sequences; give it room.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
