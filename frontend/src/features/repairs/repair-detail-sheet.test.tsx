import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RepairDetailSheet } from "@/features/repairs/repair-detail-sheet"
import type { Repair } from "@/lib/types"
import { renderWithClient } from "@/test/render"


function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400
    ? { data, requestId: "req-repair-detail" }
    : { code: "REPAIR_INVALID_TRANSITION", message: data, requestId: "req-repair-detail" }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function repairFixture(id: number, category: string, status: string): Repair {
  return {
    id,
    communityId: 1,
    houseId: 1,
    creatorId: 1,
    assigneeId: status === "IN_PROGRESS" || status === "COMPLETED" ? 3 : null,
    category,
    description: `${category}的说明`,
    priority: "NORMAL",
    status,
    rating: null,
    ratingComment: null,
    createdAt: "2026-09-04T08:00:00Z",
    events: [],
  }
}

describe("repair detail local state", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("clears a failed completion and draft note when switching repairs", async () => {
    const first = repairFixture(1, "第一单", "IN_PROGRESS")
    let second = repairFixture(2, "第二单", "IN_PROGRESS")
    let secondCompletionNote = ""
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.endsWith("/repairs/1/complete")) return Promise.resolve(json("第一单状态已变化", 409))
      if (path.endsWith("/repairs/2/complete")) {
        const body = JSON.parse(String(init?.body)) as { note: string }
        secondCompletionNote = body.note
        second = {
          ...second,
          status: "COMPLETED",
          events: [{
            id: 9,
            actorId: 3,
            action: "COMPLETE",
            fromStatus: "IN_PROGRESS",
            toStatus: "COMPLETED",
            note: body.note,
            createdAt: "2026-09-04T09:00:00Z",
          }],
        }
        return Promise.resolve(json(second))
      }
      if (path.endsWith("/repairs/1")) return Promise.resolve(json(first))
      if (path.endsWith("/repairs/2")) return Promise.resolve(json(second))
      throw new Error(`Unexpected request: ${path}`)
    }))

    const view = renderWithClient(
      <RepairDetailSheet repairId={1} role="MAINTENANCE" onOpenChange={() => undefined} />,
    )
    expect(await screen.findByRole("dialog", { name: "第一单" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "完成工单" }))
    fireEvent.change(await screen.findByLabelText("完成说明"), { target: { value: "只属于第一单的说明" } })
    fireEvent.click(screen.getByRole("button", { name: "确认完成" }))
    expect((await screen.findAllByText("第一单状态已变化")).length).toBeGreaterThan(0)

    view.rerender(<RepairDetailSheet repairId={2} role="MAINTENANCE" onOpenChange={() => undefined} />)
    expect(await screen.findByRole("dialog", { name: "第二单" })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText("第一单状态已变化")).not.toBeInTheDocument())
    expect(screen.queryByRole("dialog", { name: "完成工单" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "完成工单" }))
    expect(await screen.findByLabelText("完成说明")).toHaveValue("维修完成")
    fireEvent.click(screen.getByRole("button", { name: "确认完成" }))
    await waitFor(() => expect(secondCompletionNote).toBe("维修完成"))
  })

  it("resets rating fields and nested dialogs when the sheet closes and reopens", async () => {
    const repair = repairFixture(3, "待评价工单", "CONFIRMED")
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/repairs/3")) return Promise.resolve(json(repair))
      throw new Error(`Unexpected request: ${String(input)}`)
    }))

    const view = renderWithClient(
      <RepairDetailSheet repairId={3} role="OWNER" onOpenChange={() => undefined} />,
    )
    expect(await screen.findByRole("dialog", { name: "待评价工单" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "评价服务" }))
    fireEvent.change(await screen.findByLabelText("评分"), { target: { value: "2" } })
    fireEvent.change(screen.getByLabelText("评价内容（选填）"), { target: { value: "第一轮草稿" } })

    view.rerender(<RepairDetailSheet repairId={null} role="OWNER" onOpenChange={() => undefined} />)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "评价维修服务" })).not.toBeInTheDocument())
    view.rerender(<RepairDetailSheet repairId={3} role="OWNER" onOpenChange={() => undefined} />)
    expect(await screen.findByRole("dialog", { name: "待评价工单" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "评价服务" }))

    expect(await screen.findByLabelText("评分")).toHaveValue("5")
    expect(screen.getByLabelText("评价内容（选填）")).toHaveValue("")
  })
})
