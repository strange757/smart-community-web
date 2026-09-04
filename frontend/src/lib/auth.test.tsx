import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useQuery } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppProviders } from "@/app/providers"
import { api, sessionKey } from "@/lib/api"
import { AuthProvider, useAuth } from "@/lib/auth"
import { queryKeys } from "@/lib/query-keys"
import type { Repair, UserSession } from "@/lib/types"

const storedUser: UserSession = {
  token: "stored-token",
  expiresInSeconds: 3600,
  id: 3,
  displayName: "旧姓名",
  role: "OWNER",
  communityId: 8,
}

function AuthProbe() {
  const { user } = useAuth()
  return <p>{user?.displayName ?? "anonymous"}</p>
}

function AuthenticatedRequestProbe() {
  const { user } = useAuth()
  return (
    <div>
      <p>{user?.displayName ?? "anonymous"}</p>
      <button type="button" onClick={() => void api.get("/repairs").catch(() => undefined)}>
        加载报修
      </button>
    </div>
  )
}

describe("session restoration", () => {
  beforeEach(() => {
    sessionStorage.setItem(sessionKey, JSON.stringify(storedUser))
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it("refreshes user fields through /me while retaining the stored token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: 3,
        displayName: "新姓名",
        role: "PROPERTY",
        communityId: 9,
      },
      requestId: "req-restore",
    }), { status: 200, headers: { "Content-Type": "application/json" } })))

    render(<AppProviders><AuthProbe /></AppProviders>)

    expect(await screen.findByText("新姓名")).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem(sessionKey) ?? "null")).toEqual({
      token: "stored-token",
      expiresInSeconds: 3600,
      id: 3,
      displayName: "新姓名",
      role: "PROPERTY",
      communityId: 9,
    })
  })

  it("clears an expired session when restoration is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "UNAUTHORIZED",
      message: "登录已过期",
      requestId: "req-expired",
    }), { status: 401, headers: { "Content-Type": "application/json" } })))

    render(<AppProviders><AuthProbe /></AppProviders>)

    await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument())
    expect(sessionStorage.getItem(sessionKey)).toBeNull()
  })

  it("becomes anonymous when a request after restoration receives 401", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          id: 3,
          displayName: "新姓名",
          role: "OWNER",
          communityId: 8,
        },
        requestId: "req-restore",
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: "UNAUTHORIZED",
        message: "登录已过期",
        requestId: "req-after-restore",
      }), { status: 401, headers: { "Content-Type": "application/json" } })))

    render(<AppProviders><AuthenticatedRequestProbe /></AppProviders>)
    expect(await screen.findByText("新姓名")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "加载报修" }))

    await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument())
    expect(sessionStorage.getItem(sessionKey)).toBeNull()
  })
})

function ProtectedRepairList() {
  const repairs = useQuery({
    queryKey: queryKeys.repairs("role-switch"),
    queryFn: () => api.get<Repair[]>("/repairs"),
  })
  if (repairs.isPending) return <p>正在加载当前工单</p>
  return <ul>{repairs.data?.map((repair) => <li key={repair.id}>{repair.category}</li>)}</ul>
}

function RoleSwitchProbe() {
  const { login, logout, user } = useAuth()
  if (!user) {
    return (
      <div>
        <button type="button" onClick={() => void login("property", "123456")}>登录物业</button>
        <button type="button" onClick={() => void login("maintenance", "123456")}>登录维修</button>
      </div>
    )
  }
  return (
    <div>
      <p>当前角色：{user.role}</p>
      <button type="button" onClick={logout}>退出登录</button>
      <ProtectedRepairList />
    </div>
  )
}

describe("authenticated query ownership", () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it("does not reuse property repair data after logout and maintenance login", async () => {
    const propertySession: UserSession = {
      token: "property-token",
      expiresInSeconds: 3600,
      id: 2,
      displayName: "林管家",
      role: "PROPERTY",
      communityId: 1,
    }
    const maintenanceSession: UserSession = {
      token: "maintenance-token",
      expiresInSeconds: 3600,
      id: 3,
      displayName: "陈师傅",
      role: "MAINTENANCE",
      communityId: 1,
    }
    let activeRole: UserSession["role"] | null = null
    let resolveMaintenanceRepairs!: (response: Response) => void
    const maintenanceRepairs = new Promise<Response>((resolve) => {
      resolveMaintenanceRepairs = resolve
    })

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.endsWith("/auth/login")) {
        const credentials = JSON.parse(String(init?.body)) as { username: string }
        const session = credentials.username === "property" ? propertySession : maintenanceSession
        activeRole = session.role
        return Promise.resolve(new Response(JSON.stringify({ data: session, requestId: "req-login" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }))
      }
      if (path.endsWith("/repairs") && activeRole === "PROPERTY") {
        return Promise.resolve(new Response(JSON.stringify({
          data: [{
            id: 81,
            communityId: 1,
            houseId: 1,
            creatorId: 1,
            assigneeId: null,
            category: "物业可见的未派单工单",
            description: "仅物业当前可见",
            priority: "NORMAL",
            status: "SUBMITTED",
            rating: null,
            ratingComment: null,
            createdAt: "2026-09-04T08:00:00Z",
            events: [],
          }],
          requestId: "req-property-repairs",
        }), { status: 200, headers: { "Content-Type": "application/json" } }))
      }
      if (path.endsWith("/repairs") && activeRole === "MAINTENANCE") return maintenanceRepairs
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<AppProviders><RoleSwitchProbe /></AppProviders>)
    fireEvent.click(screen.getByRole("button", { name: "登录物业" }))
    expect(await screen.findByText("物业可见的未派单工单")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }))
    expect(await screen.findByRole("button", { name: "登录维修" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "登录维修" }))
    expect(await screen.findByText("当前角色：MAINTENANCE")).toBeInTheDocument()
    expect(screen.queryByText("物业可见的未派单工单")).not.toBeInTheDocument()

    resolveMaintenanceRepairs(new Response(JSON.stringify({
      data: [{
        id: 82,
        communityId: 1,
        houseId: 1,
        creatorId: 1,
        assigneeId: 3,
        category: "维修人员自己的工单",
        description: "已指派给当前维修人员",
        priority: "NORMAL",
        status: "ASSIGNED",
        rating: null,
        ratingComment: null,
        createdAt: "2026-09-04T08:30:00Z",
        events: [],
      }],
      requestId: "req-maintenance-repairs",
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
    expect(await screen.findByText("维修人员自己的工单")).toBeInTheDocument()
  })
})
