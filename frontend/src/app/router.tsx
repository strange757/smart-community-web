import type { ReactNode } from "react"
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import type { UserRole } from "@/lib/types"

const defaultRoutes: Record<UserRole, string> = {
  OWNER: "/app/home",
  PROPERTY: "/app/operations",
  MAINTENANCE: "/app/work-orders",
}

export function defaultRouteForRole(role: UserRole): string {
  return defaultRoutes[role]
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

function RolePage({ roles, title }: { roles: UserRole[]; title: string }) {
  const { user } = useAuth()
  if (!user) return null
  return (
    <RoleRouteGuard role={user.role} allowedRoles={roles}>
      <PlaceholderPage title={title} />
    </RoleRouteGuard>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="page-section">
      <header className="page-heading">
        <h1>{title}</h1>
      </header>
    </section>
  )
}

function LoginPlaceholder() {
  const { status, user } = useAuth()
  if (status === "restoring") return <SessionLoading />
  if (user) return <Navigate to={defaultRouteForRole(user.role)} replace />

  return (
    <main className="login-page">
      <Card className="login-card">
        <CardHeader>
          <CardTitle>和邻智慧社区</CardTitle>
          <CardDescription>社区账号登录</CardDescription>
        </CardHeader>
      </Card>
    </main>
  )
}

function RootRedirect() {
  const { status, user } = useAuth()
  if (status === "restoring") return <SessionLoading />
  return <Navigate to={user ? defaultRouteForRole(user.role) : "/login"} replace />
}

export const appRouter = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <LoginPlaceholder /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/app",
        element: <AuthenticatedShell />,
        children: [
          { index: true, element: <RoleIndex /> },
          { path: "home", element: <RolePage roles={["OWNER"]} title="首页" /> },
          { path: "services", element: <RolePage roles={["OWNER"]} title="社区服务" /> },
          { path: "progress", element: <RolePage roles={["OWNER"]} title="我的进度" /> },
          { path: "operations", element: <RolePage roles={["PROPERTY"]} title="运营首页" /> },
          { path: "repairs", element: <RolePage roles={["PROPERTY"]} title="报修工单" /> },
          { path: "billing", element: <RolePage roles={["PROPERTY"]} title="账单管理" /> },
          { path: "work-orders", element: <RolePage roles={["MAINTENANCE"]} title="我的工单" /> },
          { path: "notices", element: <RolePage roles={["OWNER", "PROPERTY", "MAINTENANCE"]} title="消息" /> },
          { path: "profile", element: <RolePage roles={["OWNER", "PROPERTY", "MAINTENANCE"]} title="我的" /> },
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
