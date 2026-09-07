import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, Check, Clock3, LoaderCircle, MapPin, Send } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, LoadingRows } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError, api } from "@/lib/api"
import { errorMessage, StatusBadge } from "@/lib/presentation"
import type { Reservation } from "@/lib/types"
import { parkingClock, parkingDate, parkingDateTime, parkingTimeSlots, refreshParking, useParkingAvailability, type ParkingTimeSlot } from "./parking-data"
import { ParkingFilters } from "./parking-filters"
import { ParkingMap } from "./parking-map"

interface ReservationRequest { parkingSpaceId: number; date: string; start: string; end: string; plateNumber: string | null }

export function ParkingWizard() {
  const client = useQueryClient()
  const [date, setDate] = useState(() => parkingDate(1))
  const [slot, setSlot] = useState<ParkingTimeSlot>(parkingTimeSlots[0])
  const [area, setArea] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [plateNumber, setPlateNumber] = useState("")
  const [notice, setNotice] = useState("")
  const [result, setResult] = useState<Reservation | null>(null)
  const availability = useParkingAvailability(date, slot)
  const spaces = availability.data?.spaces ?? []
  const selected = spaces.find((space) => space.id === selectedId)
  const activeArea = area ?? spaces[0]?.areaName ?? ""
  const visibleSpaces = activeArea ? spaces.filter((space) => space.areaName === activeArea) : spaces
  const expired = Boolean(date) && parkingDateTime(date, slot.start) <= Date.now()
  const canSubmit = Boolean(date && selected && selected.availability === "AVAILABLE" && !availability.isError && !expired)

  const reserve = useMutation({
    mutationFn: (body: ReservationRequest) => api.post<Reservation>("/parking/reservations", body),
    onSuccess: (reservation) => {
      setResult(reservation)
      setSelectedId(null)
      setNotice("")
      void refreshParking(client)
      toast.success("预约申请已提交")
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) void refreshParking(client)
    },
  })

  useEffect(() => {
    if (selectedId !== null && availability.data && (!selected || selected.availability !== "AVAILABLE")) {
      setNotice(`${selected?.spaceNo ?? "所选车位"} 的占用状态已变化，请重新选择。`)
      setSelectedId(null)
    }
  }, [availability.data, selected, selectedId])

  function changeScope() {
    setSelectedId(null)
    setNotice("")
    setResult(null)
    reserve.reset()
  }

  return <div className="parking-booking">
    <ParkingFilters date={date} slot={slot} area={activeArea} areas={Array.from(new Set(spaces.map((space) => space.areaName)))} disabled={reserve.isPending} refreshing={availability.isFetching} onDateChange={(value) => { setDate(value); changeScope() }} onSlotChange={(value) => { setSlot(value); changeScope() }} onAreaChange={(value) => { setArea(value); changeScope() }} onRefresh={() => void availability.refetch()}/>
    <div className="parking-booking-layout">
      <div className="parking-map-column">
        <div className="parking-live-row"><span className={`parking-live-status ${availability.isError ? "parking-live-error" : ""}`}><i/>{availability.isError ? "状态更新中断" : availability.isPending ? "正在获取状态" : "预约状态已同步"}</span><time>{parkingClock(availability.data?.asOf)}</time></div>
        {!date ? <EmptyState title="未选择日期"/> : availability.isPending ? <div className="parking-map-loading"><LoadingRows count={4}/></div> : availability.isError && !availability.data ? <ErrorState message="车位状态加载失败" onRetry={() => void availability.refetch()}/> : visibleSpaces.length ? <ParkingMap spaces={visibleSpaces} selectedId={selectedId} disabled={reserve.isPending || availability.isError || expired} onSelect={(space) => { setSelectedId((current) => current === space.id ? null : space.id); setNotice(""); setResult(null); reserve.reset() }}/> : <EmptyState title="该区域暂无车位"/>}
        {availability.isError && availability.data ? <p className="form-error" role="alert">车位状态更新失败，恢复连接后可继续申请。</p> : null}
        {notice ? <p className="conflict-message" role="alert">{notice}</p> : null}
        {expired ? <p className="form-error" role="alert">所选时段已开始，请选择之后的时段。</p> : null}
      </div>
      <aside className="parking-booking-summary" aria-label="预约信息">
        {result ? <div className="parking-request-result" role="status">
          <span className="parking-result-mark"><Check size={25} aria-hidden="true"/></span>
          <h2>申请已提交</h2><StatusBadge status={result.status}/>
          <dl className="parking-detail-list"><div><dt>车位</dt><dd>{result.areaName} · {result.spaceNo}</dd></div><div><dt>日期</dt><dd>{result.date}</dd></div><div><dt>时段</dt><dd>{result.start.slice(0, 5)} - {result.end.slice(0, 5)}</dd></div><div><dt>申请编号</dt><dd>#{result.id}</dd></div></dl>
          <Button variant="outline" onClick={() => { setResult(null); reserve.reset() }}>继续预约</Button>
        </div> : <form onSubmit={(event) => { event.preventDefault(); if (canSubmit && selected && !reserve.isPending) reserve.mutate({ parkingSpaceId: selected.id, date, start: slot.start, end: slot.end, plateNumber: plateNumber.trim().toUpperCase() || null }) }}>
          <h2>预约信息</h2>
          <div className={`parking-selected-space ${selected ? "has-selection" : ""}`}><MapPin size={21} aria-hidden="true"/><div><strong>{selected?.spaceNo ?? "未选择车位"}</strong><span>{selected?.areaName ?? "--"}</span></div></div>
          <dl className="parking-detail-list"><div><dt><CalendarDays size={15} aria-hidden="true"/>日期</dt><dd>{date || "--"}</dd></div><div><dt><Clock3 size={15} aria-hidden="true"/>时段</dt><dd>{slot.start} - {slot.end}</dd></div></dl>
          <label className="field-label">车牌号（选填）<Input maxLength={20} placeholder="例如：京A12345" value={plateNumber} disabled={reserve.isPending} onChange={(event) => setPlateNumber(event.target.value)}/></label>
          <div className="parking-approval-note"><Clock3 size={15} aria-hidden="true"/><span>审批方式：物业审核</span></div>
          {reserve.isError ? <p className="form-error" role="alert">{errorMessage(reserve.error)}</p> : null}
          <Button type="submit" disabled={!canSubmit || reserve.isPending}>{reserve.isPending ? <LoaderCircle className="spin" size={17} aria-hidden="true"/> : <Send size={16} aria-hidden="true"/>}{reserve.isPending ? "正在提交" : "提交预约申请"}</Button>
        </form>}
      </aside>
    </div>
  </div>
}
