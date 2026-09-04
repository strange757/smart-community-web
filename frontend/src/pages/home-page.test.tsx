import { screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithClient } from "@/test/render"
import { HomePage, OWNER_HOME_LIMITS } from "./home-page"

function json(data: unknown) {
  return new Response(JSON.stringify({ data, requestId: "req-home" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("owner home information density", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("limits the first screen to three services, one active item, and one notice", () => {
    expect(OWNER_HOME_LIMITS).toEqual({ services: 3, activeItems: 1, notices: 1 })
  })

  it("renders only three service actions, one active item, and one latest notice", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      if (path.includes("/repairs")) {
        return Promise.resolve(json([
          { id: 1, communityId: 1, houseId: 1, creatorId: 1, assigneeId: null, category: "公共设施", description: "楼道灯不亮", priority: "NORMAL", status: "SUBMITTED", rating: null, ratingComment: null, createdAt: "2026-09-04T08:00:00Z", events: [] },
          { id: 2, communityId: 1, houseId: 1, creatorId: 1, assigneeId: 3, category: "水电维修", description: "水龙头漏水", priority: "URGENT", status: "ASSIGNED", rating: null, ratingComment: null, createdAt: "2026-09-03T08:00:00Z", events: [] },
        ]))
      }
      return Promise.resolve(json([
        { id: 2, communityId: 1, title: "电梯维护", content: "今晚维护", status: "PUBLISHED", publishedAt: "2026-09-04T08:00:00Z", publisherId: 2 },
        { id: 1, communityId: 1, title: "花园开放", content: "周六开放", status: "PUBLISHED", publishedAt: "2026-09-03T08:00:00Z", publisherId: 2 },
      ]))
    }))

    renderWithClient(<HomePage />)

    expect(await screen.findByText("公共设施")).toBeInTheDocument()
    expect(screen.getAllByTestId("home-service")).toHaveLength(3)
    expect(screen.getAllByTestId("home-active-item")).toHaveLength(1)
    expect(screen.getAllByTestId("home-notice")).toHaveLength(1)
    expect(screen.queryByText("水电维修")).not.toBeInTheDocument()
    expect(screen.queryByText("花园开放")).not.toBeInTheDocument()
  })

  it("does not expose property analytics on the owner home", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])))
    renderWithClient(<HomePage />)
    expect(screen.queryByText("运营数据")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "今天想做什么？" })).toBeInTheDocument()
  })
})
