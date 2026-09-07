import { fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BillsPage } from "@/pages/bills-page"
import { renderWithClient } from "@/test/render"

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: 1, role: "OWNER", displayName: "张三" } }) }))

function json(data: unknown) {
  return new Response(JSON.stringify({ data, requestId: "owner-bills" }), { status: 200, headers: { "Content-Type": "application/json" } })
}

describe("owner household bills", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("identifies the house in the list and bill detail and pages through many bills", async () => {
    const bills = Array.from({ length: 21 }, (_, index) => ({ id: index + 1, type: "物业服务费", period: "2026-09", amount: "268.10", status: "UNPAID", paidAt: null, houseId: index + 1, houseLabel: `${index + 1}号楼 1单元 101` }))
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(json(bills))))
    renderWithClient(<BillsPage />)
    const firstBill = await screen.findByRole("button", { name: "查看账单：物业服务费 1号楼 1单元 101 2026-09" })
    expect(within(firstBill).getByText("1号楼 1单元 101")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /查看账单/ })).toHaveLength(20)
    fireEvent.click(firstBill)
    const detail = screen.getByRole("dialog", { name: "物业服务费" })
    expect(within(detail).getByText("1号楼 1单元 101")).toBeInTheDocument()
    fireEvent.keyDown(detail, { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(screen.getByRole("button", { name: "查看账单：物业服务费 21号楼 1单元 101 2026-09" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /查看账单/ })).toHaveLength(1)
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
  })

  it("resets the owner list page when changing payment status", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const status = new URL(String(input), "http://localhost").searchParams.get("status")
      return Promise.resolve(json(Array.from({ length: status === "PAID" ? 1 : 21 }, (_, index) => ({ id: index + 1, type: status === "PAID" ? "已缴水费" : "物业服务费", period: "2026-09", amount: "30.00", status, paidAt: null, houseId: 1, houseLabel: "1号楼 1单元 101" }))))
    }))
    renderWithClient(<BillsPage />)
    await screen.findByText("第 1 / 2 页")
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole("tab", { name: "已缴" }), { button: 0, ctrlKey: false })
    expect(await screen.findByText("已缴水费")).toBeInTheDocument()
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
  })
})
