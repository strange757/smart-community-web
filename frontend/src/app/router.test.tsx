import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { sessionKey } from "@/lib/api"
import { AuthProvider } from "@/lib/auth"
import { renderWithClient } from "@/test/render"
import { appRouter, defaultRouteForRole, RoleRouteGuard } from "./router"

describe("role-aware routing", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals() })
  it.each([
    ["OWNER", "/app/home"],
    ["PROPERTY", "/app/operations"],
    ["MAINTENANCE", "/app/work-orders"],
  ] as const)("uses the correct default route for %s", (role, expected) => {
    expect(defaultRouteForRole(role)).toBe(expected)
  })

  it("redirects an owner away from a property-only route", async () => {
    render(
      <MemoryRouter initialEntries={["/app/billing"]}>
        <Routes>
          <Route
            path="/app/billing"
            element={
              <RoleRouteGuard role="OWNER" allowedRoles={["PROPERTY"]}>
                <p>账单管理</p>
              </RoleRouteGuard>
            }
          />
          <Route path="/app/home" element={<p>业主首页</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText("业主首页")).toBeInTheDocument()
    expect(screen.queryByText("账单管理")).not.toBeInTheDocument()
  })

  it.each([
    ["OWNER", "/app/assistant"],
    ["PROPERTY", "/app/operations"],
    ["MAINTENANCE", "/app/work-orders"],
  ] as const)("restricts the registered assistant route for %s", async (role, expectedPath) => {
    const user = { id: 7, communityId: 1, displayName: "测试用户", role, token: "test-token", expiresInSeconds: 3600 }
    sessionStorage.setItem(sessionKey, JSON.stringify(user))
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      const data = path.endsWith("/me") ? user : { enabled: true, configured: true, mode: "model", model: "gpt-5-mini", provider: "openai" }
      return new Response(JSON.stringify({ data, requestId: "assistant-route" }))
    }))
    const app = appRouter.routes.flatMap((route) => route.children ?? []).find((route) => route.path === "/app")
    const assistant = app?.children?.find((route) => route.path === "assistant")
    expect(assistant).toBeDefined()
    function CurrentPath() { return <span data-testid="current-path">{useLocation().pathname}</span> }
    renderWithClient(<AuthProvider>{assistant?.element}<CurrentPath /></AuthProvider>, { route: "/app/assistant" })
    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent(expectedPath))
    if (role === "OWNER") expect(await screen.findByRole("heading", { name: "社区助手" })).toBeInTheDocument()
    else expect(screen.queryByRole("heading", { name: "社区助手" })).not.toBeInTheDocument()
  })
})
