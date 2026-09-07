import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { sessionKey } from "@/lib/api"
import { AuthProvider, useAuth } from "@/lib/auth"
import { renderWithClient } from "@/test/render"
import { AssistantPage } from "./assistant-page"

const owner = { id: 7, communityId: 1, displayName: "林女士", role: "OWNER", token: "owner-token", expiresInSeconds: 3600 }
const liveStatus = { enabled: true, configured: true, mode: "model", model: "gpt-5-mini", provider: "openai" }
const answer = { answer: "您有一笔物业费待缴。", links: [{ label: "查看账单", path: "/app/bills" }], sources: [{ label: "我的账单", kind: "bills" }], model: "gpt-5-mini", dataAsOf: "2026-09-07T08:00:00Z" }

function json(data: unknown) {
  return new Response(JSON.stringify({ data, requestId: "assistant-test" }), { headers: { "Content-Type": "application/json" } })
}

function setupRequests(respond: (body: { message: string; history: { role: string; content: string }[] }, init?: RequestInit) => Promise<Response> = async () => json(answer), status = liveStatus) {
  const writes: string[] = []
  sessionStorage.setItem(sessionKey, JSON.stringify(owner))
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path.endsWith("/me")) return json(owner)
    if (path.endsWith("/auth/login")) return json({ ...owner, id: 8, token: "next-owner-token" })
    if (path.endsWith("/ai/status")) return json(status)
    if (init?.method === "POST") writes.push(path)
    if (path.endsWith("/ai/assistant")) return respond(JSON.parse(String(init?.body)), init)
    throw new Error(`Unexpected request ${path}`)
  }))
  return writes
}

async function renderAssistant() {
  const view = renderWithClient(<AuthProvider><AssistantPage /></AuthProvider>)
  await waitFor(() => expect(screen.getByLabelText("你的问题")).not.toBeDisabled())
  return view
}

function send(message: string) {
  fireEvent.change(screen.getByLabelText("你的问题"), { target: { value: message } })
  fireEvent.click(screen.getByRole("button", { name: "发送" }))
}

describe("resident community assistant", () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals() })

  it("waits for explicit sending and never submits a community transaction", async () => {
    const writes = setupRequests(async (body) => {
      expect(body).toEqual({ message: "我还有哪些费用未缴？", history: [] })
      return json(answer)
    })
    await renderAssistant()
    fireEvent.click(screen.getByRole("button", { name: "我还有哪些费用未缴？" }))
    expect(screen.getByLabelText("你的问题")).toHaveValue("我还有哪些费用未缴？")
    expect(writes).toEqual([])
    fireEvent.keyDown(screen.getByLabelText("你的问题"), { key: "Enter" })
    expect(writes).toEqual([])
    fireEvent.click(screen.getByRole("button", { name: "发送" }))
    expect(await screen.findByText(answer.answer)).toBeInTheDocument()
    expect(writes).toEqual(["/api/v1/ai/assistant"])
    expect(screen.getByRole("link", { name: "查看账单" })).toHaveAttribute("href", "/app/bills")
    expect(screen.getByText(/数据更新/)).toBeInTheDocument()
    expect(screen.getByLabelText("你的问题")).toHaveValue("")
  })

  it("retains a failed question and retries it without duplicating history", async () => {
    let attempts = 0
    setupRequests(async (body) => {
      expect(body.history).toEqual([])
      attempts += 1
      return attempts === 1 ? new Response(JSON.stringify({ message: "服务暂时繁忙" }), { status: 503 }) : json(answer)
    })
    await renderAssistant()
    send("我的费用")
    expect(await screen.findByRole("alert")).toHaveTextContent("服务暂时繁忙")
    expect(screen.getByLabelText("你的问题")).toHaveValue("我的费用")
    expect(within(screen.getByRole("log")).getAllByText("我的费用")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "重试回答" }))
    expect(await screen.findByText(answer.answer)).toBeInTheDocument()
    expect(within(screen.getByRole("log")).getAllByText("我的费用")).toHaveLength(1)
  })

  it("sends only the latest six completed rounds and bounds the visible conversation", async () => {
    const histories: { role: string; content: string }[][] = []
    setupRequests(async (body) => {
      histories.push(body.history)
      return json({ ...answer, answer: `回答${body.message}` })
    })
    await renderAssistant()
    for (let index = 1; index <= 14; index += 1) {
      send(`问题${index}`)
      await screen.findByText(`回答问题${index}`)
    }
    expect(histories[7]).toEqual([
      { role: "user", content: "问题2" }, { role: "assistant", content: "回答问题2" },
      { role: "user", content: "问题3" }, { role: "assistant", content: "回答问题3" },
      { role: "user", content: "问题4" }, { role: "assistant", content: "回答问题4" },
      { role: "user", content: "问题5" }, { role: "assistant", content: "回答问题5" },
      { role: "user", content: "问题6" }, { role: "assistant", content: "回答问题6" },
      { role: "user", content: "问题7" }, { role: "assistant", content: "回答问题7" },
    ])
    expect(screen.queryByText("回答问题1")).not.toBeInTheDocument()
    expect(within(screen.getByRole("log")).getAllByText(/^回答问题/)).toHaveLength(12)
  })

  it("renders plain text and rejects external, encoded, and non-whitelisted links", async () => {
    const literal = '<img src=x onerror="alert(1)"> [outside](https://example.com)'
    setupRequests(async () => json({ ...answer, answer: literal, links: [
      { label: "有效入口", path: "/app/bills" },
      { label: "外站", path: "https://example.com" },
      { label: "协议相对", path: "//example.com" },
      { label: "脚本", path: "javascript:alert(1)" },
      { label: "管理入口", path: "/app/operations" },
      { label: "编码入口", path: "/app/%62ills" },
      { label: "查询入口", path: "/app/bills?redirect=https://example.com" },
    ] }))
    await renderAssistant()
    send("查费用")
    const log = screen.getByRole("log")
    expect(await within(log).findByText(literal)).toBeInTheDocument()
    expect(log.querySelector("img")).toBeNull()
    expect(within(log).getAllByRole("link")).toHaveLength(1)
    expect(within(log).getByRole("link", { name: "有效入口" })).toHaveAttribute("href", "/app/bills")
  })

  it("aborts generation and ignores a late answer", async () => {
    let resolve!: (response: Response) => void
    let signal: AbortSignal | null | undefined
    setupRequests((_body, init) => {
      signal = init?.signal
      return new Promise((done) => { resolve = done })
    })
    await renderAssistant()
    send("停止测试")
    fireEvent.click(await screen.findByRole("button", { name: "停止生成" }))
    expect(signal?.aborted).toBe(true)
    expect(screen.getByText("已停止生成")).toBeInTheDocument()
    expect(screen.getByLabelText("你的问题")).toHaveValue("停止测试")
    await act(async () => { resolve(json(answer)) })
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument()
  })

  it("aborts the request when leaving the page", async () => {
    let signal: AbortSignal | null | undefined
    setupRequests((_body, init) => { signal = init?.signal; return new Promise(() => {}) })
    const view = await renderAssistant()
    send("离页测试")
    await screen.findByRole("button", { name: "停止生成" })
    view.unmount()
    expect(signal?.aborted).toBe(true)
  })

  it("clears the conversation and excludes old answers from subsequent requests", async () => {
    const histories: unknown[] = []
    setupRequests(async (body) => { histories.push(body.history); return json(answer) })
    await renderAssistant()
    send("第一问")
    await screen.findByText(answer.answer)
    fireEvent.click(screen.getByRole("button", { name: "清空对话" }))
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument()
    expect(screen.queryByText(/数据更新/)).not.toBeInTheDocument()
    send("新问题")
    await screen.findByText(answer.answer)
    expect(histories).toEqual([[], []])
  })

  it("keeps function lookup available without AI requests when the model is disabled", async () => {
    const writes = setupRequests(undefined, { ...liveStatus, enabled: false, configured: false, mode: "disabled", model: "" })
    renderWithClient(<AuthProvider><AssistantPage /></AuthProvider>)
    expect(await screen.findByText("智能问答未启用")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled()
    fireEvent.mouseDown(screen.getByRole("tab", { name: "功能查询" }), { button: 0, ctrlKey: false })
    const panel = screen.getByRole("tabpanel", { name: "功能查询" })
    expect(within(panel).getAllByRole("link")).toHaveLength(6)
    fireEvent.change(within(panel).getByRole("searchbox"), { target: { value: "车位" } })
    expect(within(panel).getAllByRole("link")).toHaveLength(1)
    expect(within(panel).getByRole("link", { name: /车位/ })).toHaveAttribute("href", "/app/parking")
    expect(writes).toEqual([])
  })

  it("labels mock responses as demonstrations instead of claiming GPT", async () => {
    setupRequests(async () => json({ ...answer, model: "mock" }), { ...liveStatus, mode: "mock", model: "mock" })
    await renderAssistant()
    expect(screen.getByText("演示模式（非 GPT）")).toBeInTheDocument()
    send("查费用")
    await screen.findByText(answer.answer)
    expect(screen.queryByText("gpt-5-mini")).not.toBeInTheDocument()
  })

  it("does not send blank or over-limit questions", async () => {
    const writes = setupRequests()
    await renderAssistant()
    fireEvent.change(screen.getByLabelText("你的问题"), { target: { value: "  \n  " } })
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText("你的问题").closest("form")!)
    fireEvent.change(screen.getByLabelText("你的问题"), { target: { value: "字".repeat(2001) } })
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText("你的问题").closest("form")!)
    expect(writes).toEqual([])
  })

  it("prevents requests when the enabled model has not been configured", async () => {
    const writes = setupRequests(undefined, { ...liveStatus, configured: false })
    renderWithClient(<AuthProvider><AssistantPage /></AuthProvider>)
    expect(await screen.findByText("智能问答尚未配置")).toBeInTheDocument()
    expect(screen.getByLabelText("你的问题")).toBeDisabled()
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled()
    expect(writes).toEqual([])
  })

  it("omits failed questions when a different question is sent", async () => {
    const histories: unknown[] = []
    setupRequests(async (body) => {
      histories.push(body.history)
      return body.message === "失败问题" ? new Response(JSON.stringify({ message: "暂不可用" }), { status: 503 }) : json(answer)
    })
    await renderAssistant()
    send("成功问题")
    await screen.findByText(answer.answer)
    send("失败问题")
    await screen.findByRole("alert")
    send("另一问题")
    await waitFor(() => expect(screen.getAllByText(answer.answer)).toHaveLength(2))
    expect(histories[2]).toEqual([{ role: "user", content: "成功问题" }, { role: "assistant", content: "您有一笔物业费待缴。" }])
  })

  it("rejects oversized answers and retains the question", async () => {
    setupRequests(async () => json({ ...answer, answer: "字".repeat(8001) }))
    await renderAssistant()
    send("长度测试")
    expect(await screen.findByRole("alert")).toHaveTextContent("回答格式异常")
    expect(screen.getByLabelText("你的问题")).toHaveValue("长度测试")
    expect(screen.getByLabelText("你的问题")).toHaveAttribute("maxlength", "2000")
  })

  it("discards the prior conversation and pending response when the account changes", async () => {
    let resolve!: (response: Response) => void
    let signal: AbortSignal | null | undefined
    setupRequests((_body, init) => { signal = init?.signal; return new Promise((done) => { resolve = done }) })
    function SwitchAccount() {
      const { login } = useAuth()
      return <><button onClick={() => void login("next", "password")}>切换账户</button><AssistantPage /></>
    }
    renderWithClient(<AuthProvider><SwitchAccount /></AuthProvider>)
    await waitFor(() => expect(screen.getByLabelText("你的问题")).not.toBeDisabled())
    send("前一个账户的问题")
    await screen.findByRole("button", { name: "停止生成" })
    fireEvent.click(screen.getByRole("button", { name: "切换账户" }))
    await waitFor(() => expect(signal?.aborted).toBe(true))
    await act(async () => { resolve(json(answer)) })
    expect(screen.queryByText("前一个账户的问题")).not.toBeInTheDocument()
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument()
    expect(screen.getByLabelText("你的问题")).toHaveValue("")
  })
})
