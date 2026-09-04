import { AlertCircle, Inbox } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="page-heading-action">{action}</div> : null}
    </header>
  )
}

export function LoadingRows({ count = 2 }: { count?: number }) {
  return <div className="loading-rows" aria-label="正在加载">{Array.from({ length: count }, (_, index) => <Skeleton key={index} className="loading-row" />)}</div>
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="quiet-state">
      <Inbox aria-hidden="true" size={22} />
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="quiet-state error-state" role="alert">
      <AlertCircle aria-hidden="true" size={22} />
      <strong>暂时无法加载</strong>
      <span>{message}</span>
      {onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>重试</Button> : null}
    </div>
  )
}
