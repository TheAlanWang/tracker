import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "cd ../backend && PYTHONPATH=. uv run --env-file ../.env uvicorn app.main:app --port 8001",
      port: 8001,
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "VITE_API_URL=http://127.0.0.1:8001 pnpm dev",
      port: 5173,
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
