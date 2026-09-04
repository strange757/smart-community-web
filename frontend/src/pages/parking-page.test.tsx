import { fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { renderWithClient } from "@/test/render"
import { ParkingPage } from "./parking-page"

function json(data: unknown) {
  return new Response(JSON.stringify({ data, requestId: "req-parking" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("parking reservation wizard", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("expands only the current step and keeps prior choices after a 409 conflict", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.includes("/parking/reservations/mine")) return Promise.resolve(json([]))
      if (path.includes("/parking/spaces")) return Promise.resolve(json([
        { id: 1, spaceNo: "A-01", areaName: "A区", enabled: true },
      ]))
      if (path.endsWith("/parking/reservations") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          code: "PARKING_SLOT_CONFLICT",
          message: "该时段已被预约",
          requestId: "req-conflict",
        }), { status: 409, headers: { "Content-Type": "application/json" } }))
      }
      throw new ApiError(500, "UNEXPECTED_REQUEST", path)
    }))

    renderWithClient(<ParkingPage />)

    expect(screen.getByRole("heading", { name: "选择日期" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "选择车位" })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("预约日期"), { target: { value: "2099-09-05" } })
    fireEvent.click(screen.getByRole("button", { name: "下一步" }))

    expect(await screen.findByRole("heading", { name: "选择车位" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "选择时段" })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole("button", { name: /A-01/ }))
    expect(screen.getByRole("heading", { name: "选择时段" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "09:00 - 10:00" }))

    expect(screen.getByRole("heading", { name: "确认预约" })).toBeInTheDocument()
    expect(screen.getAllByTestId("parking-selection-summary")).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: "确认预约" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("该时段已被预约")
    expect(screen.getByRole("heading", { name: "选择时段" })).toBeInTheDocument()
    expect(screen.getByText("2099-09-05")).toBeInTheDocument()
    expect(screen.getByText("A区 · A-01")).toBeInTheDocument()
  })
})
