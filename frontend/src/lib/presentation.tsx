import { Badge } from "@/components/ui/badge"

const statusLabels: Record<string, string> = {
  SUBMITTED: "待派单",
  ASSIGNED: "已指派",
  IN_PROGRESS: "处理中",
  COMPLETED: "待确认",
  CONFIRMED: "待评价",
  RATED: "已完成",
  CANCELLED: "已取消",
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  WITHDRAWN: "已撤回",
  UNPAID: "待缴",
  PAID: "已缴",
  ACTIVE: "预约中",
}

export function labelForStatus(status: string): string {
  return statusLabels[status] ?? status
}

export function StatusBadge({ status }: { status: string }) {
  const variant = status === "CANCELLED" || status === "WITHDRAWN"
    ? "danger"
    : status === "SUBMITTED" || status === "UNPAID" || status === "DRAFT"
      ? "warning"
      : status === "ASSIGNED" || status === "IN_PROGRESS"
        ? "info"
        : "success"
  return <Badge variant={variant}>{labelForStatus(status)}</Badge>
}

export function formatDate(value?: string | null): string {
  if (!value) return "暂无时间"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date)
}

export function formatTime(value: string): string {
  return value.slice(0, 5)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试"
}
