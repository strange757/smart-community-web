import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BillsPage } from "@/pages/bills-page"
import { renderWithClient } from "@/test/render"

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: 2, role: "PROPERTY", displayName: "林管家" } }) }))

const bill = { id: 101, type: "物业服务费", period: "2026-09", amount: "268.10", status: "UNPAID", paidAt: null, houseLabel: "8号楼 2单元 801", ownerName: "王晓明、陈雨" }
const payload = {
  items: [bill], total: 21, page: 1, pageSize: 20,
  summary: { unpaidAmount: "5080.40", paidAmount: "310.20", unpaidCount: 19, paidCount: 2 },
  types: ["物业服务费", "水费"], periods: ["2026-09", "2026-08"],
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status === 200 ? { data, requestId: "community-bills" } : { code: "UNAVAILABLE", message: "账单服务暂不可用" }), { status, headers: { "Content-Type": "application/json" } })
}

describe("community billing management", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("shows household bills and totals for the full filter, then loads the next page", async () => {
    const requests: string[] = []
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost")
      requests.push(url.pathname + url.search)
      const page = Number(url.searchParams.get("page"))
      return Promise.resolve(json({ ...payload, page, items: page === 2 ? [{ ...bill, id: 102, ownerName: "李明", houseLabel: "9号楼 1单元 901" }] : [bill] }))
    }))
    renderWithClient(<BillsPage />)
    const table = await screen.findByRole("table", { name: "社区账单" })
    expect(within(table).getByText("王晓明、陈雨")).toBeInTheDocument()
    expect(within(table).getByText("8号楼 2单元 801")).toBeInTheDocument()
    expect(within(table).getByText("¥268.10")).toBeInTheDocument()
    expect(screen.getByText("¥5,080.40")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(await screen.findByText("李明")).toBeInTheDocument()
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
    expect(requests).toEqual(["/api/v1/bills/community?page=1&pageSize=20", "/api/v1/bills/community?page=2&pageSize=20"])
  })

  it("resets pagination when the payment status changes", async () => {
    const queries: URLSearchParams[] = []
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const query = new URL(String(input), "http://localhost").searchParams
      queries.push(query)
      return Promise.resolve(json({ ...payload, page: Number(query.get("page")), items: [{ ...bill, ownerName: query.get("status") === "PAID" ? "已缴住户" : "原始住户" }] }))
    }))
    renderWithClient(<BillsPage />)
    await screen.findByText("原始住户")
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    await screen.findByText("第 2 / 2 页")
    fireEvent.mouseDown(screen.getByRole("tab", { name: "已缴" }), { button: 0, ctrlKey: false })
    expect(await screen.findByText("已缴住户")).toBeInTheDocument()
    expect(queries.at(-1)?.get("status")).toBe("PAID")
    expect(queries.at(-1)?.get("page")).toBe("1")
  })

  it("combines fee, period and household search and clears all filters", async () => {
    const queries: URLSearchParams[] = []
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const query = new URL(String(input), "http://localhost").searchParams
      queries.push(query)
      return Promise.resolve(json({ ...payload, total: 1, items: [{ ...bill, ownerName: query.get("search") === "陈雨" ? "搜索匹配住户" : "全部住户" }] }))
    }))
    renderWithClient(<BillsPage />)
    await screen.findByText("全部住户")
    fireEvent.change(screen.getByRole("combobox", { name: "费用类型" }), { target: { value: "水费" } })
    fireEvent.change(screen.getByRole("combobox", { name: "账期" }), { target: { value: "2026-08" } })
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索房屋或住户" }), { target: { value: " 陈雨 " } })
    fireEvent.click(screen.getByRole("button", { name: "搜索账单" }))
    expect(await screen.findByText("搜索匹配住户")).toBeInTheDocument()
    expect(queries.at(-1)?.get("billType")).toBe("水费")
    expect(queries.at(-1)?.get("period")).toBe("2026-08")
    expect(queries.at(-1)?.get("search")).toBe("陈雨")
    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }))
    expect(await screen.findByText("全部住户")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "费用类型" })).toHaveValue("")
    expect(screen.getByRole("combobox", { name: "账期" })).toHaveValue("")
    expect(screen.getByRole("searchbox", { name: "搜索房屋或住户" })).toHaveValue("")
  })

  it("shows a recoverable loading error without stale totals", async () => {
    let fail = true
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fail ? json(null, 503) : json({ ...payload, total: 0, items: [], summary: { unpaidAmount: "0.00", paidAmount: "0.00", unpaidCount: 0, paidCount: 0 } }))))
    renderWithClient(<BillsPage />)
    expect(await screen.findByRole("alert")).toHaveTextContent("社区账单加载失败")
    expect(screen.queryByText("¥5,080.40")).not.toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(await screen.findByText("没有符合条件的账单")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument())
  })
})
