import { Building2, LogOut, ShieldCheck, UserRound } from "lucide-react"

import { PageHeader } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { roleLabels } from "@/lib/roles"

export function ProfilePage() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <section className="page-section profile-page">
      <PageHeader title="我的" description="当前登录身份与社区。"/>
      <div className="profile-identity"><span className="profile-avatar"><UserRound aria-hidden="true" size={28}/></span><div><strong>{user.displayName}</strong><span>{roleLabels[user.role]}</span></div></div>
      <dl className="profile-details"><div><dt><ShieldCheck aria-hidden="true" size={18}/>身份</dt><dd>{roleLabels[user.role]}</dd></div><div><dt><Building2 aria-hidden="true" size={18}/>社区</dt><dd>社区 {user.communityId}</dd></div></dl>
      <Button variant="outline" onClick={logout}><LogOut aria-hidden="true" size={18}/>退出登录</Button>
    </section>
  )
}
