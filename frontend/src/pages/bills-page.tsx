import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { errorMessage, formatDate, StatusBadge } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { Bill, Dashboard, PaymentResult } from "@/lib/types"

function PropertyBillingPage() {
  const dashboard = useQuery({ queryKey: queryKeys.dashboard, queryFn: () => api.get<Dashboard>("/dashboard/summary") })
  return <section className="page-section"><PageHeader title="账单管理" description="社区应收款概况。"/>{dashboard.isPending ? <LoadingRows count={1}/> : dashboard.isError ? <ErrorState message="应收款概况加载失败" onRetry={() => void dashboard.refetch()}/> : <div className="collections-panel"><span>当前待收金额</span><strong>¥{dashboard.data?.unpaidAmount}</strong><p>收款状态来自社区账单实时汇总。</p></div>}</section>
}

export function BillsPage() {
  const { user } = useAuth()
  const client = useQueryClient()
  const [status, setStatus] = useState<"UNPAID" | "PAID">("UNPAID")
  const [selected, setSelected] = useState<Bill | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentKey, setPaymentKey] = useState("")
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null)
  const bills = useQuery({ queryKey: queryKeys.bills(status), queryFn: () => api.get<Bill[]>(`/bills?status=${status}`), enabled: user?.role === "OWNER" })
  const payment = useMutation({
    mutationFn: () => api.post<PaymentResult>(`/bills/${selected?.id}/simulate-payment`, undefined, { "Idempotency-Key": paymentKey }),
    onSuccess: async (result) => { setPaymentResult(result); await Promise.all([client.invalidateQueries({ queryKey: queryKeys.billsRoot }), client.invalidateQueries({ queryKey: queryKeys.dashboard })]); toast.success("缴费成功") },
  })

  if (!user) return null
  if (user.role === "PROPERTY") return <PropertyBillingPage/>

  function openPayment() {
    if (!paymentKey) setPaymentKey(crypto.randomUUID())
    payment.reset()
    setPaymentResult(null)
    setPaymentOpen(true)
  }

  function closePayment() {
    setPaymentOpen(false)
    if (paymentResult) { setSelected(null); setPaymentKey(""); setPaymentResult(null) }
  }

  return (
    <section className="page-section">
      <PageHeader title="生活缴费" description="查看账单详情并完成模拟缴费。"/>
      <Tabs value={status} onValueChange={(value) => { setStatus(value as "UNPAID" | "PAID"); setSelected(null); setPaymentKey("") }}><TabsList aria-label="账单状态"><TabsTrigger value="UNPAID">待缴</TabsTrigger><TabsTrigger value="PAID">已缴</TabsTrigger></TabsList></Tabs>
      {bills.isPending
        ? <LoadingRows count={2}/>
        : bills.isError
          ? <ErrorState message="账单加载失败" onRetry={() => void bills.refetch()}/>
          : bills.data?.length
            ? <div className="sparse-list bill-list">{bills.data.map((bill) => <button type="button" className="sparse-row" key={bill.id} onClick={() => { setSelected(bill); setPaymentKey("") }} aria-label={`查看账单：${bill.type}`}><span className="row-copy"><strong>{bill.type}</strong><small>{bill.period}</small></span><span className="bill-amount">¥{bill.amount}</span><StatusBadge status={bill.status}/></button>)}</div>
            : <EmptyState title={status === "UNPAID" ? "没有待缴账单" : "暂无已缴账单"}/>}

      <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) { setSelected(null); setPaymentKey("") } }}><SheetContent className="detail-sheet" aria-describedby="bill-detail-description"><div className="sheet-layout"><SheetHeader><SheetTitle>{selected?.type}</SheetTitle><SheetDescription id="bill-detail-description">账单期间 {selected?.period}</SheetDescription></SheetHeader>{selected ? <div className="detail-scroll"><section className="bill-total"><span>应缴金额</span><strong>¥{selected.amount}</strong></section><dl className="detail-list"><div><dt>状态</dt><dd><StatusBadge status={selected.status}/></dd></div><div><dt>缴费时间</dt><dd>{formatDate(selected.paidAt)}</dd></div></dl></div> : null}{selected?.status === "UNPAID" ? <SheetFooter><Button onClick={openPayment}>确认缴费</Button></SheetFooter> : null}</div></SheetContent></Sheet>

      <Dialog open={paymentOpen} onOpenChange={(open) => { if (!open && !payment.isPending) closePayment() }}><DialogContent aria-describedby="payment-description"><DialogHeader><DialogTitle>{paymentResult ? "缴费完成" : "确认模拟缴费"}</DialogTitle><DialogDescription id="payment-description">{paymentResult ? "服务端已返回本次缴费结果。" : "该操作仅用于社区演示，不会发起真实扣款。"}</DialogDescription></DialogHeader>{paymentResult ? <div className="payment-result"><span className="result-icon"><Check aria-hidden="true" size={24}/></span><strong>¥{paymentResult.amount}</strong><span>支付参考号 {paymentResult.paymentRef}</span></div> : <div className="payment-summary"><span>{selected?.type}</span><strong>¥{selected?.amount}</strong></div>}{payment.isError ? <p className="form-error" role="alert">{errorMessage(payment.error)}</p> : null}<DialogFooter>{paymentResult ? <Button onClick={closePayment}>完成</Button> : <><Button variant="outline" onClick={closePayment} disabled={payment.isPending}>返回</Button><Button onClick={() => payment.mutate()} disabled={payment.isPending || !paymentKey}>{payment.isPending ? <><LoaderCircle className="spin" aria-hidden="true" size={17}/>正在缴费</> : payment.isError ? "重试缴费" : "确认缴费"}</Button></>}</DialogFooter></DialogContent></Dialog>
    </section>
  )
}
