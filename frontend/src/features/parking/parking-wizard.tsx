import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, LoadingRows } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { ApiError, api } from "@/lib/api"
import { errorMessage, formatTime } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { ParkingSpace, Reservation } from "@/lib/types"

type WizardStep = 1 | 2 | 3 | 4 | 5
const steps = ["日期", "车位", "时段", "确认", "结果"] as const
const timeSlots = [
  ["09:00", "10:00"],
  ["10:00", "11:00"],
  ["14:00", "15:00"],
  ["15:00", "16:00"],
  ["18:00", "19:00"],
] as const

function todayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function SelectionSummary({ label, value, onModify }: { label: string; value: string; onModify: () => void }) {
  return <div className="selection-summary" data-testid="parking-selection-summary"><span><small>{label}</small><strong>{value}</strong></span><Button type="button" variant="ghost" size="sm" onClick={onModify}>修改</Button></div>
}

export function ParkingWizard() {
  const client = useQueryClient()
  const [step, setStep] = useState<WizardStep>(1)
  const [date, setDate] = useState("")
  const [space, setSpace] = useState<ParkingSpace | null>(null)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [conflict, setConflict] = useState("")
  const [result, setResult] = useState<Reservation | null>(null)

  const spaces = useQuery({
    queryKey: queryKeys.parkingSpaces(date, start, end),
    queryFn: () => {
      const params = new URLSearchParams({ date })
      if (start && end) { params.set("start", start); params.set("end", end) }
      return api.get<ParkingSpace[]>(`/parking/spaces?${params}`)
    },
    enabled: step >= 2 && step < 5 && Boolean(date),
  })
  const reserve = useMutation({
    mutationFn: () => api.post<Reservation>("/parking/reservations", { parkingSpaceId: space?.id, date, start, end }),
    onSuccess: async (reservation) => {
      setResult(reservation)
      setConflict("")
      setStep(5)
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.parkingReservations }),
        client.invalidateQueries({ queryKey: queryKeys.parkingSpacesRoot }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ])
      toast.success("车位预约成功")
    },
    onError: (nextError) => {
      if (nextError instanceof ApiError && nextError.status === 409) {
        setConflict(nextError.message)
        setStep(3)
      }
    },
  })

  function changeDate(nextDate: string) {
    setDate(nextDate)
    setSpace(null)
    setStart("")
    setEnd("")
    setConflict("")
    setResult(null)
  }

  function restart() {
    setStep(1)
    setDate("")
    setSpace(null)
    setStart("")
    setEnd("")
    setConflict("")
    setResult(null)
    reserve.reset()
  }

  return (
    <div className="parking-wizard">
      <ol className="wizard-steps" aria-label="预约步骤">{steps.map((label, index) => <li key={label} className={index + 1 === step ? "current" : index + 1 < step ? "complete" : ""}><span>{index + 1 < step ? <Check aria-hidden="true" size={14}/> : index + 1}</span><small>{label}</small></li>)}</ol>
      <div className="selection-stack">
        {step > 1 && date ? <SelectionSummary label="日期" value={date} onModify={() => setStep(1)}/> : null}
        {step > 2 && space ? <SelectionSummary label="车位" value={`${space.areaName} · ${space.spaceNo}`} onModify={() => setStep(2)}/> : null}
        {step > 3 && start && end ? <SelectionSummary label="时段" value={`${start} - ${end}`} onModify={() => setStep(3)}/> : null}
      </div>

      {step === 1 ? <section className="wizard-current" aria-labelledby="parking-date"><h2 id="parking-date">选择日期</h2><label className="field-label">预约日期<input className="input" type="date" min={todayIso()} value={date} onChange={(event) => changeDate(event.target.value)}/></label><Button disabled={!date} onClick={() => setStep(2)}>下一步</Button></section> : null}

      {step === 2 ? <section className="wizard-current" aria-labelledby="parking-space"><h2 id="parking-space">选择车位</h2>{spaces.isPending ? <LoadingRows count={2}/> : spaces.isError ? <ErrorState message="可用车位加载失败" onRetry={() => void spaces.refetch()}/> : spaces.data?.length ? <div className="choice-grid">{spaces.data.map((item) => <button type="button" className="choice-button" key={item.id} onClick={() => { setSpace(item); setConflict(""); setStep(3) }}><strong>{item.spaceNo}</strong><small>{item.areaName}</small></button>)}</div> : <EmptyState title="当天暂无可用车位" detail="请修改预约日期"/>}</section> : null}

      {step === 3 ? <section className="wizard-current" aria-labelledby="parking-time"><h2 id="parking-time">选择时段</h2>{conflict ? <p className="conflict-message" role="alert">{conflict}，请重新选择时段。</p> : null}<div className="time-grid">{timeSlots.map(([slotStart, slotEnd]) => <button type="button" className="choice-button" aria-pressed={start === slotStart && end === slotEnd} key={slotStart} onClick={() => { setStart(slotStart); setEnd(slotEnd); setConflict(""); setStep(4) }}>{slotStart} - {slotEnd}</button>)}</div></section> : null}

      {step === 4 ? <section className="wizard-current confirm-step" aria-labelledby="parking-confirm"><h2 id="parking-confirm">确认预约</h2><p>确认以上日期、车位与时段后提交预约。</p>{reserve.isError && !(reserve.error instanceof ApiError && reserve.error.status === 409) ? <p className="form-error" role="alert">{errorMessage(reserve.error)}</p> : null}<Button disabled={reserve.isPending} onClick={() => reserve.mutate()}>{reserve.isPending ? <><LoaderCircle className="spin" aria-hidden="true" size={17}/>正在预约</> : "确认预约"}</Button></section> : null}

      {step === 5 && result ? <section className="wizard-current result-step" aria-labelledby="parking-result"><span className="result-icon"><Check aria-hidden="true" size={25}/></span><h2 id="parking-result">预约成功</h2><p>{result.date} · {formatTime(result.start)} - {formatTime(result.end)}</p><Button variant="outline" onClick={restart}>继续预约</Button></section> : null}
    </div>
  )
}
