import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, sessionKey } from "@/lib/api"
import { AuthProvider, useAuth } from "@/lib/auth"
import type { UserSession } from "@/lib/types"

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

    render(<AuthProvider><AuthProbe /></AuthProvider>)

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

    render(<AuthProvider><AuthProbe /></AuthProvider>)

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

    render(<AuthProvider><AuthenticatedRequestProbe /></AuthProvider>)
    expect(await screen.findByText("新姓名")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "加载报修" }))

    await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument())
    expect(sessionStorage.getItem(sessionKey)).toBeNull()
  })
})
