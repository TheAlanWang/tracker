import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only (Playwright e2e lives in tests/). Mirrors the "@/…" alias
// from vite.config.ts.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
