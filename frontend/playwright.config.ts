import { defineConfig, devices } from "@playwright/test"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"


const frontendRoot = dirname(fileURLToPath(import.meta.url))
const python = process.env.E2E_PYTHON ?? resolve(frontendRoot, "../backend/.venv/Scripts/python.exe")
const runner = resolve(frontendRoot, "../backend/run.py")
const database = resolve(frontendRoot, "test-results/e2e/community-e2e.db")

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/playwright-artifacts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:8001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
  ],
  webServer: {
    env: { COMMUNITY_AI_ENABLED: "false" },
    command: `"${python}" "${runner}" --database "${database}" --reset --host 127.0.0.1 --port 8001`,
    url: "http://127.0.0.1:8001/openapi.json",
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
