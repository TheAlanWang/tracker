import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only (Playwright e2e lives in tests/). Mirrors the "@/…" alias
// from vite.config.ts.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // lib/supabase throws without these; tests never reach the network.
    env: { VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_PUBLISHABLE_KEY: "test" },
  },
});
