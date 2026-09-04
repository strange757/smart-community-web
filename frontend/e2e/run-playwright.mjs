import { spawn } from "node:child_process"
import { rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"


const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const playwrightCli = resolve(frontendRoot, "node_modules/@playwright/test/cli.js")
const database = resolve(frontendRoot, "test-results/e2e/community-e2e.db")
const databaseFiles = [database, `${database}-shm`, `${database}-wal`]

let exitCode = 1
let executionError
try {
  const child = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
    cwd: frontendRoot,
    env: process.env,
    stdio: "inherit",
  })
  exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => resolveExit(code ?? 1))
  })
} catch (error) {
  executionError = error
} finally {
  try {
    await Promise.all(databaseFiles.map((path) => rm(path, { force: true })))
  } catch (error) {
    console.error(`Unable to clean the E2E SQLite database: ${error instanceof Error ? error.message : error}`)
    exitCode = 1
    executionError ??= error
  }
}

if (executionError) throw executionError
process.exitCode = exitCode
