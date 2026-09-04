import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, LoadingRows } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { api } from "@/lib/api"
import { errorMessage, formatDate, labelForStatus, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Repair, StaffUser, UserRole } from "@/lib/types"
import { repairActionsFor, type RepairAction } from "./repair-actions"

const actionLabels: Record<RepairAction, string> = {
  assign: "指派维修人员",
  start: "开始处理",
  complete: "完成工单",
  confirm: "确认完成",
  rate: "评价服务",
  cancel: "取消报修",
}

export function RepairDetailSheet({ repairId, role, onOpenChange }: { repairId: number | null; role: UserRole; onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient()
  const [assignOpen, setAssignOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [assigneeId, setAssigneeId] = useState("")
  const [completionNote, setCompletionNote] = useState("维修完成")
  const [rating, setRating] = useState("5")
  const [ratingComment, setRatingComment] = useState("")

  const detail = useQuery({
    queryKey: queryKeys.repair(repairId ?? 0),
    queryFn: () => api.get<Repair>(`/repairs/${repairId}`),
    enabled: repairId !== null,
  })
  const staff = useQuery({
    queryKey: queryKeys.staff,
    queryFn: () => api.get<StaffUser[]>("/users?role=MAINTENANCE"),
    enabled: assignOpen,
  })
  const transition = useMutation({
    mutationFn: ({ action, body }: { action: RepairAction; body?: unknown }) => api.post<Repair>(`/repairs/${repairId}/${action}`, body),
    onSuccess: async (repair) => {
      client.setQueryData(queryKeys.repair(repair.id), repair)
      setAssignOpen(false)
      setCompleteOpen(false)
      setRatingOpen(false)
      setCancelOpen(false)
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.repairsRoot }),
        client.invalidateQueries({ queryKey: queryKeys.repair(repair.id) }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ])
      toast.success("工单状态已更新")
    },
  })

  const repair = detail.data
  const actions = repair ? repairActionsFor(role, repair.status) : []

  function invoke(action: RepairAction) {
    transition.reset()
    if (action === "assign") return setAssignOpen(true)
    if (action === "complete") return setCompleteOpen(true)
    if (action === "rate") return setRatingOpen(true)
    if (action === "cancel") return setCancelOpen(true)
    transition.mutate({ action })
  }

  return (
    <>
      <Sheet open={repairId !== null} onOpenChange={onOpenChange}>
        <SheetContent className="detail-sheet" aria-describedby="repair-detail-description">
          {detail.isPending ? <LoadingRows count={3} /> : detail.isError ? <ErrorState message={errorMessage(detail.error)} onRetry={() => void detail.refetch()} /> : repair ? (
            <div className="sheet-layout">
              <SheetHeader>
                <SheetTitle>{repair.category}</SheetTitle>
                <SheetDescription id="repair-detail-description">报修编号 #{repair.id} · {formatDate(repair.createdAt)}</SheetDescription>
              </SheetHeader>
              <div className="detail-scroll">
                <section className="detail-section"><h3>当前状态</h3><div className="detail-meta"><StatusBadge status={repair.status}/>{repair.priority === "URGENT" ? <span className="priority-urgent">紧急</span> : <span>普通</span>}<span>{repair.assigneeId ? `维修人员 #${repair.assigneeId}` : "暂未指派"}</span></div></section>
                <section className="detail-section"><h3>问题描述</h3><p>{repair.description}</p></section>
                <section className="detail-section"><h3>处理记录</h3>
                  {repair.events.length ? <ol className="timeline">{repair.events.map((event) => <li key={event.id}><span className="timeline-dot"/><div><strong>{labelForStatus(event.toStatus)}</strong><p>{event.note || event.action}</p><time>{formatDate(event.createdAt)}</time></div></li>)}</ol> : <EmptyState title="暂无处理记录" />}
                </section>
                {transition.isError ? <p className="form-error" role="alert">{errorMessage(transition.error)}</p> : null}
              </div>
              {actions.length ? <SheetFooter className="detail-actions">{actions.map((action) => <Button key={action} variant={action === "cancel" ? "danger" : "default"} disabled={transition.isPending} onClick={() => invoke(action)}>{transition.isPending ? <LoaderCircle className="spin" aria-hidden="true" size={17}/> : null}{actionLabels[action]}</Button>)}</SheetFooter> : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent aria-describedby="assign-description"><DialogHeader><DialogTitle>指派维修人员</DialogTitle><DialogDescription id="assign-description">选择本社区可接单的维修人员。</DialogDescription></DialogHeader>
          {staff.isPending ? <LoadingRows count={1}/> : staff.isError ? <ErrorState message="维修人员加载失败" onRetry={() => void staff.refetch()}/> : staff.data?.length ? <label className="field-label">维修人员<select className="input" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">请选择</option>{staff.data.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label> : <EmptyState title="暂无可指派人员"/>}
          {transition.isError ? <p className="form-error" role="alert">{errorMessage(transition.error)}</p> : null}
          <DialogFooter><Button variant="outline" onClick={() => setAssignOpen(false)}>取消</Button><Button disabled={!assigneeId || transition.isPending} onClick={() => transition.mutate({ action: "assign", body: { assigneeId: Number(assigneeId) } })}>确认指派</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent aria-describedby="complete-description"><DialogHeader><DialogTitle>完成工单</DialogTitle><DialogDescription id="complete-description">记录本次维修结果。</DialogDescription></DialogHeader><label className="field-label">完成说明<Textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} maxLength={500}/></label>{transition.isError ? <p className="form-error" role="alert">{errorMessage(transition.error)}</p> : null}<DialogFooter><Button variant="outline" onClick={() => setCompleteOpen(false)}>取消</Button><Button disabled={transition.isPending} onClick={() => transition.mutate({ action: "complete", body: { note: completionNote.trim() || "维修完成" } })}>确认完成</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent aria-describedby="rating-description"><DialogHeader><DialogTitle>评价维修服务</DialogTitle><DialogDescription id="rating-description">评分提交后将结束本次工单。</DialogDescription></DialogHeader><label className="field-label">评分<select className="input" value={rating} onChange={(event) => setRating(event.target.value)}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} 星</option>)}</select></label><label className="field-label">评价内容（选填）<Textarea value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} maxLength={200}/></label>{transition.isError ? <p className="form-error" role="alert">{errorMessage(transition.error)}</p> : null}<DialogFooter><Button variant="outline" onClick={() => setRatingOpen(false)}>取消</Button><Button disabled={transition.isPending} onClick={() => transition.mutate({ action: "rate", body: { rating: Number(rating), comment: ratingComment.trim() } })}>提交评价</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent aria-describedby="cancel-description"><DialogHeader><DialogTitle>取消报修</DialogTitle><DialogDescription id="cancel-description">取消后该工单将不再继续处理。</DialogDescription></DialogHeader>{transition.isError ? <p className="form-error" role="alert">{errorMessage(transition.error)}</p> : null}<DialogFooter><Button variant="outline" onClick={() => setCancelOpen(false)}>返回</Button><Button variant="danger" disabled={transition.isPending} onClick={() => transition.mutate({ action: "cancel" })}>确认取消</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  )
}
