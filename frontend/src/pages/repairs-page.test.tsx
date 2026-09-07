import { fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { sessionKey } from "@/lib/api"
import { AuthProvider } from "@/lib/auth"
import type { Repair, UserSession } from "@/lib/types"
import { renderWithClient } from "@/test/render"
import { RepairsPage } from "./repairs-page"

const propertyUser: UserSession = {
  token: "property-token",
  expiresInSeconds: 3600,
  id: 2,
  displayName: "林管家",
  role: "PROPERTY",
  communityId: 1,
}

function json(data: unknown) {
  return new Response(JSON.stringify({ data, requestId: "req-repair" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function repairFixture(id: number, category: string, status: string): Repair {
  return {
    id,
    communityId: 1,
    houseId: 1,
    creatorId: 1,
    assigneeId: status === "IN_PROGRESS" ? 3 : null,
    category,
    description: `${category}的详细描述`,
    priority: "NORMAL",
    status,
    rating: status === "RATED" ? 5 : null,
    ratingComment: null,
    createdAt: "2026-09-04T08:00:00Z",
    events: [],
  }
}

describe("property repair workflow", () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it("opens a sparse row in a detail sheet and assigns a submitted order", async () => {
    sessionStorage.setItem(sessionKey, JSON.stringify(propertyUser))
    let status = "SUBMITTED"
    const repair = (): Repair => ({
      id: 1,
      communityId: 1,
      houseId: 1,
      creatorId: 1,
      assigneeId: status === "ASSIGNED" ? 3 : null,
      category: "公共设施",
      description: "楼道感应灯偶尔不亮",
      priority: "NORMAL",
      status,
      rating: null,
      ratingComment: null,
      createdAt: "2026-09-04T08:00:00Z",
      events: [{ id: 1, actorId: 1, action: "CREATE", fromStatus: null, toStatus: "SUBMITTED", note: "业主提交报修", createdAt: "2026-09-04T08:00:00Z" }],
    })

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.endsWith("/me")) return Promise.resolve(json(propertyUser))
      if (path.includes("/users?role=MAINTENANCE")) return Promise.resolve(json([{ id: 3, displayName: "陈师傅", role: "MAINTENANCE" }]))
      if (path.endsWith("/repairs/1/assign") && init?.method === "POST") {
        status = "ASSIGNED"
        return Promise.resolve(json(repair()))
      }
      if (path.endsWith("/repairs/1")) return Promise.resolve(json(repair()))
      if (path.includes("/repairs")) return Promise.resolve(json([repair()]))
      throw new Error(`Unexpected request: ${path}`)
    }))

    renderWithClient(<AuthProvider><RepairsPage /></AuthProvider>, { route: "/app/repairs" })

    fireEvent.click(await screen.findByRole("button", { name: "查看报修：公共设施" }))
    expect(await screen.findByRole("dialog", { name: "公共设施" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "指派维修人员" }))
    fireEvent.change(await screen.findByLabelText("维修人员"), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "确认指派" }))

    expect(await screen.findByText("已指派")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "指派维修人员" })).not.toBeInTheDocument()
  })

  it("replaces an exact URL status when the user selects broader tabs", async () => {
    sessionStorage.setItem(sessionKey, JSON.stringify(propertyUser))
    const inProgress = repairFixture(1, "处理中工单", "IN_PROGRESS")
    const submitted = repairFixture(2, "待派单工单", "SUBMITTED")
    const rated = repairFixture(3, "已评价工单", "RATED")

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      if (path.endsWith("/me")) return Promise.resolve(json(propertyUser))
      if (path.endsWith("/repairs?status=IN_PROGRESS")) return Promise.resolve(json([inProgress]))
      if (path.endsWith("/repairs")) return Promise.resolve(json([inProgress, submitted, rated]))
      throw new Error(`Unexpected request: ${path}`)
    }))

    renderWithClient(<AuthProvider><RepairsPage /></AuthProvider>, { route: "/app/repairs?status=IN_PROGRESS" })

    expect(await screen.findByRole("button", { name: "查看报修：处理中工单" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "查看报修：待派单工单" })).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole("tab", { name: "全部" }), { button: 0, ctrlKey: false })
    expect(await screen.findByRole("button", { name: "查看报修：待派单工单" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "查看报修：已评价工单" })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole("tab", { name: "已完成" }), { button: 0, ctrlKey: false })
    expect(await screen.findByRole("button", { name: "查看报修：已评价工单" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "查看报修：处理中工单" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "查看报修：待派单工单" })).not.toBeInTheDocument()
  })

  it("pages through a community sized repair list and displays descriptions", async () => {
    sessionStorage.setItem(sessionKey, JSON.stringify(propertyUser))
    const repairs = Array.from({ length: 45 }, (_, index) => repairFixture(index + 1, `维修分类${index + 1}`, "SUBMITTED"))
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve(json(String(input).endsWith("/me") ? propertyUser : repairs))))
    renderWithClient(<AuthProvider><RepairsPage /></AuthProvider>)
    expect(await screen.findByText("维修分类1的详细描述")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /查看报修/ })).toHaveLength(20)
    expect(screen.queryByRole("button", { name: "查看报修：维修分类21" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(screen.getByText("第 2 / 3 页")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "查看报修：维修分类21" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(screen.getAllByRole("button", { name: /查看报修/ })).toHaveLength(5)
    expect(screen.getByText("共 45 条工单")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "上一页" }))
    expect(screen.getByText("第 2 / 3 页")).toBeInTheDocument()
  })

  it("searches IDs, categories and descriptions and returns to page one", async () => {
    sessionStorage.setItem(sessionKey, JSON.stringify(propertyUser))
    const repairs = Array.from({ length: 42 }, (_, index) => repairFixture(index + 1, "公共设施", "SUBMITTED"))
    repairs[41] = { ...repairs[41], category: "电梯维修", description: "东门电梯按钮失灵" }
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve(json(String(input).endsWith("/me") ? propertyUser : repairs))))
    renderWithClient(<AuthProvider><RepairsPage /></AuthProvider>)
    await screen.findByText("第 1 / 3 页")
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    const search = screen.getByRole("searchbox", { name: "搜索工单编号、类型或描述" })
    for (const term of [" #42 ", "电梯维修", "按钮失灵"]) {
      fireEvent.change(search, { target: { value: term } })
      expect(screen.getByRole("button", { name: "查看报修：电梯维修" })).toBeInTheDocument()
      expect(screen.getAllByRole("button", { name: /查看报修/ })).toHaveLength(1)
      expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument()
    }
    fireEvent.change(search, { target: { value: "" } })
    expect(screen.getByText("第 1 / 3 页")).toBeInTheDocument()
    fireEvent.change(search, { target: { value: "不存在的描述" } })
    expect(screen.getByText("没有符合筛选的工单")).toBeInTheDocument()
    expect(screen.getByText("共 0 条工单")).toBeInTheDocument()
  })

  it("resets pagination for priority and status filters while keeping their intersection", async () => {
    sessionStorage.setItem(sessionKey, JSON.stringify(propertyUser))
    const repairs = Array.from({ length: 60 }, (_, index) => ({ ...repairFixture(index + 1, `维修分类${index + 1}`, index >= 50 ? "RATED" : "SUBMITTED"), priority: index >= 20 ? "URGENT" : "NORMAL" }))
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve(json(String(input).endsWith("/me") ? propertyUser : repairs))))
    renderWithClient(<AuthProvider><RepairsPage /></AuthProvider>)
    await screen.findByText("第 1 / 3 页")
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    fireEvent.change(screen.getByLabelText("优先级"), { target: { value: "URGENT" } })
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument()
    expect(screen.getByText("共 40 条工单")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    fireEvent.mouseDown(screen.getByRole("tab", { name: "已完成" }), { button: 0, ctrlKey: false })
    expect(await screen.findByText("共 10 条工单")).toBeInTheDocument()
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument()
    expect(screen.getByLabelText("优先级")).toHaveValue("URGENT")
    expect(screen.getAllByRole("button", { name: /查看报修/ })).toHaveLength(10)
  })
})
