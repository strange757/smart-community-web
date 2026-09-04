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
})
