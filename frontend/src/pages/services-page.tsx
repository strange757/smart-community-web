import { CarFront, ChevronRight, ReceiptText, Wrench } from "lucide-react"
import { Link } from "react-router-dom"

import { PageHeader } from "@/components/page-kit"

const services = [
  { title: "房屋报修", detail: "提交问题并跟踪处理进度", to: "/app/repairs", icon: Wrench },
  { title: "生活缴费", detail: "查看账单并完成模拟缴费", to: "/app/bills", icon: ReceiptText },
  { title: "车位预约", detail: "按日期与时段预约临时车位", to: "/app/parking", icon: CarFront },
] as const

export function ServicesPage() {
  return (
    <section className="page-section">
      <PageHeader title="社区服务" description="选择一项服务开始办理。" />
      <div className="service-list">
        {services.map(({ title, detail, to, icon: Icon }) => (
          <Link className="service-choice" to={to} key={to}>
            <span className="service-icon"><Icon aria-hidden="true" size={22} /></span>
            <span className="row-copy"><strong>{title}</strong><small>{detail}</small></span>
            <ChevronRight aria-hidden="true" size={18} />
          </Link>
        ))}
      </div>
    </section>
  )
}
