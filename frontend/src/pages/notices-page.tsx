import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input, Textarea } from "@/components/ui/input"
import { NoticeDraftAssist } from "@/features/ai/draft-assist"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { errorMessage, formatDate, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Notice } from "@/lib/types"

export function NoticesPage() {
  const { user } = useAuth()
  const client = useQueryClient()
  const [selected, setSelected] = useState<Notice | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const notices = useQuery({ queryKey: queryKeys.notices(user?.role ?? "published"), queryFn: () => api.get<Notice[]>("/notices"), enabled: Boolean(user) })
  const createNotice = useMutation({
    mutationFn: () => api.post<Notice>("/notices", { title: title.trim(), content: content.trim() }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: queryKeys.noticesRoot }); setTitle(""); setContent(""); setCreateOpen(false); toast.success("公告草稿已创建") },
  })
  const changeStatus = useMutation({
    mutationFn: ({ notice, action }: { notice: Notice; action: "publish" | "withdraw" }) => api.post<Notice>(`/notices/${notice.id}/${action}`),
    onSuccess: async (notice) => { setSelected(notice); await client.invalidateQueries({ queryKey: queryKeys.noticesRoot }); toast.success(notice.status === "PUBLISHED" ? "公告已发布" : "公告已撤回") },
  })

  if (!user) return null
  function submit(event: FormEvent) { event.preventDefault(); if (title.trim().length >= 2 && content.trim().length >= 2) createNotice.mutate() }

  return (
    <section className="page-section">
      <PageHeader title={user.role === "PROPERTY" ? "社区公告" : "消息"} description="查看社区发布的最新通知。" action={user.role === "PROPERTY" ? <Button onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" size={18}/>新建公告</Button> : undefined}/>
      {notices.isPending ? <LoadingRows count={3}/> : notices.isError ? <ErrorState message="公告加载失败" onRetry={() => void notices.refetch()}/> : notices.data?.length ? <div className="sparse-list">{notices.data.map((notice) => (
        <button className="sparse-row" type="button" key={notice.id} onClick={() => setSelected(notice)} aria-label={`查看公告：${notice.title}`}><span className="row-copy"><strong>{notice.title}</strong><small>{formatDate(notice.publishedAt)}</small></span><StatusBadge status={notice.status}/></button>
      ))}</div> : <EmptyState title="暂无公告"/>}

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent aria-describedby="notice-detail-description"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription id="notice-detail-description">{selected ? formatDate(selected.publishedAt) : ""}</DialogDescription></DialogHeader><div className="notice-content"><p>{selected?.content}</p>{selected ? <StatusBadge status={selected.status}/> : null}</div>{changeStatus.isError ? <p className="form-error" role="alert">{errorMessage(changeStatus.error)}</p> : null}{user.role === "PROPERTY" && selected && (selected.status === "DRAFT" || selected.status === "PUBLISHED") ? <DialogFooter><Button disabled={changeStatus.isPending} variant={selected.status === "PUBLISHED" ? "danger" : "default"} onClick={() => changeStatus.mutate({ notice: selected, action: selected.status === "DRAFT" ? "publish" : "withdraw" })}>{changeStatus.isPending ? <LoaderCircle className="spin" aria-hidden="true" size={17}/> : null}{selected.status === "DRAFT" ? "发布公告" : "撤回公告"}</Button></DialogFooter> : null}</DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby="notice-create-description">
          <DialogHeader><DialogTitle>新建公告草稿</DialogTitle><DialogDescription id="notice-create-description">草稿创建后可在公告详情中发布。</DialogDescription></DialogHeader>
          <form className="dialog-form" onSubmit={submit}>
            <div className="form-scroll">
              <label className="field-label">标题<Input value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={160} disabled={createNotice.isPending}/></label>
              <label className="field-label">内容<Textarea value={content} onChange={(event) => setContent(event.target.value)} minLength={2} maxLength={4000} disabled={createNotice.isPending}/></label>
              <NoticeDraftAssist title={title} content={content} disabled={createNotice.isPending} onApply={(draft) => { setTitle(draft.title); setContent(draft.content) }} />
              {createNotice.isError ? <p className="form-error" role="alert">{errorMessage(createNotice.error)}</p> : null}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button><Button type="submit" disabled={title.trim().length < 2 || content.trim().length < 2 || createNotice.isPending}>{createNotice.isPending ? "正在创建" : "创建草稿"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
