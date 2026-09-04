export type UserRole = "OWNER" | "PROPERTY" | "MAINTENANCE"

export interface CurrentUser {
  id: number
  displayName: string
  role: UserRole
  communityId: number
}

export interface UserSession extends CurrentUser {
  token: string
  expiresInSeconds: number
}

export interface Notice {
  id: number
  title: string
  content: string
  status: "DRAFT" | "PUBLISHED" | "WITHDRAWN"
  publishedAt?: string
}

export interface RepairEvent {
  id: number
  action: string
  fromStatus?: string
  toStatus: string
  note?: string
  createdAt: string
}

export interface Repair {
  id: number
  houseId: number
  creatorId: number
  assigneeId?: number
  category: string
  description: string
  priority: "NORMAL" | "URGENT"
  status: string
  rating?: number
  ratingComment?: string
  createdAt: string
  events: RepairEvent[]
}

export interface Bill {
  id: number
  type: string
  period: string
  amount: string
  status: "UNPAID" | "PAID"
  paidAt?: string
}

export interface ParkingSpace { id: number; spaceNo: string; areaName: string; enabled: boolean }
export interface Reservation { id: number; parkingSpaceId: number; date: string; start: string; end: string; status: "ACTIVE" | "CANCELLED" }
export interface House { id: number; building: string; unit: string; roomNo: string; area: string }
export interface Dashboard { pendingRepairCount: number; completedRepairCount: number; unpaidAmount: string; activeReservationCount: number }
export interface StaffUser { id: number; displayName: string; role: UserRole }
