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
  communityId: number
  title: string
  content: string
  status: "DRAFT" | "PUBLISHED" | "WITHDRAWN"
  publishedAt: string | null
  publisherId: number
}

export interface RepairEvent {
  id: number
  actorId: number
  action: string
  fromStatus: string | null
  toStatus: string
  note: string | null
  createdAt: string
}

export interface RepairImage {
  id: number
  fileName: string
  contentType: string
  size: number
  width: number
  height: number
  url: string
  createdAt: string
}

export interface Repair {
  id: number
  communityId: number
  houseId: number
  creatorId: number
  assigneeId: number | null
  category: string
  description: string
  priority: "NORMAL" | "URGENT"
  status: string
  rating: number | null
  ratingComment: string | null
  createdAt: string
  events: RepairEvent[]
  images?: RepairImage[]
}

export interface Bill {
  id: number
  type: string
  period: string
  amount: string
  status: "UNPAID" | "PAID"
  paidAt: string | null
}

export interface PaymentResult {
  billId: number
  amount: string
  status: "PAID"
  paymentRef: string
  paidAt: string
}

export interface ParkingSpace { id: number; spaceNo: string; areaName: string; enabled: boolean }
export type ParkingAvailabilityStatus = "AVAILABLE" | "PENDING" | "OCCUPIED" | "DISABLED"
export interface ParkingAvailabilitySpace extends ParkingSpace {
  availability: ParkingAvailabilityStatus
  isMine: boolean
}
export interface ParkingAvailability { asOf: string; spaces: ParkingAvailabilitySpace[] }
export type ReservationStatus = "PENDING" | "ACTIVE" | "REJECTED" | "CANCELLED"
export interface Reservation {
  id: number
  parkingSpaceId: number
  spaceNo: string
  areaName: string
  date: string
  start: string
  end: string
  status: ReservationStatus
  plateNumber: string | null
  applicantName: string
  createdAt: string
  reviewNote: string | null
  reviewedAt: string | null
  reviewedBy: number | null
}
export interface House { id: number; communityId: number; building: string; unit: string; roomNo: string; area: string }
export interface Dashboard { pendingRepairCount: number; completedRepairCount: number; unpaidAmount: string; activeReservationCount: number }
export interface StaffUser { id: number; displayName: string; role: UserRole }

export interface AssistantStatus {
  enabled: boolean
  configured: boolean
  mode: "model" | "mock" | "disabled"
  model: string | null
  provider: string | null
}

export interface AssistantHistoryMessage { role: "user" | "assistant"; content: string }

export interface AssistantReply {
  answer: string
  links: { label: string; path: string }[]
  sources: { label: string; kind: string }[]
  model: string
  dataAsOf: string
}
