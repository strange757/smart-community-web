import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Search } from "lucide-react"
import { useState, type FormEvent } from "react"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { formatDate, StatusBadge } from "@/lib/presentation"
import "@/features/billing/community-billing.css"

interface CommunityBill {
  id: number
  type: string
  period: string
  amount: string
  status: "UNPAID" | "PAID"
  paidAt: string | null
  houseLabel: string
  ownerName: string
}

interface CommunityBillResult {
  items: CommunityBill[]
  total: number
  page: number
  pageSize: number
  summary: { unpaidAmount: string; paidAmount: string; unpaidCount: number; paidCount: number }
  types: string[]
  periods: string[]
}

interface BillFilters { status: string; billType: string; period: string; search: string }
const emptyFilters: BillFilters = { status: "", billType: "", period: "", search: "" }
const pageSize = 20
const amountFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function CommunityBillingPage() {
  const [filters, setFilters] = useState<BillFilters>(emptyFilters)
  const [searchInput, setSearchInput] = useState("")
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  const bills = useQuery({
    queryKey: ["bills", "community", page, filters],
    queryFn: () => api.get<CommunityBillResult>(`/bills/community?${params}`),
    placeholderData: keepPreviousData,
  })
  const data = bills.data
  const summary = bills.isError || bills.isPlaceholderData ? undefined : data?.summary
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))
  const hasFilters = Object.values(filters).some(Boolean) || Boolean(searchInput)

  function updateFilters(next: Partial<BillFilters>) {
    setFilters((previous) => ({ ...previous, ...next }))
    setPage(1)
  }

  function search(event: FormEvent) {
    event.preventDefault()
    updateFilters({ search: searchInput.trim() })
  }

  return <section className="page-section community-billing-page">
    <PageHeader title="账单管理" action={<Button variant="outline" size="icon" aria-label="刷新社区账单" title="刷新社区账单" disabled={bills.isFetching} onClick={() => void bills.refetch()}><RefreshCw size={18} className={bills.isFetching ? "spin" : ""} aria-hidden="true"/></Button>}/>
    <div className="community-billing-summary" aria-label="筛选汇总">
      <div><span>待缴金额</span><strong>{summary ? `¥${amountFormat.format(Number(summary.unpaidAmount))}` : "--"}</strong><small>{summary ? `${summary.unpaidCount} 笔待缴` : "--"}</small></div>
      <div><span>已缴金额</span><strong>{summary ? `¥${amountFormat.format(Number(summary.paidAmount))}` : "--"}</strong><small>{summary ? `${summary.paidCount} 笔已缴` : "--"}</small></div>
      <div><span>筛选账单</span><strong>{summary ? data?.total.toLocaleString("zh-CN") : "--"}</strong><small>笔</small></div>
    </div>
    <div className="community-billing-toolbar">
      <Tabs value={filters.status || "ALL"} onValueChange={(status) => updateFilters({ status: status === "ALL" ? "" : status })}><TabsList aria-label="缴费状态"><TabsTrigger value="ALL">全部</TabsTrigger><TabsTrigger value="UNPAID">待缴</TabsTrigger><TabsTrigger value="PAID">已缴</TabsTrigger></TabsList></Tabs>
      <form className="community-billing-filters" onSubmit={search}>
        <label><span>费用类型</span><select className="input" value={filters.billType} onChange={(event) => updateFilters({ billType: event.target.value })}><option value="">全部费用</option>{data?.types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label><span>账期</span><select className="input" value={filters.period} onChange={(event) => updateFilters({ period: event.target.value })}><option value="">全部账期</option>{data?.periods.map((period) => <option key={period} value={period}>{period}</option>)}</select></label>
        <label className="community-billing-search"><span>房屋 / 住户</span><Input type="search" aria-label="搜索房屋或住户" placeholder="楼栋、房号或姓名" maxLength={160} value={searchInput} onChange={(event) => setSearchInput(event.target.value)}/></label>
        <Button variant="outline" size="icon" type="submit" aria-label="搜索账单" title="搜索账单"><Search size={18} aria-hidden="true"/></Button>
        <Button variant="ghost" size="icon" type="button" aria-label="重置筛选" title="重置筛选" disabled={!hasFilters} onClick={() => { setFilters(emptyFilters); setSearchInput(""); setPage(1) }}><RotateCcw size={17} aria-hidden="true"/></Button>
      </form>
    </div>
    {bills.isPending ? <LoadingRows count={5}/> : bills.isError ? <ErrorState message="社区账单加载失败" onRetry={() => void bills.refetch()}/> : data?.items.length ? <div className="community-billing-table-scroll" aria-busy={bills.isFetching}>
      <table className="community-billing-table" aria-label="社区账单"><thead><tr><th scope="col">住户</th><th scope="col">房屋</th><th scope="col">费项</th><th scope="col">账期</th><th scope="col" className="community-billing-amount">金额</th><th scope="col">缴费状态</th></tr></thead><tbody>{data.items.map((bill) => <tr key={bill.id}>
        <td className="community-billing-owner">{bill.ownerName}</td><td>{bill.houseLabel}</td><td>{bill.type}</td><td>{bill.period}</td><td className="community-billing-amount">¥{amountFormat.format(Number(bill.amount))}</td><td><StatusBadge status={bill.status}/>{bill.paidAt ? <small>{formatDate(bill.paidAt)}</small> : null}</td>
      </tr>)}</tbody></table>
    </div> : <EmptyState title="没有符合条件的账单"/>}
    <nav className="billing-pagination" aria-label="账单分页">
      <span>{!bills.isPending && !bills.isError ? `共 ${data?.total ?? 0} 条账单` : "--"}</span>
      <div><Button variant="outline" size="icon" title="上一页" aria-label="上一页" disabled={page <= 1 || bills.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={18} aria-hidden="true"/></Button><span aria-live="polite">第 {page} / {totalPages} 页</span><Button variant="outline" size="icon" title="下一页" aria-label="下一页" disabled={page >= totalPages || bills.isFetching || bills.isError} onClick={() => setPage((current) => current + 1)}><ChevronRight size={18} aria-hidden="true"/></Button></div>
    </nav>
  </section>
}
