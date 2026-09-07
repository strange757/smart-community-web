import { useQuery } from "@tanstack/react-query"
import { ImagePlus, ImageOff, LoaderCircle, RotateCcw, X, ZoomIn } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/lib/api"
import type { RepairImage } from "@/lib/types"
import "./repair-images.css"

export const REPAIR_IMAGE_LIMIT = 6
export const REPAIR_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"])

function useImageUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url
}

function ImageViewer({ open, onOpenChange, url, name }: { open: boolean; onOpenChange: (open: boolean) => void; url: string | null; name: string }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="repair-image-viewer" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>报修图片</DialogTitle><DialogDescription>{name}</DialogDescription></DialogHeader>
    <div className="repair-image-viewer-body">{url ? <img src={url} alt={`报修图片：${name}`}/> : <LoaderCircle className="spin" size={24} aria-label="正在加载图片"/>}</div>
  </DialogContent></Dialog>
}

function SelectedImage({ file, disabled, onRemove }: { file: File; disabled: boolean; onRemove: () => void }) {
  const url = useImageUrl(file)
  const [open, setOpen] = useState(false)
  return <div className="repair-selected-image">
    <button type="button" className="repair-image-thumb" disabled={!url || disabled} title={`预览 ${file.name}`} aria-label={`预览图片 ${file.name}`} onClick={() => setOpen(true)}>{url ? <img src={url} alt={`待上传：${file.name}`}/> : <LoaderCircle className="spin" size={18} aria-hidden="true"/>}</button>
    <button type="button" className="repair-image-remove" disabled={disabled} onClick={onRemove} title={`移除图片 ${file.name}`} aria-label={`移除图片 ${file.name}`}><X size={15} aria-hidden="true"/></button>
    <span className="repair-image-filename" title={file.name}>{file.name}</span>
    <ImageViewer open={open} onOpenChange={setOpen} url={url} name={file.name}/>
  </div>
}

export function RepairImagePicker({ files, onChange, disabled = false }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(false)

  function addFiles(incoming: File[]) {
    if (disabled) return
    const next = incoming.filter((file, index) => ![...files, ...incoming.slice(0, index)].some((other) => file.name === other.name && file.size === other.size && file.lastModified === other.lastModified))
    if (files.length + next.length > REPAIR_IMAGE_LIMIT) return setError("每个工单最多上传 6 张图片。")
    for (const file of next) {
      if (!imageTypes.has(file.type.toLowerCase()) && !(file.type === "" && /\.(jpe?g|png|webp)$/i.test(file.name))) return setError("仅支持 JPG、PNG 或 WebP 图片。")
      if (file.size > REPAIR_IMAGE_MAX_BYTES) return setError(`${file.name} 超过单张 5 MB 的限制。`)
      if (file.size === 0) return setError(`${file.name} 是空文件，请重新选择。`)
    }
    setError("")
    onChange([...files, ...next])
  }

  return <fieldset className="repair-image-picker" onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)) }} data-dragging={dragging}>
    <legend>报修图片（选填）</legend>
    <div className="repair-image-picker-heading"><span>JPG / PNG / WebP · 单张不超过 5 MB</span><span>{files.length} / {REPAIR_IMAGE_LIMIT}</span></div>
    <input ref={input} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="上传报修图片" disabled={disabled || files.length >= REPAIR_IMAGE_LIMIT} onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = "" }}/>
    <div className="repair-image-grid">{files.map((file, index) => <SelectedImage key={`${file.name}-${file.size}-${file.lastModified}`} file={file} disabled={disabled} onRemove={() => { setError(""); onChange(files.filter((_, item) => item !== index)) }}/>) }
      {files.length < REPAIR_IMAGE_LIMIT ? <button type="button" className="repair-image-add" disabled={disabled} onClick={() => input.current?.click()}><ImagePlus size={24} aria-hidden="true"/><span>添加图片</span></button> : null}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </fieldset>
}

function SavedImage({ repairId, image }: { repairId: number; image: RepairImage }) {
  const [open, setOpen] = useState(false)
  const content = useQuery({
    queryKey: ["repair-image", repairId, image.id],
    queryFn: ({ signal }) => api.blob(`/repairs/${repairId}/images/${image.id}`, signal),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  })
  const url = useImageUrl(content.data)
  return <div className="repair-saved-image">
    {content.isError ? <div className="repair-image-failed" role="status"><ImageOff size={21} aria-hidden="true"/><span>图片加载失败</span><Button variant="ghost" size="icon" title={`重新加载 ${image.fileName}`} aria-label={`重新加载图片 ${image.fileName}`} onClick={() => void content.refetch()}><RotateCcw size={15} aria-hidden="true"/></Button></div> : <button type="button" className="repair-image-thumb" disabled={!url} aria-label={`查看报修图片 ${image.fileName}`} title={`查看 ${image.fileName}`} onClick={() => setOpen(true)}>{url ? <><img src={url} alt={`报修附件：${image.fileName}`}/><ZoomIn className="repair-image-zoom" size={18} aria-hidden="true"/></> : <LoaderCircle className="spin" size={20} aria-label="正在加载图片"/>}</button>}
    <span className="repair-image-filename" title={image.fileName}>{image.fileName}</span>
    <ImageViewer open={open} onOpenChange={setOpen} url={url} name={image.fileName}/>
  </div>
}

export function RepairImageGallery({ repairId, images }: { repairId: number; images: RepairImage[] }) {
  if (!images.length) return null
  return <section className="detail-section"><h3>报修图片 <small className="repair-image-count">{images.length} 张</small></h3><div className="repair-image-grid repair-image-gallery">{images.map((image) => <SavedImage key={`${repairId}-${image.id}`} repairId={repairId} image={image}/>)}</div></section>
}
