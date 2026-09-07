import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderWithClient } from "@/test/render"
import { ServicesPage } from "./services-page"

describe("community service entry points", () => {
  it("opens the assistant alongside the existing transaction services", () => {
    renderWithClient(<ServicesPage />)
    expect(screen.getByRole("link", { name: /社区助手/ })).toHaveAttribute("href", "/app/assistant")
    expect(screen.getByRole("link", { name: /房屋报修/ })).toHaveAttribute("href", "/app/repairs")
    expect(screen.getByRole("link", { name: /生活缴费/ })).toHaveAttribute("href", "/app/bills")
    expect(screen.getByRole("link", { name: /车位预约/ })).toHaveAttribute("href", "/app/parking")
  })
})
