import { spawn } from "node:child_process"
import { rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"


const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const playwrightCli = resolve(frontendRoot, "node_modules/@playwright/test/cli.js")
const database = resolve(frontendRoot, "test-results/e2e/community-e2e.db")
const child = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
  cwd: frontendRoot,
  env: process.env,
  stdio: "inherit",
})

let exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject)
  child.once("exit", (code) => resolveExit(code ?? 1))
})

try {
  await Promise.all([
    rm(database, { force: true }),
    rm(`${database}-shm`, { force: true }),
    rm(`${database}-wal`, { force: true }),
  ])
} catch (error) {
  console.error(`Unable to clean the E2E SQLite database: ${error instanceof Error ? error.message : error}`)
  exitCode = 1
}

process.exitCode = exitCode
