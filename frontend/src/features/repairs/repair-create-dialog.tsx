import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { ErrorState, LoadingRows } from "@/components/page-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input, Textarea } from "@/components/ui/input"
import { RepairDraftAssist } from "@/features/ai/draft-assist"
import { api } from "@/lib/api"
import { errorMessage } from "@/lib/presentation"
import { queryKeys } from "@/lib/query-keys"
import type { House, Repair } from "@/lib/types"

export function RepairCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient()
  const houses = useQuery({ queryKey: queryKeys.houses, queryFn: () => api.get<House[]>("/me/houses"), enabled: open })
  const [houseId, setHouseId] = useState("")
  const [category, setCategory] = useState("公共设施")
  const [priority, setPriority] = useState<"NORMAL" | "URGENT">("NORMAL")
  const [description, setDescription] = useState("")
  const [validation, setValidation] = useState("")

  const createRepair = useMutation({
    mutationFn: () => api.post<Repair>("/repairs", { houseId: Number(houseId), category, priority, description: description.trim() }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.repairsRoot }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ])
      setHouseId("")
      setCategory("公共设施")
      setPriority("NORMAL")
      setDescription("")
      setValidation("")
      toast.success("报修已提交")
      onOpenChange(false)
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!houseId) return setValidation("请选择报修房屋")
    if (description.trim().length < 4) return setValidation("请至少填写 4 个字的问题描述")
    setValidation("")
    createRepair.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="repair-create-description">
        <DialogHeader>
          <DialogTitle>提交报修</DialogTitle>
          <DialogDescription id="repair-create-description">选择房屋并简要说明问题。</DialogDescription>
        </DialogHeader>
        {houses.isPending ? <LoadingRows count={2} /> : houses.isError ? <ErrorState message="房屋信息加载失败" onRetry={() => void houses.refetch()} /> : (
          <form className="dialog-form" onSubmit={submit}>
            <div className="form-scroll">
              <fieldset className="form-section"><legend>房屋</legend>
                <label className="field-label">报修房屋
                  <select className="input" value={houseId} onChange={(event) => setHouseId(event.target.value)} disabled={createRepair.isPending}>
                    <option value="">请选择</option>
                    {houses.data?.map((house) => <option value={house.id} key={house.id}>{house.building} {house.unit} {house.roomNo}</option>)}
                  </select>
                </label>
              </fieldset>
              <fieldset className="form-section"><legend>问题</legend>
                <label className="field-label">类型
                  <select className="input" value={category} onChange={(event) => setCategory(event.target.value)} disabled={createRepair.isPending}>
                    <option>公共设施</option><option>水电维修</option><option>门窗维修</option><option>其他问题</option>
                  </select>
                </label>
                <label className="field-label">优先级
                  <select className="input" value={priority} onChange={(event) => setPriority(event.target.value as "NORMAL" | "URGENT")} disabled={createRepair.isPending}>
                    <option value="NORMAL">普通</option><option value="URGENT">紧急</option>
                  </select>
                </label>
                <label className="field-label">问题描述<Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} disabled={createRepair.isPending} placeholder="例如：楼道感应灯无法点亮" /></label>
                <RepairDraftAssist description={description} disabled={createRepair.isPending} onApply={(draft) => {
                  setCategory(draft.category)
                  setPriority(draft.priority)
                  setDescription(draft.description)
                  setValidation("")
                }} />
              </fieldset>
              {validation ? <p className="form-error" role="alert">{validation}</p> : null}
              {createRepair.isError ? <p className="form-error" role="alert">{errorMessage(createRepair.error)}</p> : null}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createRepair.isPending}>取消</Button><Button type="submit" disabled={createRepair.isPending}>{createRepair.isPending ? <><LoaderCircle className="spin" aria-hidden="true" size={17} />正在提交</> : "提交报修"}</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
