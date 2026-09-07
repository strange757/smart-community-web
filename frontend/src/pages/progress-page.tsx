import { useQuery } from "@tanstack/react-query"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { PARKING_REFRESH_MS } from "@/features/parking/parking-data"
import { formatDate, formatTime, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Repair, Reservation } from "@/lib/types"

export function ProgressPage() {
  const repairs = useQuery({ queryKey: queryKeys.repairs("owner-progress"), queryFn: () => api.get<Repair[]>("/repairs") })
  const reservations = useQuery({ queryKey: queryKeys.parkingReservations, queryFn: () => api.get<Reservation[]>("/parking/reservations/mine"), refetchInterval: PARKING_REFRESH_MS })

  return (
    <section className="page-section">
      <PageHeader title="我的进度" description="报修与车位预约的最新状态。" />
      <Tabs defaultValue="repairs">
        <TabsList aria-label="进度类型"><TabsTrigger value="repairs">报修</TabsTrigger><TabsTrigger value="parking">车位预约</TabsTrigger></TabsList>
        <TabsContent value="repairs">
          {repairs.isPending ? <LoadingRows /> : repairs.isError ? <ErrorState message="报修进度加载失败" onRetry={() => void repairs.refetch()} /> : repairs.data?.length ? (
            <div className="sparse-list">{repairs.data.map((item) => <div className="sparse-row" key={item.id}><span className="row-copy"><strong>{item.category}</strong><small>{formatDate(item.createdAt)}</small></span><StatusBadge status={item.status} /></div>)}</div>
          ) : <EmptyState title="暂无报修记录" />}
        </TabsContent>
        <TabsContent value="parking">
          {reservations.isPending ? <LoadingRows /> : reservations.isError ? <ErrorState message="预约记录加载失败" onRetry={() => void reservations.refetch()} /> : reservations.data?.length ? (
            <div className="sparse-list">{reservations.data.map((item) => <div className="sparse-row" key={item.id}><span className="row-copy"><strong>{item.spaceNo} · {item.date}</strong><small>{formatTime(item.start)} - {formatTime(item.end)}{item.reviewNote ? ` · ${item.reviewNote}` : ""}</small></span><StatusBadge status={item.status} /></div>)}</div>
          ) : <EmptyState title="暂无车位预约" />}
        </TabsContent>
      </Tabs>
    </section>
  )
}
