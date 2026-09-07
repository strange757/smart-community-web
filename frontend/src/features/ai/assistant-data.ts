import { Bell, CarFront, ClipboardList, ReceiptText, UserRound, Wrench } from "lucide-react"
import { z } from "zod"

import type { AssistantReply } from "@/lib/types"

export const assistantServices = [
  { title: "房屋报修", detail: "维修申请与处理记录", path: "/app/repairs", keywords: "维修 水电 故障", icon: Wrench },
  { title: "生活缴费", detail: "待缴账单与缴费记录", path: "/app/bills", keywords: "费用 物业费 账单 支付", icon: ReceiptText },
  { title: "车位预约", detail: "车位余量与预约记录", path: "/app/parking", keywords: "停车 车辆 申请", icon: CarFront },
  { title: "社区公告", detail: "社区通知与最新公告", path: "/app/notices", keywords: "消息 通知", icon: Bell },
  { title: "我的进度", detail: "报修与预约办理进度", path: "/app/progress", keywords: "状态 处理 审批", icon: ClipboardList },
  { title: "个人信息", detail: "账户资料与关联房屋", path: "/app/profile", keywords: "我的 业主 住址 房屋", icon: UserRound },
] as const

export const suggestedQuestions = [
  "我还有哪些费用未缴？",
  "我的报修到哪一步？",
  "怎么申请车位？",
  "最近有什么社区通知？",
]

const allowedPaths = new Set<string>(assistantServices.map((service) => service.path))
const replySchema = z.object({
  answer: z.string().trim().min(1).max(8000),
  links: z.array(z.object({ label: z.string().trim().min(1).max(100), path: z.string().max(500) })).max(20),
  sources: z.array(z.object({ label: z.string().trim().min(1).max(100), kind: z.string().max(80) })).max(20),
  model: z.string().trim().min(1).max(120),
  dataAsOf: z.string().max(80).refine((value) => !Number.isNaN(Date.parse(value))),
})

export function parseAssistantReply(value: unknown): AssistantReply {
  const parsed = replySchema.safeParse(value)
  if (!parsed.success) throw new Error("回答格式异常，请重试")
  return {
    ...parsed.data,
    links: parsed.data.links.filter((link, index, links) => allowedPaths.has(link.path) && links.findIndex((other) => other.path === link.path) === index),
  }
}

export function assistantDataTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai", hour12: false,
  }).format(new Date(value))
}
