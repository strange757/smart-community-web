import { act, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithClient } from "@/test/render"
import { ParkingPage } from "./parking-page"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { data, requestId: "parking-test" } : data), {
    status, headers: { "Content-Type": "application/json" },
  })
}

const spaces = [
  { id: 1, spaceNo: "A-01", areaName: "A区", enabled: true, availability: "AVAILABLE", isMine: false },
  { id: 2, spaceNo: "A-02", areaName: "A区", enabled: true, availability: "OCCUPIED", isMine: false },
  { id: 3, spaceNo: "A-03", areaName: "A区", enabled: true, availability: "PENDING", isMine: false },
  { id: 4, spaceNo: "A-04", areaName: "A区", enabled: false, availability: "DISABLED", isMine: false },
]

describe("visual parking reservations", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("shows unavailable positions and submits a chosen space for property approval", async () => {
    const submitted: unknown[] = []
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.includes("/parking/availability")) return Promise.resolve(json({ asOf: new Date().toISOString(), spaces }))
      if (path.includes("/reservations/mine")) return Promise.resolve(json([]))
      if (path.endsWith("/parking/reservations") && init?.method === "POST") {
        const body = JSON.parse(String(init.body))
        submitted.push(body)
        return Promise.resolve(json({ id: 9, ...body, spaceNo: "A-01", areaName: "A区", status: "PENDING", applicantName: "张三", reviewNote: null, reviewedAt: null, reviewedBy: null, createdAt: new Date().toISOString() }, 201))
      }
      throw new Error(`Unexpected request: ${path}`)
    }))
    renderWithClient(<ParkingPage />)

    const map = await screen.findByRole("group", { name: "A区车位图" })
    expect(within(map).getByRole("button", { name: /A-02.*已占用/ })).toBeDisabled()
    expect(within(map).getByRole("button", { name: /A-03.*待审批/ })).toBeDisabled()
    expect(within(map).getByRole("button", { name: /A-04.*已停用/ })).toBeDisabled()
    fireEvent.click(within(map).getByRole("button", { name: /A-01.*空闲/ }))
    fireEvent.change(screen.getByLabelText("车牌号（选填）"), { target: { value: "京A12345" } })
    fireEvent.click(screen.getByRole("button", { name: "提交预约申请" }))

    expect(await screen.findByRole("heading", { name: "申请已提交" })).toBeInTheDocument()
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({ parkingSpaceId: 1, plateNumber: "京A12345", start: "09:00", end: "10:00" })
  })

  it("invalidates a selected position when refreshed occupancy changes", async () => {
    let occupied = false
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve(json(
      String(input).includes("/availability")
        ? { asOf: new Date().toISOString(), spaces: [{ ...spaces[0], availability: occupied ? "OCCUPIED" : "AVAILABLE" }] }
        : [],
    ))))
    renderWithClient(<ParkingPage />)
    fireEvent.click(await screen.findByRole("button", { name: /A-01.*空闲/ }))
    expect(screen.getByRole("button", { name: "提交预约申请" })).toBeEnabled()
    occupied = true
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "刷新车位状态" })) })
    expect(await screen.findByRole("button", { name: /A-01.*已占用/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: "提交预约申请" })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent("A-01")
  })

  it("retains date and time after a server-side reservation conflict", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(json({ code: "PARKING_SLOT_CONFLICT", message: "该时段已被预约" }, 409))
      return Promise.resolve(json(String(input).includes("/availability") ? { asOf: new Date().toISOString(), spaces } : []))
    }))
    renderWithClient(<ParkingPage />)
    fireEvent.change(screen.getByLabelText("预约日期"), { target: { value: "2099-09-05" } })
    fireEvent.change(screen.getByLabelText("预约时段"), { target: { value: "14:00" } })
    fireEvent.click(await screen.findByRole("button", { name: /A-01.*空闲/ }))
    fireEvent.click(screen.getByRole("button", { name: "提交预约申请" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("该时段已被预约")
    expect(screen.getByLabelText("预约日期")).toHaveValue("2099-09-05")
    expect(screen.getByLabelText("预约时段")).toHaveValue("14:00")
  })
})
