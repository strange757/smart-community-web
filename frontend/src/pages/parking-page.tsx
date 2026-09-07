import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PARKING_REFRESH_MS, refreshParking, reservationHasEnded } from "@/features/parking/parking-data"
import { ParkingWizard } from "@/features/parking/parking-wizard"
import { api } from "@/lib/api"
import { errorMessage, formatTime, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Reservation, ReservationStatus } from "@/lib/types"

export function ParkingPage() {
  const client = useQueryClient()
  const [cancelling, setCancelling] = useState<Reservation | null>(null)
  const [status, setStatus] = useState<ReservationStatus | "ALL">("ALL")
  const reservations = useQuery({ queryKey: queryKeys.parkingReservations, queryFn: () => api.get<Reservation[]>("/parking/reservations/mine"), refetchInterval: PARKING_REFRESH_MS })
  const cancelReservation = useMutation({
    mutationFn: (id: number) => api.post<Reservation>(`/parking/reservations/${id}/cancel`),
    onSuccess: () => { setCancelling(null); void refreshParking(client); toast.success("预约已取消") },
    onError: () => { void refreshParking(client) },
  })
  const rows = reservations.data?.filter((item) => status === "ALL" || item.status === status) ?? []

  return <section className="page-section parking-page">
    <PageHeader title="车位预约"/>
    <ParkingWizard/>
    <section className="parking-history" aria-labelledby="parking-history-title">
      <div className="parking-section-heading"><h2 id="parking-history-title">我的预约记录</h2><select className="input" aria-label="预约记录状态" value={status} onChange={(event) => setStatus(event.target.value as ReservationStatus | "ALL")}><option value="ALL">全部状态</option><option value="PENDING">待审批</option><option value="ACTIVE">已通过</option><option value="REJECTED">已驳回</option><option value="CANCELLED">已取消</option></select></div>
      {reservations.isPending ? <LoadingRows count={2}/> : reservations.isError ? <ErrorState message="预约记录加载失败" onRetry={() => void reservations.refetch()}/> : rows.length ? <div className="parking-reservation-list">{rows.map((item) => <article className="parking-reservation-row" key={item.id}>
        <div className="parking-reservation-space"><strong>{item.spaceNo}</strong><span>{item.areaName}</span></div>
        <div className="parking-reservation-main"><strong>{item.date} · {formatTime(item.start)} - {formatTime(item.end)}</strong><span>{item.plateNumber || "未填写车牌"} · 申请 #{item.id}</span>{item.reviewNote ? <p className={item.status === "REJECTED" ? "parking-review-note rejected" : "parking-review-note"}>审批意见：{item.reviewNote}</p> : null}</div>
        <div className="parking-reservation-actions"><StatusBadge status={item.status}/>{(item.status === "PENDING" || item.status === "ACTIVE") && !reservationHasEnded(item) ? <Button size="sm" variant="ghost" onClick={() => { cancelReservation.reset(); setCancelling(item) }}><X size={15} aria-hidden="true"/>取消预约</Button> : null}</div>
      </article>)}</div> : <EmptyState title="暂无预约记录"/>}
    </section>
    <Dialog open={cancelling !== null} onOpenChange={(open) => { if (!open && !cancelReservation.isPending) setCancelling(null) }}><DialogContent aria-describedby="cancel-reservation-description"><DialogHeader><DialogTitle>取消车位预约</DialogTitle><DialogDescription id="cancel-reservation-description">{cancelling?.spaceNo} · {cancelling?.date}。取消后不再保留该车位时段。</DialogDescription></DialogHeader>{cancelReservation.isError ? <p className="form-error" role="alert">{errorMessage(cancelReservation.error)}</p> : null}<DialogFooter><Button variant="outline" disabled={cancelReservation.isPending} onClick={() => setCancelling(null)}>返回</Button><Button variant="danger" disabled={cancelReservation.isPending} onClick={() => cancelling && cancelReservation.mutate(cancelling.id)}>{cancelReservation.isPending ? <LoaderCircle className="spin" size={16} aria-hidden="true"/> : null}确认取消</Button></DialogFooter></DialogContent></Dialog>
  </section>
}
