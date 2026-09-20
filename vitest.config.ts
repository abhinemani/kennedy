import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests only. The Playwright specs under e2e/ run with `npm run e2e`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: { include: ["tests/**/*.test.ts"] },
});
