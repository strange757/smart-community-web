import { useQuery } from "@tanstack/react-query"
import { Filter, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RepairCreateDialog } from "@/features/repairs/repair-create-dialog"
import { RepairDetailSheet } from "@/features/repairs/repair-detail-sheet"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatDate, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Repair } from "@/lib/types"

type RepairView = "all" | "processing" | "completed"
const processingStatuses = new Set(["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"])
const completedStatuses = new Set(["RATED", "CANCELLED"])

export function RepairsPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const exactStatus = searchParams.get("status")
  const [view, setView] = useState<RepairView>(exactStatus === "IN_PROGRESS" ? "processing" : "all")
  const [priority, setPriority] = useState("ALL")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const repairs = useQuery({
    queryKey: queryKeys.repairs(exactStatus ?? view),
    queryFn: () => api.get<Repair[]>(exactStatus ? `/repairs?status=${encodeURIComponent(exactStatus)}` : "/repairs"),
    enabled: Boolean(user),
  })
  const filtered = useMemo(() => (repairs.data ?? []).filter((repair) => {
    if (priority !== "ALL" && repair.priority !== priority) return false
    if (exactStatus) return repair.status === exactStatus
    if (view === "processing") return processingStatuses.has(repair.status)
    if (view === "completed") return completedStatuses.has(repair.status)
    return true
  }), [exactStatus, priority, repairs.data, view])

  if (!user) return null
  const title = user.role === "MAINTENANCE" ? "我的工单" : "报修工单"

  return (
    <section className="page-section">
      <PageHeader title={title} description="选择工单查看详情与下一步操作。" action={user.role === "OWNER" ? <Button onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" size={18}/>提交报修</Button> : undefined}/>
      <div className="list-toolbar">
        <Tabs value={view} onValueChange={(value) => setView(value as RepairView)}><TabsList aria-label="工单状态"><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="processing">处理中</TabsTrigger><TabsTrigger value="completed">已完成</TabsTrigger></TabsList></Tabs>
        <details className="filter-control"><summary><Filter aria-hidden="true" size={17}/>筛选</summary><label>优先级<select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="ALL">全部</option><option value="NORMAL">普通</option><option value="URGENT">紧急</option></select></label></details>
      </div>
      {repairs.isPending ? <LoadingRows count={3}/> : repairs.isError ? <ErrorState message="工单加载失败" onRetry={() => void repairs.refetch()}/> : filtered.length ? (
        <div className="sparse-list repair-list">{filtered.map((repair) => (
          <button className="sparse-row repair-row" type="button" key={repair.id} aria-label={`查看报修：${repair.category}`} onClick={() => setSelectedId(repair.id)}>
            <span className="row-copy"><strong>{repair.category}</strong><small>#{repair.id} · {formatDate(repair.createdAt)}</small></span>
            <span className="row-tags"><StatusBadge status={repair.status}/>{repair.priority === "URGENT" ? <span className="priority-urgent">紧急</span> : <span className="row-assignee">普通</span>}{repair.assigneeId ? <span className="row-assignee">维修 #{repair.assigneeId}</span> : null}</span>
          </button>
        ))}</div>
      ) : (
        <EmptyState title={repairs.data?.length ? "没有符合筛选的工单" : "暂无工单"} detail={user.role === "OWNER" ? "需要维修时可提交新报修" : undefined}/>
      )}
      {user.role === "OWNER" ? <RepairCreateDialog open={createOpen} onOpenChange={setCreateOpen}/> : null}
      <RepairDetailSheet repairId={selectedId} role={user.role} onOpenChange={(open) => { if (!open) setSelectedId(null) }}/>
    </section>
  )
}
