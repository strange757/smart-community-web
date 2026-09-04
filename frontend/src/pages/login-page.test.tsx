import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppProviders } from "@/app/providers"
import { LoginPage } from "./login-page"

function loginResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400
    ? { data, requestId: "req-login" }
    : { code: "AUTH_INVALID", message: "账号或密码错误", requestId: "req-login" }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function renderLogin() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app/operations" element={<p>物业工作台</p>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
}

describe("login form", () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it("disables submission while signing in and redirects by returned role", async () => {
    let finishLogin!: (value: Response) => void
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      finishLogin = resolve
    })))
    renderLogin()

    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "property" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(screen.getByRole("button", { name: "正在登录" })).toBeDisabled()
    finishLogin(loginResponse({ token: "token", expiresInSeconds: 3600, id: 2, displayName: "林管家", role: "PROPERTY", communityId: 1 }))
    expect(await screen.findByText("物业工作台")).toBeInTheDocument()
  })

  it("keeps the form available and shows the API message after a rejected login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(loginResponse(null, 401)))
    renderLogin()

    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "owner" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("账号或密码错误")
    expect(screen.getByRole("button", { name: "登录" })).toBeEnabled()
  })
})
