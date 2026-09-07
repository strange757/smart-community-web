import { LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { parkingDate, parkingTimeSlots, type ParkingTimeSlot } from "./parking-data"

interface ParkingFiltersProps {
  date: string
  slot: ParkingTimeSlot
  area: string
  areas: string[]
  disabled?: boolean
  refreshing: boolean
  onDateChange: (date: string) => void
  onSlotChange: (slot: ParkingTimeSlot) => void
  onAreaChange: (area: string) => void
  onRefresh: () => void
}

export function ParkingFilters({ date, slot, area, areas, disabled, refreshing, onDateChange, onSlotChange, onAreaChange, onRefresh }: ParkingFiltersProps) {
  return <div className="parking-filters">
    <label className="field-label">预约日期<input className="input" type="date" min={parkingDate()} value={date} disabled={disabled} onChange={(event) => onDateChange(event.target.value)}/></label>
    <label className="field-label">预约时段<select className="input" value={slot.start} disabled={disabled} onChange={(event) => { const selected = parkingTimeSlots.find((item) => item.start === event.target.value); if (selected) onSlotChange(selected) }}>{parkingTimeSlots.map((item) => <option value={item.start} key={item.start}>{item.start} - {item.end}</option>)}</select></label>
    <label className="field-label">停车区域<select className="input" value={area} disabled={disabled} onChange={(event) => onAreaChange(event.target.value)}><option value="">全部区域</option>{areas.map((item) => <option key={item}>{item}</option>)}</select></label>
    <Button type="button" variant="outline" size="icon" aria-label="刷新车位状态" title="刷新车位状态" disabled={disabled || refreshing || !date} onClick={onRefresh}>{refreshing ? <LoaderCircle size={17} className="spin" aria-hidden="true"/> : <RefreshCw size={17} aria-hidden="true"/>}</Button>
  </div>
}
