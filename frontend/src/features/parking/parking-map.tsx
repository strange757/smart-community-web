import { ArrowRight, ArrowUp, Ban, Check, Clock3, SquareParking } from "lucide-react"
import type { CSSProperties } from "react"

import type { ParkingAvailabilitySpace, ParkingAvailabilityStatus } from "@/lib/types"
import "./parking.css"

const availabilityLabels: Record<ParkingAvailabilityStatus, string> = {
  AVAILABLE: "空闲", PENDING: "待审批", OCCUPIED: "已占用", DISABLED: "已停用",
}

interface ParkingMapProps {
  spaces: ParkingAvailabilitySpace[]
  selectedId?: number | null
  disabled?: boolean
  onSelect?: (space: ParkingAvailabilitySpace) => void
}

export function ParkingMap({ spaces, selectedId, disabled = false, onSelect }: ParkingMapProps) {
  const areas = Array.from(new Set(spaces.map((space) => space.areaName)))

  return (
    <div className="parking-map">
      <div className="parking-map-heading"><span><SquareParking size={19} aria-hidden="true"/>车位平面图</span><span className="parking-north"><ArrowUp size={16} aria-hidden="true"/>N</span></div>
      <div className="parking-map-legend" aria-label="车位状态图例">
        {Object.entries(availabilityLabels).map(([status, label]) => <span key={status}><i data-availability={status}/>{label}</span>)}
        {onSelect ? <span><i data-availability="SELECTED"/>已选中</span> : null}
      </div>
      <div className="parking-map-ground">
        {areas.map((area) => {
          const areaSpaces = spaces.filter((space) => space.areaName === area)
          const columns = Math.min(6, Math.max(2, Math.ceil(areaSpaces.length / 2)))
          const rows: ParkingAvailabilitySpace[][] = []
          for (let index = 0; index < areaSpaces.length; index += columns) rows.push(areaSpaces.slice(index, index + columns))
          return <section className="parking-area" key={area} role="group" aria-label={`${area}车位图`}>
            <div className="parking-area-heading"><strong>{area}</strong><span>{areaSpaces.filter((space) => space.availability === "AVAILABLE").length} / {areaSpaces.length} 空闲</span></div>
            {rows.map((row, rowIndex) => <div className="parking-map-row" key={row[0].id}>
              <div className={`parking-bay-row ${rowIndex % 2 ? "parking-bay-row-bottom" : ""}`} style={{ "--parking-columns": columns } as CSSProperties}>
                {row.map((space) => {
                  const selected = selectedId === space.id
                  const unavailable = space.availability !== "AVAILABLE"
                  const label = `${space.spaceNo} · ${availabilityLabels[space.availability]}${space.isMine ? " · 我的预约" : ""}${selected ? " · 已选中" : ""}`
                  return <button key={space.id} type="button" className="parking-bay" data-availability={space.availability} data-selected={selected} aria-label={label} title={label} aria-pressed={selected} disabled={disabled || unavailable || !onSelect} onClick={() => onSelect?.(space)}>
                    <strong className="parking-bay-number">{space.spaceNo}</strong>
                    <span className="parking-bay-vehicle" aria-hidden="true">
                      {space.availability === "DISABLED" ? <Ban size={28}/> : selected || unavailable ? <img src="/parking-car.png" alt="" width={71} height={131}/> : <SquareParking size={29}/>}
                    </span>
                    <span className="parking-bay-status">{selected ? <Check size={12} aria-hidden="true"/> : space.availability === "PENDING" ? <Clock3 size={12} aria-hidden="true"/> : null}{selected ? "已选中" : space.isMine ? "我的预约" : availabilityLabels[space.availability]}</span>
                  </button>
                })}
              </div>
              {rowIndex % 2 === 0 ? <div className="parking-aisle" aria-hidden="true"><ArrowRight size={24}/><span>行车通道</span><ArrowRight size={24}/></div> : null}
            </div>)}
          </section>
        })}
        <div className="parking-map-gate" aria-hidden="true"><span>入口 <ArrowRight size={15}/></span><span>出口 <ArrowRight size={15}/></span></div>
      </div>
    </div>
  )
}
