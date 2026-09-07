import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Clock3, LoaderCircle, RefreshCw, Search, SquareParking, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input, Textarea } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PARKING_REFRESH_MS, parkingClock, parkingDate, parkingTimeSlots, refreshParking, reservationHasEnded, useParkingAvailability, type ParkingTimeSlot } from "@/features/parking/parking-data"
import { ParkingFilters } from "@/features/parking/parking-filters"
import { ParkingMap } from "@/features/parking/parking-map"
import { api } from "@/lib/api"
import { errorMessage, formatDate, formatTime, labelForStatus, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Reservation, ReservationStatus } from "@/lib/types"

type ReviewAction = "approve" | "reject"
const filters: { value: ReservationStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "待审批" }, { value: "ACTIVE", label: "已通过" }, { value: "REJECTED", label: "已驳回" }, { value: "CANCELLED", label: "已取消" }, { value: "ALL", label: "全部" },
]

function ParkingOverview() {
  const [date, setDate] = useState(() => parkingDate(1))
  const [slot, setSlot] = useState<ParkingTimeSlot>(parkingTimeSlots[0])
  const [area, setArea] = useState<string | null>(null)
  const availability = useParkingAvailability(date, slot)
  const spaces = availability.data?.spaces ?? []
  const activeArea = area ?? spaces[0]?.areaName ?? ""
  const visible = activeArea ? spaces.filter((space) => space.areaName === activeArea) : spaces
  return <div className="parking-property-overview">
    <ParkingFilters date={date} slot={slot} area={activeArea} areas={Array.from(new Set(spaces.map((space) => space.areaName)))} refreshing={availability.isFetching} onDateChange={setDate} onSlotChange={setSlot} onAreaChange={setArea} onRefresh={() => void availability.refetch()}/>
    <div className="parking-live-row"><span className={`parking-live-status ${availability.isError ? "parking-live-error" : ""}`}><i/>{availability.isError ? "状态更新中断" : "预约状态已同步"}</span><time>{parkingClock(availability.data?.asOf)}</time></div>
    {!date ? <EmptyState title="未选择日期"/> : availability.isPending ? <LoadingRows count={4}/> : availability.isError ? <ErrorState message="车位状态加载失败" onRetry={() => void availability.refetch()}/> : visible.length ? <ParkingMap spaces={visible}/> : <EmptyState title="该区域暂无车位"/>}
  </div>
}

export function ParkingManagementPage() {
  const client = useQueryClient()
  const [status, setStatus] = useState<ReservationStatus | "ALL">("PENDING")
  const [search, setSearch] = useState("")
  const [date, setDate] = useState("")
  const [review, setReview] = useState<{ reservation: Reservation; action: ReviewAction } | null>(null)
  const [note, setNote] = useState("")
  const reservations = useQuery({ queryKey: queryKeys.parkingManagement, queryFn: () => api.get<Reservation[]>("/parking/reservations"), refetchInterval: PARKING_REFRESH_MS })
  const rows = reservations.data ?? []
  const currentReview = rows.find((item) => item.id === review?.reservation.id) ?? review?.reservation
  const reviewUnavailable = currentReview?.status !== "PENDING" || (review?.action === "approve" && currentReview && reservationHasEnded(currentReview))
  const mutation = useMutation({
    mutationFn: ({ reservation, action, note: decisionNote }: { reservation: Reservation; action: ReviewAction; note: string }) => api.post<Reservation>(`/parking/reservations/${reservation.id}/${action}`, { note: decisionNote }),
    onSuccess: (updated) => {
      client.setQueryData<Reservation[]>(queryKeys.parkingManagement, (previous) => previous?.map((item) => item.id === updated.id ? updated : item))
      setReview(null)
      setNote("")
      void refreshParking(client)
      toast.success(updated.status === "ACTIVE" ? "预约已通过" : "预约已驳回")
    },
    onError: () => { void refreshParking(client) },
  })
  const filtered = rows.filter((item) => (status === "ALL" || item.status === status) && (!date || item.date === date) && `${item.applicantName} ${item.spaceNo} ${item.plateNumber ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const pendingCount = rows.filter((item) => item.status === "PENDING").length
  const activeCount = rows.filter((item) => item.status === "ACTIVE" && !reservationHasEnded(item)).length

  function openReview(reservation: Reservation, action: ReviewAction) {
    mutation.reset()
    setNote("")
    setReview({ reservation, action })
  }

  return <section className="page-section parking-management-page">
    <PageHeader title="停车管理" action={<Button variant="outline" size="icon" aria-label="刷新停车管理" title="刷新停车管理" disabled={reservations.isFetching} onClick={() => void refreshParking(client)}><RefreshCw size={18} className={reservations.isFetching ? "spin" : ""} aria-hidden="true"/></Button>}/>
    <div className="parking-management-metrics"><div><span><Clock3 size={16} aria-hidden="true"/>待审批</span><strong>{reservations.isPending || reservations.isError ? "--" : pendingCount}</strong></div><div><span><SquareParking size={16} aria-hidden="true"/>有效预约</span><strong>{reservations.isPending || reservations.isError ? "--" : activeCount}</strong></div><div><span><Check size={16} aria-hidden="true"/>累计已通过</span><strong>{reservations.isPending || reservations.isError ? "--" : rows.filter((item) => item.status === "ACTIVE").length}</strong></div></div>
    <Tabs defaultValue="approvals">
      <TabsList aria-label="停车管理视图"><TabsTrigger value="approvals">预约审批</TabsTrigger><TabsTrigger value="overview">车位总览</TabsTrigger></TabsList>
      <TabsContent value="approvals">
        <div className="parking-approval-toolbar">
          <div className="parking-status-tabs" role="group" aria-label="审批状态筛选">{filters.map((item) => <button key={item.value} type="button" aria-pressed={status === item.value} onClick={() => setStatus(item.value)}>{item.label}{item.value === "PENDING" && pendingCount ? <span>{pendingCount}</span> : null}</button>)}</div>
          <div className="parking-review-filters"><label className="parking-search"><Search size={16} aria-hidden="true"/><Input type="search" aria-label="搜索申请人、车牌或车位" placeholder="申请人 / 车牌 / 车位" value={search} onChange={(event) => setSearch(event.target.value)}/></label><input className="input" type="date" aria-label="筛选预约日期" value={date} onChange={(event) => setDate(event.target.value)}/>{date ? <Button variant="ghost" size="icon" title="清除日期筛选" aria-label="清除日期筛选" onClick={() => setDate("")}><X size={16}/></Button> : null}</div>
        </div>
        {reservations.isPending ? <LoadingRows count={4}/> : reservations.isError ? <ErrorState message="停车预约加载失败" onRetry={() => void reservations.refetch()}/> : filtered.length ? <div className="parking-table-scroll"><table className="parking-approval-table"><thead><tr><th>申请人 / 车牌</th><th>车位</th><th>预约时段</th><th>状态</th><th>操作 / 审批意见</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}>
          <td><strong>{item.applicantName}</strong><small>{item.plateNumber || "未填写车牌"}</small></td><td><strong>{item.spaceNo}</strong><small>{item.areaName}</small></td><td><strong>{item.date}</strong><small>{formatTime(item.start)} - {formatTime(item.end)}</small></td><td><StatusBadge status={item.status}/>{reservationHasEnded(item) && (item.status === "PENDING" || item.status === "ACTIVE") ? <small>时段已结束</small> : null}</td><td>{item.status === "PENDING" ? <div className="parking-review-actions"><Button variant="outline" size="sm" aria-label={`通过 ${item.spaceNo} 的预约申请`} disabled={reservationHasEnded(item)} onClick={() => openReview(item, "approve")}><Check size={15} aria-hidden="true"/>通过</Button><Button variant="ghost" size="sm" aria-label={`驳回 ${item.spaceNo} 的预约申请`} onClick={() => openReview(item, "reject")}><X size={15} aria-hidden="true"/>驳回</Button></div> : <span className="parking-table-note">{item.reviewNote || (item.status === "CANCELLED" ? "业主已取消" : "--")}</span>}</td>
        </tr>)}</tbody></table></div> : <EmptyState title={status === "PENDING" && !search && !date ? "暂无待审批预约" : "没有符合条件的预约"}/>}
        <div className="parking-list-footer"><span>{filtered.length} 条预约</span><time>更新于 {parkingClock(reservations.dataUpdatedAt)}</time></div>
      </TabsContent>
      <TabsContent value="overview"><ParkingOverview/></TabsContent>
    </Tabs>
    <Dialog open={review !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) setReview(null) }}><DialogContent aria-describedby="parking-review-description"><DialogHeader><DialogTitle>{review?.action === "approve" ? "通过车位预约" : "驳回车位预约"}</DialogTitle><DialogDescription id="parking-review-description">申请 #{review?.reservation.id} · {review?.action === "approve" ? "通过后预约生效。" : "驳回后释放该车位时段。"}</DialogDescription></DialogHeader>
      {review ? <><dl className="parking-detail-list"><div><dt>申请人</dt><dd>{review.reservation.applicantName}</dd></div><div><dt>车牌</dt><dd>{review.reservation.plateNumber || "未填写"}</dd></div><div><dt>车位</dt><dd>{review.reservation.areaName} · {review.reservation.spaceNo}</dd></div><div><dt>预约日期</dt><dd>{review.reservation.date}</dd></div><div><dt>时段</dt><dd>{formatTime(review.reservation.start)} - {formatTime(review.reservation.end)}</dd></div><div><dt>申请时间</dt><dd>{formatDate(review.reservation.createdAt)} {parkingClock(review.reservation.createdAt)}</dd></div></dl><label className="field-label">{review.action === "reject" ? "驳回原因" : "审批意见（选填）"}<Textarea rows={3} maxLength={500} value={note} disabled={mutation.isPending || Boolean(reviewUnavailable)} onChange={(event) => setNote(event.target.value)}/></label></> : null}
      {reviewUnavailable ? <p className="form-error" role="alert">{currentReview?.status === "PENDING" ? "预约时段已结束，不能通过。" : `该申请当前状态为${labelForStatus(currentReview?.status ?? "")}。`}</p> : null}
      {mutation.isError ? <p className="form-error" role="alert">{errorMessage(mutation.error)}</p> : null}
      <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setReview(null)}>返回</Button><Button variant={review?.action === "reject" ? "danger" : "default"} disabled={mutation.isPending || Boolean(reviewUnavailable) || (review?.action === "reject" && !note.trim())} onClick={() => { if (review && !reviewUnavailable) mutation.mutate({ ...review, note: note.trim() }) }}>{mutation.isPending ? <LoaderCircle className="spin" size={16} aria-hidden="true"/> : review?.action === "reject" ? <X size={16} aria-hidden="true"/> : <Check size={16} aria-hidden="true"/>}{review?.action === "reject" ? "确认驳回" : "确认通过"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>
}
