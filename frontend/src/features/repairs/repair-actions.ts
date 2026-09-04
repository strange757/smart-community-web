import type { UserRole } from "@/components/layout/app-shell"

export type RepairAction = "assign" | "start" | "complete" | "confirm" | "rate" | "cancel"

const actionMap: Partial<Record<UserRole, Record<string, RepairAction[]>>> = {
  OWNER: {
    SUBMITTED: ["cancel"],
    ASSIGNED: ["cancel"],
    COMPLETED: ["confirm"],
    CONFIRMED: ["rate"],
  },
  PROPERTY: { SUBMITTED: ["assign"] },
  MAINTENANCE: { ASSIGNED: ["start"], IN_PROGRESS: ["complete"] },
}

export function repairActionsFor(role: UserRole, status: string): RepairAction[] {
  return actionMap[role]?.[status] ?? []
}
