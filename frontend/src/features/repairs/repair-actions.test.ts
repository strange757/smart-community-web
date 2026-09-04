import { describe, expect, it } from "vitest"

import { repairActionsFor } from "./repair-actions"

describe("repair action visibility", () => {
  it.each([
    ["OWNER", "SUBMITTED", ["cancel"]],
    ["OWNER", "ASSIGNED", ["cancel"]],
    ["OWNER", "IN_PROGRESS", []],
    ["OWNER", "COMPLETED", ["confirm"]],
    ["OWNER", "CONFIRMED", ["rate"]],
    ["OWNER", "RATED", []],
    ["OWNER", "CANCELLED", []],
    ["PROPERTY", "SUBMITTED", ["assign"]],
    ["PROPERTY", "ASSIGNED", []],
    ["PROPERTY", "IN_PROGRESS", []],
    ["PROPERTY", "COMPLETED", []],
    ["PROPERTY", "CONFIRMED", []],
    ["PROPERTY", "RATED", []],
    ["PROPERTY", "CANCELLED", []],
    ["MAINTENANCE", "SUBMITTED", []],
    ["MAINTENANCE", "ASSIGNED", ["start"]],
    ["MAINTENANCE", "IN_PROGRESS", ["complete"]],
    ["MAINTENANCE", "COMPLETED", []],
    ["MAINTENANCE", "CONFIRMED", []],
    ["MAINTENANCE", "RATED", []],
    ["MAINTENANCE", "CANCELLED", []],
  ] as const)("maps %s and %s to legal actions", (role, status, expected) => {
    expect(repairActionsFor(role, status)).toEqual(expected)
  })
})
