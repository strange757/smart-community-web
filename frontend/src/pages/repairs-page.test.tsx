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
})
