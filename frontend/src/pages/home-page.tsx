import { useQuery } from "@tanstack/react-query"
import { Bell, CarFront, ChevronRight, ReceiptText, Wrench } from "lucide-react"
import { Link } from "react-router-dom"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { StatusBadge } from "@/lib/presentation"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type { Notice, Repair } from "@/lib/types"

export const OWNER_HOME_LIMITS = { services: 3, activeItems: 1, notices: 1 }

const services = [
  { label: "报修", detail: "提交居家维修", to: "/app/repairs", icon: Wrench },
  { label: "缴费", detail: "查看待缴账单", to: "/app/bills", icon: ReceiptText },
  { label: "车位", detail: "预约临时车位", to: "/app/parking", icon: CarFront },
] as const

const activeStatuses = new Set(["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"])

export function HomePage() {
  const repairs = useQuery({ queryKey: queryKeys.repairs("home-active"), queryFn: () => api.get<Repair[]>("/repairs") })
  const notices = useQuery({ queryKey: queryKeys.notices("home-latest"), queryFn: () => api.get<Notice[]>("/notices") })
  const active = repairs.data?.filter((item) => activeStatuses.has(item.status)).slice(0, OWNER_HOME_LIMITS.activeItems) ?? []
  const latestNotices = notices.data?.slice(0, OWNER_HOME_LIMITS.notices) ?? []

  return (
    <section className="page-section home-page">
      <PageHeader title="今天想做什么？" description="常用社区服务，一步直达。" />
      <div className="service-grid">
        {services.slice(0, OWNER_HOME_LIMITS.services).map(({ label, detail, to, icon: Icon }) => (
          <Link className="service-action" to={to} key={to} data-testid="home-service">
            <span className="service-icon"><Icon aria-hidden="true" size={22} /></span>
            <span><strong>{label}</strong><small>{detail}</small></span>
            <ChevronRight aria-hidden="true" size={18} />
          </Link>
        ))}
      </div>

      <div className="home-columns">
        <section className="content-block" aria-labelledby="active-heading">
          <div className="section-heading"><h2 id="active-heading">当前事项</h2><Link to="/app/progress">查看全部</Link></div>
          {repairs.isPending ? <LoadingRows count={1} /> : repairs.isError ? <ErrorState message="报修进度暂时不可用" onRetry={() => void repairs.refetch()} /> : active.length ? active.map((item) => (
            <Link className="sparse-row" to="/app/repairs" key={item.id} data-testid="home-active-item">
              <span className="row-copy"><strong>{item.category}</strong><small>报修编号 #{item.id}</small></span>
              <StatusBadge status={item.status} />
            </Link>
          )) : <EmptyState title="暂无进行中事项" detail="新的报修进度会显示在这里" />}
        </section>

        <section className="content-block" aria-labelledby="notice-heading">
          <div className="section-heading"><h2 id="notice-heading">最新公告</h2><Link to="/app/notices">全部公告</Link></div>
          {notices.isPending ? <LoadingRows count={1} /> : notices.isError ? <ErrorState message="公告暂时不可用" onRetry={() => void notices.refetch()} /> : latestNotices.length ? latestNotices.map((notice) => (
            <Link className="sparse-row" to="/app/notices" key={notice.id} data-testid="home-notice">
              <span className="row-leading-icon"><Bell aria-hidden="true" size={18} /></span>
              <span className="row-copy"><strong>{notice.title}</strong><small>社区公告</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
          )) : <EmptyState title="暂无新公告" />}
        </section>
      </div>
    </section>
  )
}
