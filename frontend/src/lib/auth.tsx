import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { api, sessionKey, subscribeToUnauthorized } from "@/lib/api"
import type { CurrentUser, UserSession } from "@/lib/types"

export type AuthStatus = "restoring" | "authenticated" | "anonymous"

interface AuthContextValue {
  user: UserSession | null
  status: AuthStatus
  login: (username: string, password: string) => Promise<UserSession>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function storedSession(): UserSession | null {
  const raw = sessionStorage.getItem(sessionKey)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<UserSession>
    if (
      typeof value.token !== "string"
      || typeof value.expiresInSeconds !== "number"
      || typeof value.id !== "number"
      || typeof value.displayName !== "string"
      || !["OWNER", "PROPERTY", "MAINTENANCE"].includes(value.role ?? "")
      || typeof value.communityId !== "number"
    ) {
      sessionStorage.removeItem(sessionKey)
      return null
    }
    return value as UserSession
  } catch {
    sessionStorage.removeItem(sessionKey)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialSession] = useState(storedSession)
  const [user, setUser] = useState<UserSession | null>(initialSession)
  const [status, setStatus] = useState<AuthStatus>(initialSession ? "restoring" : "anonymous")

  useEffect(() => subscribeToUnauthorized(() => {
    setUser(null)
    setStatus("anonymous")
  }), [])

  useEffect(() => {
    if (!initialSession) return

    let active = true
    api.get<CurrentUser>("/me").then((currentUser) => {
      if (!active) return
      const restored = { ...initialSession, ...currentUser }
      sessionStorage.setItem(sessionKey, JSON.stringify(restored))
      setUser(restored)
      setStatus("authenticated")
    }).catch(() => {
      if (!active) return
      sessionStorage.removeItem(sessionKey)
      setUser(null)
      setStatus("anonymous")
    })

    return () => {
      active = false
    }
  }, [initialSession])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    async login(username, password) {
      const next = await api.post<UserSession>("/auth/login", { username, password })
      sessionStorage.setItem(sessionKey, JSON.stringify(next))
      setUser(next)
      setStatus("authenticated")
      return next
    },
    logout() {
      sessionStorage.removeItem(sessionKey)
      setUser(null)
      setStatus("anonymous")
    },
  }), [status, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside AuthProvider")
  return value
}
