import { ChevronDown, LoaderCircle, LogIn } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Navigate, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { errorMessage } from "@/lib/presentation"
import { routeForRole } from "@/lib/roles"

const demoAccounts = [
  { label: "业主", username: "owner" },
  { label: "物业", username: "property" },
  { label: "维修", username: "maintenance" },
] as const

export function LoginPage() {
  const { login, status, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  if (user) return <Navigate to={routeForRole(user.role)} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError("请输入账号和密码")
      return
    }
    setPending(true)
    setError("")
    try {
      const session = await login(username.trim(), password)
      navigate(routeForRole(session.role), { replace: true })
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-visual" aria-label="和邻社区住宅环境">
        <img src="/community-residence.jpg" alt="现代社区住宅外景" />
      </div>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <div className="login-brand"><span aria-hidden="true">和</span><strong>和邻智慧社区</strong></div>
          <header className="login-heading">
            <h1 id="login-title">欢迎回来</h1>
            <p>登录后查看社区服务与事项进度</p>
          </header>
          <form className="form-stack" onSubmit={onSubmit}>
            <label className="field-label">账号<Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" disabled={pending || status === "restoring"} /></label>
            <label className="field-label">密码<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={pending || status === "restoring"} /></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <Button type="submit" size="lg" disabled={pending || status === "restoring"}>
              {pending ? <><LoaderCircle className="spin" aria-hidden="true" size={18} />正在登录</> : <><LogIn aria-hidden="true" size={18} />登录</>}
            </Button>
          </form>
          <details className="demo-accounts">
            <summary>使用演示账号 <ChevronDown aria-hidden="true" size={16} /></summary>
            <div className="demo-account-options">
              {demoAccounts.map((account) => (
                <Button key={account.username} type="button" variant="ghost" size="sm" onClick={() => { setUsername(account.username); setPassword("123456") }}>
                  {account.label}
                </Button>
              ))}
            </div>
          </details>
        </div>
      </section>
    </main>
  )
}
