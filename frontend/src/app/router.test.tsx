import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { defaultRouteForRole, RoleRouteGuard } from "./router"

describe("role-aware routing", () => {
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
})
