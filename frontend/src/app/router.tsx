import type { ReactNode } from "react"
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { routeForRole } from "@/lib/roles"
import type { UserRole } from "@/lib/types"
import { AssistantPage } from "@/pages/assistant-page"
import { BillsPage } from "@/pages/bills-page"
import { HomePage } from "@/pages/home-page"
import { LoginPage } from "@/pages/login-page"
import { NoticesPage } from "@/pages/notices-page"
import { OperationsPage } from "@/pages/operations-page"
import { ParkingPage } from "@/pages/parking-page"
import { ParkingManagementPage } from "@/pages/parking-management-page"
import { ProfilePage } from "@/pages/profile-page"
import { ProgressPage } from "@/pages/progress-page"
import { RepairsPage } from "@/pages/repairs-page"
import { ServicesPage } from "@/pages/services-page"

export function defaultRouteForRole(role: UserRole): string {
  return routeForRole(role)
}

export function RoleRouteGuard({
  role,
  allowedRoles,
  children,
}: {
  role: UserRole
  allowedRoles: UserRole[]
  children: ReactNode
}) {
  if (!allowedRoles.includes(role)) {
    return <Navigate to={defaultRouteForRole(role)} replace />
  }
  return children
}

function SessionLoading() {
  return (
    <div className="session-loading" aria-label="正在恢复登录状态">
      <Skeleton className="session-loading-sidebar" />
      <div className="session-loading-main">
        <Skeleton className="session-loading-header" />
        <Skeleton className="session-loading-content" />
      </div>
    </div>
  )
}

function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === "restoring") return <SessionLoading />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

function AuthenticatedShell() {
  const { user, logout } = useAuth()
  if (!user) return null
  return <AppShell user={user} onLogout={logout}><Outlet /></AppShell>
}

function RoleIndex() {
  const { user } = useAuth()
  return user ? <Navigate to={defaultRouteForRole(user.role)} replace /> : null
}

function RolePage({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return null
  return (
    <RoleRouteGuard role={user.role} allowedRoles={roles}>
      {children}
    </RoleRouteGuard>
  )
}

function RootRedirect() {
  const { status, user } = useAuth()
  if (status === "restoring") return <SessionLoading />
  return <Navigate to={user ? defaultRouteForRole(user.role) : "/login"} replace />
}

export const appRouter = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/app",
        element: <AuthenticatedShell />,
        children: [
          { index: true, element: <RoleIndex /> },
          { path: "home", element: <RolePage roles={["OWNER"]}><HomePage /></RolePage> },
          { path: "services", element: <RolePage roles={["OWNER"]}><ServicesPage /></RolePage> },
          { path: "assistant", element: <RolePage roles={["OWNER"]}><AssistantPage /></RolePage> },
          { path: "progress", element: <RolePage roles={["OWNER"]}><ProgressPage /></RolePage> },
          { path: "operations", element: <RolePage roles={["PROPERTY"]}><OperationsPage /></RolePage> },
          { path: "repairs", element: <RolePage roles={["OWNER", "PROPERTY"]}><RepairsPage /></RolePage> },
          { path: "bills", element: <RolePage roles={["OWNER"]}><BillsPage /></RolePage> },
          { path: "parking", element: <RolePage roles={["OWNER"]}><ParkingPage /></RolePage> },
          { path: "parking-management", element: <RolePage roles={["PROPERTY"]}><ParkingManagementPage /></RolePage> },
          { path: "billing", element: <RolePage roles={["PROPERTY"]}><BillsPage /></RolePage> },
          { path: "work-orders", element: <RolePage roles={["MAINTENANCE"]}><RepairsPage /></RolePage> },
          { path: "notices", element: <RolePage roles={["OWNER", "PROPERTY", "MAINTENANCE"]}><NoticesPage /></RolePage> },
          { path: "profile", element: <RolePage roles={["OWNER", "PROPERTY", "MAINTENANCE"]}><ProfilePage /></RolePage> },
          { path: "*", element: <RoleIndex /> },
        ],
      },
    ],
  },
  { path: "*", element: <RootRedirect /> },
])

export function AppRouter() {
  return <RouterProvider router={appRouter} />
}
