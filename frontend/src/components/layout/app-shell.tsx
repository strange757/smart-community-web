import * as Avatar from "@radix-ui/react-avatar"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  Bell,
  Building2,
  ChevronDown,
  CircleDot,
  ClipboardList,
  FileText,
  Grid2X2,
  Home,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Receipt,
  Search,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { UserRole, UserSession } from "@/lib/types"

export type { UserRole } from "@/lib/types"

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

const navigation: Record<UserRole, NavItem[]> = {
  OWNER: [
    { label: "首页", to: "/app/home", icon: Home },
    { label: "社区服务", to: "/app/services", icon: Grid2X2 },
    { label: "我的进度", to: "/app/progress", icon: ClipboardList },
    { label: "消息", to: "/app/notices", icon: Bell },
    { label: "我的", to: "/app/profile", icon: UserRound },
  ],
  PROPERTY: [
    { label: "运营首页", to: "/app/operations", icon: LayoutDashboard },
    { label: "报修工单", to: "/app/repairs", icon: Wrench },
    { label: "社区公告", to: "/app/notices", icon: FileText },
    { label: "账单管理", to: "/app/billing", icon: Receipt },
    { label: "我的", to: "/app/profile", icon: UserRound },
  ],
  MAINTENANCE: [
    { label: "我的工单", to: "/app/work-orders", icon: ListTodo },
    { label: "处理中", to: "/app/work-orders?status=IN_PROGRESS", icon: CircleDot },
    { label: "消息", to: "/app/notices", icon: Bell },
    { label: "我的", to: "/app/profile", icon: UserRound },
  ],
}

const roleLabels: Record<UserRole, string> = {
  OWNER: "业主",
  PROPERTY: "物业人员",
  MAINTENANCE: "维修人员",
}

export function navigationForRole(role: UserRole): NavItem[] {
  return navigation[role]
}

export function navForRole(role: UserRole): string[] {
  return navigationForRole(role).map((item) => item.label)
}

function Brand() {
  return (
    <div className="app-brand" aria-label="和邻智慧社区">
      <span className="app-brand-mark" aria-hidden="true"><Building2 size={21} /></span>
      <span className="app-brand-copy"><strong>和邻</strong><small>智慧社区</small></span>
    </div>
  )
}

function NavigationLinks({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const location = useLocation()
  const items = navigationForRole(role)

  return (
    <nav className="app-navigation" aria-label="主导航">
      {items.map(({ label, to, icon: Icon }) => {
        const requiresExactQuery = to.includes("?") || items.some((item) => item.to.startsWith(`${to}?`))
        const isActive = requiresExactQuery
          ? `${location.pathname}${location.search}` === to
          : location.pathname === to

        return (
          <Link
            key={to}
            to={to}
            className={`app-nav-link${isActive ? " app-nav-link-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            title={label}
            onClick={onNavigate}
          >
            <Icon aria-hidden="true" size={19} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="community-search-description">
        <DialogHeader>
          <DialogTitle>搜索社区内容</DialogTitle>
          <DialogDescription id="community-search-description">
            查找服务、工单、公告和账单。
          </DialogDescription>
        </DialogHeader>
        <Input type="search" aria-label="搜索社区内容" placeholder="输入关键词" autoFocus />
      </DialogContent>
    </Dialog>
  )
}

function AccountMenu({ user, onLogout }: { user: UserSession; onLogout: () => void }) {
  const fallback = user.displayName.trim().slice(0, 1) || "邻"

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button className="account-trigger" variant="ghost" aria-label="账户菜单">
          <Avatar.Root className="avatar-root">
            <Avatar.Fallback className="avatar-fallback">{fallback}</Avatar.Fallback>
          </Avatar.Root>
          <ChevronDown className="account-chevron" aria-hidden="true" size={15} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="account-menu" align="end" sideOffset={7}>
          <div className="account-summary">
            <strong>{user.displayName}</strong>
            <span>{roleLabels[user.role]} · 社区 {user.communityId}</span>
          </div>
          <DropdownMenu.Separator className="account-separator" />
          <DropdownMenu.Item className="account-menu-item" onSelect={onLogout}>
            <LogOut aria-hidden="true" size={17} />
            退出登录
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function AppShell({
  user,
  onLogout,
  children,
}: {
  user: UserSession
  onLogout: () => void
  children?: ReactNode
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand />
        <NavigationLinks role={user.role} />
      </aside>

      <div className="app-frame">
        <header className="app-header">
          <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
            <SheetTrigger asChild>
              <Button className="mobile-menu-trigger" variant="ghost" size="icon" aria-label="打开导航菜单">
                <Menu aria-hidden="true" size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent aria-describedby="mobile-navigation-description">
              <SheetHeader>
                <SheetTitle><Brand /></SheetTitle>
                <SheetDescription id="mobile-navigation-description" className="sr-only">
                  选择要前往的页面
                </SheetDescription>
              </SheetHeader>
              <NavigationLinks role={user.role} onNavigate={() => setMobileNavigationOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="community-name"><Building2 aria-hidden="true" size={18} /><span>社区 {user.communityId}</span></div>

          <div className="header-actions">
            <Button variant="ghost" size="icon" aria-label="搜索" onClick={() => setSearchOpen(true)}>
              <Search aria-hidden="true" size={19} />
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link to="/app/notices" aria-label="通知">
                <Bell aria-hidden="true" size={19} />
              </Link>
            </Button>
            <AccountMenu user={user} onLogout={onLogout} />
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
