import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sessionKey } from "@/lib/api"
import { renderWithClient } from "@/test/render"
import { RepairCreateDialog } from "./repair-create-dialog"
import { RepairImageGallery } from "./repair-images"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { data, requestId: "repair-image-test" } : data), { status, headers: { "Content-Type": "application/json" } })
}

function requestMock(post: (input: string, init: RequestInit) => Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/me/houses")) return Promise.resolve(json([{ id: 1, building: "1号楼", unit: "1单元", roomNo: "101" }]))
    if (init?.method === "POST") return Promise.resolve(post(String(input), init))
    throw new Error(`Unexpected request: ${String(input)}`)
  })
}

async function fillRepair() {
  fireEvent.change(await screen.findByLabelText("报修房屋"), { target: { value: "1" } })
  fireEvent.change(screen.getByLabelText("问题描述"), { target: { value: "厨房水管接头持续漏水" } })
}

describe("optional repair pictures", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:repair-preview") })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
    sessionStorage.setItem(sessionKey, JSON.stringify({ token: "owner-image-token" }))
  })
  afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear() })

  it("keeps image-free repairs on the existing JSON endpoint", async () => {
    const requests: { path: string; body: unknown }[] = []
    vi.stubGlobal("fetch", requestMock((path, init) => { requests.push({ path, body: init.body }); return json({ id: 10, images: [] }, 201) }))
    renderWithClient(<RepairCreateDialog open onOpenChange={() => {}}/>)
    await fillRepair()
    fireEvent.click(screen.getByRole("button", { name: "提交报修" }))
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].path).toBe("/api/v1/repairs")
    expect(JSON.parse(String(requests[0].body))).toMatchObject({ houseId: 1, description: "厨房水管接头持续漏水" })
  })

  it("previews a selected image and sends multipart data without a JSON content type", async () => {
    let uploaded: RequestInit | undefined
    vi.stubGlobal("fetch", requestMock((path, init) => { expect(path).toBe("/api/v1/repairs/with-images"); uploaded = init; return json({ id: 11, images: [] }, 201) }))
    renderWithClient(<RepairCreateDialog open onOpenChange={() => {}}/>)
    await fillRepair()
    const image = new File(["image-bytes"], "leak.jpg", { type: "image/jpeg" })
    fireEvent.change(screen.getByLabelText("上传报修图片"), { target: { files: [image] } })
    expect(await screen.findByRole("img", { name: "待上传：leak.jpg" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "提交报修" }))
    await waitFor(() => expect(uploaded).toBeDefined())
    expect(uploaded?.body).toBeInstanceOf(FormData)
    const body = uploaded!.body as FormData
    expect((body.getAll("images")[0] as File).name).toBe("leak.jpg")
    expect(JSON.parse(String(body.get("data")))).toMatchObject({ houseId: 1 })
    expect(new Headers(uploaded!.headers).has("Content-Type")).toBe(false)
    expect(new Headers(uploaded!.headers).get("Authorization")).toBe("Bearer owner-image-token")
  })

  it("removes a chosen file and rejects oversized or unsupported files", async () => {
    vi.stubGlobal("fetch", requestMock(() => json({ id: 1 })))
    renderWithClient(<RepairCreateDialog open onOpenChange={() => {}}/>)
    await fillRepair()
    const input = screen.getByLabelText("上传报修图片")
    fireEvent.change(input, { target: { files: [new File(["small"], "pipe.png", { type: "image/png" })] } })
    fireEvent.click(await screen.findByRole("button", { name: "移除图片 pipe.png" }))
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    fireEvent.change(input, { target: { files: [new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })] } })
    expect(screen.getByRole("alert")).toHaveTextContent("JPG")
    const large = new File(["bytes"], "large.jpg", { type: "image/jpeg" })
    Object.defineProperty(large, "size", { value: 5 * 1024 * 1024 + 1 })
    fireEvent.change(input, { target: { files: [large] } })
    expect(screen.getByRole("alert")).toHaveTextContent("5 MB")
  })

  it("keeps text and previews after upload failure and clears previews when closing", async () => {
    vi.stubGlobal("fetch", requestMock(() => json({ code: "IMAGE_INVALID", message: "图片无法读取" }, 422)))
    const view = renderWithClient(<RepairCreateDialog open onOpenChange={() => {}}/>)
    await fillRepair()
    fireEvent.change(screen.getByLabelText("上传报修图片"), { target: { files: [new File(["bytes"], "pipe.jpg", { type: "image/jpeg" })] } })
    fireEvent.click(screen.getByRole("button", { name: "提交报修" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("图片无法读取")
    expect(screen.getByLabelText("问题描述")).toHaveValue("厨房水管接头持续漏水")
    expect(screen.getByRole("img", { name: "待上传：pipe.jpg" })).toBeInTheDocument()
    view.rerender(<RepairCreateDialog open={false} onOpenChange={() => {}}/>)
    view.rerender(<RepairCreateDialog open onOpenChange={() => {}}/>)
    await screen.findByLabelText("问题描述")
    expect(screen.queryByRole("img", { name: "待上传：pipe.jpg" })).not.toBeInTheDocument()
  })

  it("rejects batches larger than six pictures without dropping the existing selection", async () => {
    vi.stubGlobal("fetch", requestMock(() => json({ id: 1 })))
    renderWithClient(<RepairCreateDialog open onOpenChange={() => {}}/>)
    await fillRepair()
    const input = screen.getByLabelText("上传报修图片")
    fireEvent.change(input, { target: { files: [new File(["small"], "first.jpg", { type: "image/jpeg" })] } })
    fireEvent.change(input, { target: { files: Array.from({ length: 6 }, (_, index) => new File(["small"], `extra-${index}.jpg`, { type: "image/jpeg" })) } })
    expect(screen.getByRole("alert")).toHaveTextContent("最多上传 6 张")
    expect(screen.getAllByRole("img")).toHaveLength(1)
    expect(screen.getByRole("img", { name: "待上传：first.jpg" })).toBeInTheDocument()
  })

  it("reads protected pictures with the current token and revokes the preview on unmount", async () => {
    const requests: string[] = []
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(input))
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer owner-image-token")
      expect(new Headers(init?.headers).get("Accept")).toContain("image/jpeg")
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } }))
    }))
    const view = renderWithClient(<RepairImageGallery repairId={17} images={[{ id: 3, fileName: "pipe.jpg", contentType: "image/jpeg", size: 3, width: 20, height: 20, url: "/api/v1/repairs/17/images/3", createdAt: "2026-09-07T00:00:00Z" }]}/>)
    expect(await screen.findByRole("img", { name: "报修附件：pipe.jpg" })).toHaveAttribute("src", "blob:repair-preview")
    expect(requests).toEqual(["/api/v1/repairs/17/images/3"])
    fireEvent.click(screen.getByRole("button", { name: "查看报修图片 pipe.jpg" }))
    expect(screen.getByRole("dialog", { name: "报修图片" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "报修图片：pipe.jpg" })).toBeInTheDocument()
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:repair-preview")
  })
})
