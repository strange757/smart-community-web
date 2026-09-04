import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, ReceiptText } from "lucide-react"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { api } from "@/lib/api"
import { formatDate, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Dashboard, Notice, Repair } from "@/lib/types"

export function OperationsPage() {
  const dashboard = useQuery({ queryKey: queryKeys.dashboard, queryFn: () => api.get<Dashboard>("/dashboard/summary") })
  const repairs = useQuery({ queryKey: queryKeys.repairs("operations-pending"), queryFn: () => api.get<Repair[]>("/repairs") })
  const notices = useQuery({ queryKey: queryKeys.notices("operations-latest"), queryFn: () => api.get<Notice[]>("/notices") })
  const pending = repairs.data?.filter((repair) => ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"].includes(repair.status)).slice(0, 3) ?? []
  const latestNotice = notices.data?.[0]
  const metrics = dashboard.data ? [
    { label: "待处理工单", value: dashboard.data.pendingRepairCount, icon: AlertTriangle },
    { label: "已完成工单", value: dashboard.data.completedRepairCount, icon: CheckCircle2 },
    { label: "待收金额", value: `¥${dashboard.data.unpaidAmount}`, icon: ReceiptText },
  ] : []

  return (
    <section className="page-section">
      <PageHeader title="运营首页" description="社区当下需要关注的事项。"/>
      {dashboard.isPending ? <LoadingRows count={1}/> : dashboard.isError ? <ErrorState message="运营概况加载失败" onRetry={() => void dashboard.refetch()}/> : <div className="metric-grid">{metrics.slice(0, 3).map(({ label, value, icon: Icon }) => <div className="metric-card" key={label}><span><Icon aria-hidden="true" size={18}/>{label}</span><strong>{value}</strong></div>)}</div>}
      <div className="operations-grid">
        <section className="content-block"><div className="section-heading"><h2>待处理工单</h2></div>{repairs.isPending ? <LoadingRows count={2}/> : repairs.isError ? <ErrorState message="工单加载失败" onRetry={() => void repairs.refetch()}/> : pending.length ? <div className="sparse-list">{pending.map((repair) => <div className="sparse-row" key={repair.id}><span className="row-copy"><strong>{repair.category}</strong><small>{formatDate(repair.createdAt)}</small></span><StatusBadge status={repair.status}/></div>)}</div> : <EmptyState title="暂无待处理工单"/>}</section>
        <section className="content-block"><div className="section-heading"><h2>最新公告</h2></div>{notices.isPending ? <LoadingRows count={1}/> : notices.isError ? <ErrorState message="公告加载失败" onRetry={() => void notices.refetch()}/> : latestNotice ? <div className="notice-excerpt"><strong>{latestNotice.title}</strong><p>{latestNotice.content}</p><StatusBadge status={latestNotice.status}/></div> : <EmptyState title="暂无公告"/>}</section>
      </div>
    </section>
  )
}
