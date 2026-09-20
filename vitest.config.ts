import { defineConfig } from "vitest/config";

// Unit tests only. The Playwright specs under e2e/ run with `npm run e2e`.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
