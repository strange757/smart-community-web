import { useMutation } from "@tanstack/react-query"
import { Check, LoaderCircle, WandSparkles, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { errorMessage } from "@/lib/presentation"

export interface RepairDraft {
  category: "公共设施" | "水电维修" | "门窗维修" | "其他问题"
  description: string
  priority: "NORMAL" | "URGENT"
  missingInfo: string[]
}

export interface NoticeDraft {
  title: string
  content: string
  missingInfo: string[]
}

function DraftAssist<T extends { missingInfo: string[] }>({
  endpoint, payload, label, disabled, onApply, preview,
}: {
  endpoint: string
  payload: Record<string, string>
  label: string
  disabled: boolean
  onApply: (draft: T) => void
  preview: (draft: T) => ReactNode
}) {
  const draft = useMutation({ mutationFn: () => api.post<T>(endpoint, payload), retry: false })

  return (
    <div className="ai-assist">
      <Button type="button" variant="outline" disabled={disabled || draft.isPending} onClick={() => draft.mutate()}>
        {draft.isPending ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <WandSparkles size={16} aria-hidden="true" />}
        {draft.isPending ? "正在生成" : label}
      </Button>
      {draft.isError ? <p className="form-error" role="alert">{errorMessage(draft.error)}</p> : null}
      {draft.data ? (
        <section className="ai-draft-preview" aria-label="AI 建议">
          <div className="ai-draft-heading"><WandSparkles size={15} aria-hidden="true" /><strong>AI 建议</strong></div>
          <div className="ai-draft-body">{preview(draft.data)}</div>
          {draft.data.missingInfo.length ? (
            <details className="ai-missing-info">
              <summary>待补充（{draft.data.missingInfo.length}）</summary>
              <ul>{draft.data.missingInfo.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </details>
          ) : null}
          <div className="ai-draft-actions">
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => draft.reset()}><X size={16} aria-hidden="true" />不采用</Button>
            <Button type="button" variant="outline" disabled={disabled} onClick={() => { if (draft.data) onApply(draft.data); draft.reset() }}><Check size={16} aria-hidden="true" />采用建议</Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export function RepairDraftAssist({ description, disabled = false, onApply }: { description: string; disabled?: boolean; onApply: (draft: RepairDraft) => void }) {
  // Each input revision owns its suggestion, so late responses cannot overwrite new text.
  return <DraftAssist<RepairDraft> key={description} endpoint="/ai/repair-draft" payload={{ description: description.trim() }} label="AI 整理" disabled={disabled || description.trim().length < 4} onApply={onApply} preview={(draft) => <><div className="ai-draft-meta"><span>{draft.category}</span><span>{draft.priority === "URGENT" ? "紧急" : "普通"}</span></div><p>{draft.description}</p></>} />
}

export function NoticeDraftAssist({ title, content, disabled = false, onApply }: { title: string; content: string; disabled?: boolean; onApply: (draft: NoticeDraft) => void }) {
  return <DraftAssist<NoticeDraft> key={JSON.stringify([title, content])} endpoint="/ai/notice-draft" payload={{ title: title.trim(), content: content.trim() }} label="AI 拟稿" disabled={disabled || content.trim().length < 4} onApply={onApply} preview={(draft) => <><strong>{draft.title}</strong><p>{draft.content}</p></>} />
}
