import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4096"

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  // Use headed mode to see what's happening
  headless: true,
  timeout: 60000,
  retries: 0,
  use: {
    // Use Chrome for better compatibility
    viewport: { width: 1280, height: 720 },
    baseURL: baseURL,
  },
  projects: [
    {
      name: "opencode",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "bun run dev",
    cwd: "./packages/app",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
})
