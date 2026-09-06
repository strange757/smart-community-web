import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RepairCreateDialog } from "@/features/repairs/repair-create-dialog"
import { sessionKey } from "@/lib/api"
import { AuthProvider } from "@/lib/auth"
import { NoticesPage } from "@/pages/notices-page"
import { renderWithClient } from "@/test/render"

function json(data: unknown) {
  return new Response(JSON.stringify({ data, requestId: "ai-test" }), { headers: { "Content-Type": "application/json" } })
}

const suggestion = {
  category: "水电维修", priority: "NORMAL", description: "厨房水龙头持续漏水，关闭阀门后仍有渗漏。", missingInfo: ["何时开始漏水？"],
}

function repairRequests(aiResponse: () => Promise<Response>, writes: string[] = []) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path.endsWith("/me/houses")) return Promise.resolve(json([{ id: 1, communityId: 1, building: "1号楼", unit: "1单元", roomNo: "101", area: "89.50" }]))
    if (path.endsWith("/ai/repair-draft")) {
      expect(JSON.parse(String(init?.body))).toEqual({ description: "水龙头漏水关不住" })
      return aiResponse()
    }
    if (init?.method === "POST") writes.push(path)
    throw new Error(`Unexpected request ${path}`)
  }))
}

describe("AI form assistance", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals() })

  it("previews a repair suggestion and fills it only on explicit acceptance, without submitting", async () => {
    const writes: string[] = []
    repairRequests(() => Promise.resolve(json(suggestion)), writes)
    renderWithClient(<RepairCreateDialog open onOpenChange={() => {}} />)
    const description = await screen.findByLabelText("问题描述")
    fireEvent.change(description, { target: { value: "水龙头漏水关不住" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    const preview = await screen.findByRole("region", { name: "AI 建议" })
    expect(within(preview).getByText(suggestion.description)).toBeInTheDocument()
    expect(description).toHaveValue("水龙头漏水关不住")
    expect(screen.getByLabelText("类型")).toHaveValue("公共设施")
    fireEvent.click(within(preview).getByRole("button", { name: "采用建议" }))
    expect(description).toHaveValue(suggestion.description)
    expect(screen.getByLabelText("类型")).toHaveValue("水电维修")
    expect(writes).toEqual([])
  })

  it("keeps the repair editable after AI is unavailable and allows a retry", async () => {
    let attempts = 0
    repairRequests(async () => {
      attempts += 1
      if (attempts === 1) return new Response(JSON.stringify({ code: "AI_NOT_CONFIGURED", message: "AI 暂不可用，可继续手动填写", requestId: "ai-disabled" }), { status: 503 })
      return json(suggestion)
    })
    renderWithClient(<RepairCreateDialog open onOpenChange={() => {}} />)
    const description = await screen.findByLabelText("问题描述")
    fireEvent.change(description, { target: { value: "水龙头漏水关不住" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("AI 暂不可用")
    expect(description).toHaveValue("水龙头漏水关不住")
    expect(description).not.toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    expect(await screen.findByRole("region", { name: "AI 建议" })).toBeInTheDocument()
  })

  it("discards a delayed response after the input has changed", async () => {
    let resolveRequest!: (response: Response) => void
    const response = new Promise<Response>((resolve) => { resolveRequest = resolve })
    repairRequests(() => response)
    renderWithClient(<RepairCreateDialog open onOpenChange={() => {}} />)
    const description = await screen.findByLabelText("问题描述")
    fireEvent.change(description, { target: { value: "水龙头漏水关不住" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "正在生成" })).toBeDisabled())
    fireEvent.change(description, { target: { value: "现在改报修卧室的窗户" } })
    await act(async () => { resolveRequest(json(suggestion)); await response })
    expect(description).toHaveValue("现在改报修卧室的窗户")
    expect(screen.queryByRole("region", { name: "AI 建议" })).not.toBeInTheDocument()
  })

  it("does not retain AI suggestions when the repair form is closed and reopened", async () => {
    repairRequests(() => Promise.resolve(json(suggestion)))
    const view = renderWithClient(<RepairCreateDialog open onOpenChange={() => {}} />)
    fireEvent.change(await screen.findByLabelText("问题描述"), { target: { value: "水龙头漏水关不住" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    await screen.findByRole("region", { name: "AI 建议" })
    view.rerender(<RepairCreateDialog open={false} onOpenChange={() => {}} />)
    view.rerender(<RepairCreateDialog open onOpenChange={() => {}} />)
    await screen.findByLabelText("问题描述")
    expect(screen.queryByRole("region", { name: "AI 建议" })).not.toBeInTheDocument()
  })

  it("lets property staff adopt an AI notice draft without creating or publishing it", async () => {
    const user = { id: 2, displayName: "林管家", role: "PROPERTY", communityId: 1, token: "property-token", expiresInSeconds: 3600 }
    sessionStorage.setItem(sessionKey, JSON.stringify(user))
    const writes: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.endsWith("/me")) return json(user)
      if (path.endsWith("/notices") && init?.method !== "POST") return json([])
      if (path.endsWith("/ai/notice-draft")) {
        expect(JSON.parse(String(init?.body))).toEqual({ title: "花园维护", content: "周六上午九点到十点维护花园，暂不开放" })
        return json({ title: "花园维护通知", content: "本周六上午 9:00 至 10:00，花园进行维护，期间暂停开放。", missingInfo: [] })
      }
      if (init?.method === "POST") writes.push(path)
      throw new Error(`Unexpected request ${path}`)
    }))
    renderWithClient(<AuthProvider><NoticesPage /></AuthProvider>)
    fireEvent.click(await screen.findByRole("button", { name: "新建公告" }))
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "花园维护" } })
    fireEvent.change(screen.getByLabelText("内容"), { target: { value: "周六上午九点到十点维护花园，暂不开放" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 拟稿" }))
    const preview = await screen.findByRole("region", { name: "AI 建议" })
    expect(screen.getByLabelText("标题")).toHaveValue("花园维护")
    fireEvent.click(within(preview).getByRole("button", { name: "采用建议" }))
    expect(screen.getByLabelText("标题")).toHaveValue("花园维护通知")
    expect(screen.getByLabelText("内容")).toHaveValue("本周六上午 9:00 至 10:00，花园进行维护，期间暂停开放。")
    expect(writes).toEqual([])
  })
})
