import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ParkingWizard } from "@/features/parking/parking-wizard"
import { api } from "@/lib/api"
import { errorMessage, formatTime, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Reservation } from "@/lib/types"

export function ParkingPage() {
  const client = useQueryClient()
  const [cancelling, setCancelling] = useState<Reservation | null>(null)
  const reservations = useQuery({ queryKey: queryKeys.parkingReservations, queryFn: () => api.get<Reservation[]>("/parking/reservations/mine") })
  const cancelReservation = useMutation({
    mutationFn: (id: number) => api.post<Reservation>(`/parking/reservations/${id}/cancel`),
    onSuccess: async () => { setCancelling(null); await Promise.all([client.invalidateQueries({ queryKey: queryKeys.parkingReservations }), client.invalidateQueries({ queryKey: queryKeys.parkingSpacesRoot }), client.invalidateQueries({ queryKey: queryKeys.dashboard })]); toast.success("预约已取消") },
  })

  return (
    <section className="page-section">
      <PageHeader title="车位预约" description="按日期、车位与时段逐步完成预约。"/>
      <ParkingWizard/>
      <details className="secondary-disclosure"><summary aria-label="我的预约记录">我的预约记录</summary><div className="secondary-content">{reservations.isPending ? <LoadingRows count={2}/> : reservations.isError ? <ErrorState message="预约记录加载失败" onRetry={() => void reservations.refetch()}/> : reservations.data?.length ? <div className="sparse-list">{reservations.data.map((item) => <div className="sparse-row" key={item.id}><span className="row-copy"><strong>{item.date}</strong><small>{formatTime(item.start)} - {formatTime(item.end)}</small></span><span className="row-tags"><StatusBadge status={item.status}/>{item.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => setCancelling(item)}>取消</Button> : null}</span></div>)}</div> : <EmptyState title="暂无预约记录"/>}</div></details>
      <Dialog open={cancelling !== null} onOpenChange={(open) => { if (!open) setCancelling(null) }}><DialogContent aria-describedby="cancel-reservation-description"><DialogHeader><DialogTitle>取消车位预约</DialogTitle><DialogDescription id="cancel-reservation-description">取消后该车位时段将重新开放。</DialogDescription></DialogHeader>{cancelReservation.isError ? <p className="form-error" role="alert">{errorMessage(cancelReservation.error)}</p> : null}<DialogFooter><Button variant="outline" onClick={() => setCancelling(null)}>返回</Button><Button variant="danger" disabled={cancelReservation.isPending} onClick={() => cancelling && cancelReservation.mutate(cancelling.id)}>{cancelReservation.isPending ? "正在取消" : "确认取消"}</Button></DialogFooter></DialogContent></Dialog>
    </section>
  )
}
