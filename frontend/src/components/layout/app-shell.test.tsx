import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { AppShell, navForRole } from "./app-shell"

describe("role navigation", () => {
  it("keeps the owner navigation focused on daily services", () => {
    expect(navForRole("OWNER")).toEqual(["首页", "社区服务", "我的进度", "消息", "我的"])
  })

  it("gives property staff an operations workspace", () => {
    expect(navForRole("PROPERTY")).toEqual(["运营首页", "报修工单", "社区公告", "账单管理", "我的"])
  })

  it("shows maintenance staff only the work they need", () => {
    expect(navForRole("MAINTENANCE")).toEqual(["我的工单", "处理中", "消息", "我的"])
  })
})

describe("app shell accessibility", () => {
  it("opens a named search dialog from the icon action", async () => {
    render(
      <MemoryRouter>
        <AppShell
          user={{
            token: "session-token",
            expiresInSeconds: 3600,
            id: 7,
            displayName: "林女士",
            role: "OWNER",
            communityId: 12,
          }}
          onLogout={() => undefined}
        >
          <p>页面内容</p>
        </AppShell>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByRole("dialog", { name: "搜索社区内容" })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "搜索社区内容" })).toHaveFocus()
  })

  it("marks only the filtered maintenance work-order link as current", () => {
    render(
      <MemoryRouter initialEntries={["/app/work-orders?status=IN_PROGRESS"]}>
        <AppShell
          user={{
            token: "session-token",
            expiresInSeconds: 3600,
            id: 9,
            displayName: "陈师傅",
            role: "MAINTENANCE",
            communityId: 12,
          }}
          onLogout={() => undefined}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole("link", { name: "我的工单" })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("link", { name: "处理中" })).toHaveAttribute("aria-current", "page")
  })
})
