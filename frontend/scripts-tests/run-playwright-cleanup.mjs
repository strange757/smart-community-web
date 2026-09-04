import assert from "node:assert/strict"
import childProcess from "node:child_process"
import { EventEmitter } from "node:events"
import { mkdir, rm, stat, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"


const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const database = resolve(frontendRoot, "test-results/e2e/community-e2e.db")
const databaseFiles = [database, `${database}-shm`, `${database}-wal`]
const originalSpawn = childProcess.spawn
const originalExitCode = process.exitCode

await mkdir(dirname(database), { recursive: true })
await Promise.all(databaseFiles.map((path) => writeFile(path, "cleanup regression")))

childProcess.spawn = () => {
  const child = new EventEmitter()
  queueMicrotask(() => child.emit("error", new Error("synthetic Playwright startup rejection")))
  return child
}
syncBuiltinESMExports()

try {
  await assert.rejects(
    import(`../e2e/run-playwright.mjs?cleanup-regression=${Date.now()}`),
    /synthetic Playwright startup rejection/,
  )
  for (const path of databaseFiles) {
    await assert.rejects(stat(path), { code: "ENOENT" })
  }
} finally {
  childProcess.spawn = originalSpawn
  syncBuiltinESMExports()
  process.exitCode = originalExitCode
  await Promise.all(databaseFiles.map((path) => rm(path, { force: true })))
}
