import { useQuery } from "@tanstack/react-query"
import { ArrowRight, ChevronRight, LoaderCircle, MessageSquare, RotateCcw, Search, Send, Square, Trash2 } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { PageHeader } from "@/components/page-kit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { assistantDataTime, assistantServices, parseAssistantReply, suggestedQuestions } from "@/features/ai/assistant-data"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { AssistantHistoryMessage, AssistantReply, AssistantStatus, UserSession } from "@/lib/types"

import "@/features/ai/assistant-page.css"

interface ConversationTurn {
  id: string
  question: string
  state: "pending" | "complete" | "failed" | "stopped"
  reply?: AssistantReply
  error?: string
}

function FunctionDirectory() {
  const [search, setSearch] = useState("")
  const term = search.trim().toLocaleLowerCase()
  const services = assistantServices.filter((service) => `${service.title} ${service.detail} ${service.keywords}`.toLocaleLowerCase().includes(term))
  return (
    <div className="assistant-directory">
      <div className="assistant-search">
        <Search aria-hidden="true" size={18} />
        <Input type="search" aria-label="搜索社区服务" placeholder="搜索社区服务" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="assistant-service-list">
        {services.map(({ title, detail, path, icon: Icon }) => (
          <Link key={path} to={path} className="assistant-service">
            <span className="assistant-service-icon"><Icon aria-hidden="true" size={20} /></span>
            <span className="row-copy"><strong>{title}</strong><small>{detail}</small></span>
            <ChevronRight aria-hidden="true" size={18} />
          </Link>
        ))}
        {!services.length ? <p className="assistant-empty-result" role="status">没有匹配的服务</p> : null}
      </div>
    </div>
  )
}

function AssistantWorkspace({ user }: { user: UserSession }) {
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [draft, setDraft] = useState("")
  const activeRequest = useRef<{ controller: AbortController; id: string; question: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const status = useQuery({
    queryKey: ["ai", "assistant-status", user.communityId, user.id],
    queryFn: () => api.get<AssistantStatus>("/ai/status"),
    retry: false,
    gcTime: 0,
    staleTime: 30000,
  })
  const pending = turns.some((turn) => turn.state === "pending")
  const canAsk = status.data?.enabled === true && (
    status.data.mode === "mock" || (status.data.mode === "model" && status.data.configured === true)
  )
  const latestReply = [...turns].reverse().find((turn) => turn.reply)?.reply
  const modelLabel = status.isPending ? "正在连接" : status.isError ? "连接暂不可用"
    : status.data?.mode === "mock" ? "演示模式（非 GPT）"
      : !status.data?.enabled || status.data.mode === "disabled" ? "智能问答未启用"
        : !status.data.configured ? "智能问答尚未配置"
          : latestReply?.model ?? status.data.model ?? "智能问答"

  useEffect(() => () => {
    activeRequest.current?.controller.abort()
    activeRequest.current = null
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [turns])

  async function ask(question: string, retryId?: string) {
    const message = question.trim()
    if (!canAsk || !message || message.length > 2000 || activeRequest.current) return
    const history: AssistantHistoryMessage[] = turns
      .filter((turn) => turn.state === "complete" && turn.reply && turn.id !== retryId)
      .slice(-6)
      .flatMap((turn) => [
        { role: "user" as const, content: turn.question },
        { role: "assistant" as const, content: turn.reply!.answer },
      ])
    const id = retryId ?? crypto.randomUUID()
    const controller = new AbortController()
    activeRequest.current = { controller, id, question: message }
    const next: ConversationTurn = { id, question: message, state: "pending" }
    setTurns((previous) => (retryId ? previous.map((turn) => turn.id === id ? next : turn) : [...previous, next]).slice(-12))
    setDraft("")

    try {
      const data = await api.post<unknown>("/ai/assistant", { message, history }, undefined, controller.signal)
      if (controller.signal.aborted || activeRequest.current?.controller !== controller) return
      const reply = parseAssistantReply(data)
      setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, state: "complete", reply } : turn))
    } catch (error) {
      if (controller.signal.aborted || activeRequest.current?.controller !== controller) return
      const messageText = error instanceof Error ? error.message.slice(0, 400) : "回答暂时不可用，请重试"
      setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, state: "failed", error: messageText } : turn))
      setDraft(message)
    } finally {
      if (activeRequest.current?.controller === controller) activeRequest.current = null
    }
  }

  function stop() {
    const request = activeRequest.current
    if (!request) return
    request.controller.abort()
    activeRequest.current = null
    setTurns((previous) => previous.map((turn) => turn.id === request.id ? { ...turn, state: "stopped" } : turn))
    setDraft(request.question)
  }

  function clear() {
    activeRequest.current?.controller.abort()
    activeRequest.current = null
    setTurns([])
    setDraft("")
    inputRef.current?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const last = turns[turns.length - 1]
    const retryId = last && (last.state === "failed" || last.state === "stopped") && last.question === draft.trim() ? last.id : undefined
    void ask(draft, retryId)
  }

  return (
    <section className="page-section assistant-page">
      <PageHeader title="社区助手" />
      <Tabs defaultValue="chat">
        <TabsList aria-label="社区助手视图">
          <TabsTrigger value="chat">智能问答</TabsTrigger>
          <TabsTrigger value="directory">功能查询</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="assistant-chat">
          <div className="assistant-toolbar">
            <div className="assistant-connection">
              <Badge variant={status.data?.mode === "mock" ? "warning" : canAsk ? "success" : "default"}>{modelLabel}</Badge>
              {latestReply ? <span>数据更新 {assistantDataTime(latestReply.dataAsOf)}</span> : null}
            </div>
            <div className="assistant-tools">
              {status.isError ? <Button variant="ghost" size="icon" title="重新连接" aria-label="重新连接" onClick={() => void status.refetch()}><RotateCcw aria-hidden="true" size={17} /></Button> : null}
              <Button variant="ghost" size="icon" title="清空对话" aria-label="清空对话" disabled={!turns.length && !draft} onClick={clear}><Trash2 aria-hidden="true" size={17} /></Button>
            </div>
          </div>
          <div className="assistant-log" role="log" aria-label="问答记录" aria-live="polite" ref={logRef}>
            {!turns.length ? (
              <div className="assistant-welcome">
                <MessageSquare aria-hidden="true" size={26} />
                <h2>常用问题</h2>
                <div className="assistant-suggestions">
                  {suggestedQuestions.map((question) => (
                    <button key={question} type="button" disabled={!canAsk} onClick={() => { setDraft(question); inputRef.current?.focus() }}>
                      <span>{question}</span><ArrowRight aria-hidden="true" size={17} />
                    </button>
                  ))}
                </div>
              </div>
            ) : turns.map((turn) => (
              <div className="assistant-turn" key={turn.id}>
                <div className="assistant-question"><span>你</span><p>{turn.question}</p></div>
                <div className="assistant-answer">
                  <span className="assistant-speaker"><MessageSquare aria-hidden="true" size={16} />社区助手</span>
                  {turn.state === "pending" ? <p className="assistant-pending" role="status"><LoaderCircle aria-hidden="true" size={16} />正在生成回答…</p> : null}
                  {turn.reply ? <>
                    <p className="assistant-answer-text">{turn.reply.answer}</p>
                    {turn.reply.links.length ? <div className="assistant-answer-links">{turn.reply.links.map((link) => <Link key={link.path} to={link.path}>{link.label}<ArrowRight aria-hidden="true" size={15} /></Link>)}</div> : null}
                    {turn.reply.sources.length ? <p className="assistant-sources">参考：{turn.reply.sources.map((source) => source.label).join("、")}</p> : null}
                  </> : null}
                  {turn.state === "failed" || turn.state === "stopped" ? <div className="assistant-retry">
                    <p role={turn.state === "failed" ? "alert" : "status"}>{turn.error ?? "已停止生成"}</p>
                    <Button variant="ghost" size="sm" disabled={!canAsk || pending} onClick={() => void ask(turn.question, turn.id)}><RotateCcw aria-hidden="true" size={15} />重试回答</Button>
                  </div> : null}
                </div>
              </div>
            ))}
          </div>
          <form className="assistant-composer" onSubmit={submit}>
            <label htmlFor="assistant-question">你的问题</label>
            <textarea ref={inputRef} id="assistant-question" className="input textarea" placeholder="输入社区相关问题" maxLength={2000} rows={3} disabled={!canAsk || pending} value={draft} onChange={(event) => setDraft(event.target.value)} />
            <div className="assistant-composer-footer">
              <span className="assistant-character-count">{draft.length} / 2000</span>
              {pending ? <Button type="button" variant="outline" onClick={stop}><Square aria-hidden="true" size={16} />停止生成</Button>
                : <Button type="submit" disabled={!canAsk || !draft.trim() || draft.trim().length > 2000}><Send aria-hidden="true" size={16} />发送</Button>}
            </div>
          </form>
        </TabsContent>
        <TabsContent value="directory"><FunctionDirectory /></TabsContent>
      </Tabs>
    </section>
  )
}

export function AssistantPage() {
  const { user, status } = useAuth()
  if (!user || user.role !== "OWNER" || status !== "authenticated") return null
  return <AssistantWorkspace key={`${user.communityId}:${user.id}:${user.token}`} user={user} />
}
