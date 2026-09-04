import { afterEach, describe, expect, it } from "vitest"

import { formatDate } from "@/lib/presentation"


describe("China-local timestamp presentation", () => {
  const originalTimezone = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTimezone
  })

  it("uses the China calendar date near UTC midnight regardless of device timezone", () => {
    process.env.TZ = "UTC"

    expect(formatDate("2026-09-03T16:30:00Z")).toBe("9月4日")
  })
})
