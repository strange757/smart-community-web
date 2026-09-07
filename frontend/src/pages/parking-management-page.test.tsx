import { fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Reservation } from "@/lib/types"
import { renderWithClient } from "@/test/render"
import { ParkingManagementPage } from "./parking-management-page"

function json(data: unknown) {
  return new Response(JSON.stringify({ data, requestId: "parking-review" }), { status: 200, headers: { "Content-Type": "application/json" } })
}

const request: Reservation = { id: 8, parkingSpaceId: 1, spaceNo: "A-01", areaName: "A区", date: "2099-09-05", start: "09:00", end: "10:00", status: "PENDING", plateNumber: "京A12345", applicantName: "张三", reviewNote: null, reviewedAt: null, reviewedBy: null, createdAt: "2026-09-07T09:00:00Z" }

describe("property parking approval", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("approves a pending application and updates the pending queue", async () => {
    let approved = false
    const decisions: string[] = []
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (init?.method === "POST") {
        decisions.push(path)
        approved = true
        return Promise.resolve(json({ ...request, status: "ACTIVE" }))
      }
      return Promise.resolve(json([{ ...request, status: approved ? "ACTIVE" : "PENDING" }]))
    }))
    renderWithClient(<ParkingManagementPage />)
    expect(await screen.findByText("京A12345")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "通过 A-01 的预约申请" }))
    const dialog = screen.getByRole("dialog", { name: "通过车位预约" })
    expect(within(dialog).getByText("张三")).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "确认通过" }))
    expect(await screen.findByText("暂无待审批预约")).toBeInTheDocument()
    expect(decisions).toEqual(["/api/v1/parking/reservations/8/approve"])
  })

  it("requires a rejection reason before sending a review", async () => {
    const decisions: unknown[] = []
    let rejected = false
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        decisions.push(JSON.parse(String(init.body)))
        rejected = true
        return Promise.resolve(json({ ...request, status: "REJECTED" }))
      }
      return Promise.resolve(json([{ ...request, status: rejected ? "REJECTED" : "PENDING" }]))
    }))
    renderWithClient(<ParkingManagementPage />)
    fireEvent.click(await screen.findByRole("button", { name: "驳回 A-01 的预约申请" }))
    const dialog = screen.getByRole("dialog", { name: "驳回车位预约" })
    expect(within(dialog).getByRole("button", { name: "确认驳回" })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText("驳回原因"), { target: { value: "该车位正在安排维修" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "确认驳回" }))
    expect(await screen.findByText("暂无待审批预约")).toBeInTheDocument()
    expect(decisions).toEqual([{ note: "该车位正在安排维修" }])
  })
})
