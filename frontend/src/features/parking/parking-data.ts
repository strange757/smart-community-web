import { useQuery, type QueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type { ParkingAvailability, Reservation } from "@/lib/types"

export const PARKING_REFRESH_MS = 3_000
export const parkingTimeSlots = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
  { start: "18:00", end: "19:00" },
] as const
export type ParkingTimeSlot = typeof parkingTimeSlots[number]

export function parkingDate(daysAhead = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(Date.now() + daysAhead * 86_400_000))
}

export function parkingDateTime(date: string, time: string): number {
  return Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`)
}

export function reservationHasEnded(reservation: Reservation): boolean {
  return parkingDateTime(reservation.date, reservation.end) <= Date.now()
}

export function useParkingAvailability(date: string, slot: ParkingTimeSlot) {
  return useQuery({
    queryKey: queryKeys.parkingAvailability(date, slot.start, slot.end),
    queryFn: () => api.get<ParkingAvailability>(`/parking/availability?${new URLSearchParams({ date, start: slot.start, end: slot.end })}`),
    enabled: Boolean(date),
    refetchInterval: PARKING_REFRESH_MS,
    refetchOnWindowFocus: true,
  })
}

export function refreshParking(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.parkingReservationsRoot }),
    client.invalidateQueries({ queryKey: queryKeys.parkingSpacesRoot }),
    client.invalidateQueries({ queryKey: queryKeys.dashboard }),
  ])
}

export function parkingClock(value?: string | number | null): string {
  if (!value) return "--:--"
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value))
}
