import type { UserRole } from "@/lib/types"

const routes: Record<UserRole, string> = {
  OWNER: "/app/home",
  PROPERTY: "/app/operations",
  MAINTENANCE: "/app/work-orders",
}

export const roleLabels: Record<UserRole, string> = {
  OWNER: "业主",
  PROPERTY: "物业人员",
  MAINTENANCE: "维修人员",
}

export function routeForRole(role: UserRole): string {
  return routes[role]
}
