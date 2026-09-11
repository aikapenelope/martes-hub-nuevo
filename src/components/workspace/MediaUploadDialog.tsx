'use client'

import { useRef, useState, useTransition, type DragEvent, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { uploadMediaAction } from '@/lib/media-actions'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const inputCls =
  'w-full border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-sky-400 focus:outline-none'

export function MediaUploadDialog() {
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [altText, setAltText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function openDialog() {
    setError(null)
    setSuccess(false)
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPreviewUrl(null)
    setAltText('')
    setOpen(true)
  }

  function closeDialog() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPreviewUrl(null)
    setAltText('')
    setOpen(false)
  }

  function handleFileSelection(selectedFile: File) {
    setError(null)
    setFile(selectedFile)
    if (!altText) {
      setAltText(selectedFile.name.replace(/\.[^/.]+$/, ''))
    }
    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files[0]) {
      handleFileSelection(files[0])
    }
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFileSelection(files[0])
    }
  }

  async function handleUpload() {
    if (!file) return
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('alt', altText)

    startTransition(async () => {
      const res = await uploadMediaAction(formData)
      if (!res.ok) {
        setError(res.error ?? 'Error al subir el archivo')
        return
      }
      setSuccess(true)
      setTimeout(() => {
        closeDialog()
        router.refresh()
      }, 700)
    })
  }

  return (
    <>
      <Button
        type="button"
        onClick={openDialog}
        className="bg-sky-400 px-4 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] transition hover:bg-sky-300"
      >
        <Upload className="h-4 w-4" /> Subir archivo
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) closeDialog()
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="truncate text-sm font-bold uppercase tracking-wider text-foreground">
              Subir a la Biblioteca de Media
            </SheetTitle>
            <SheetDescription className="sr-only">
              Selecciona un archivo de tu equipo y guarda una copia en la biblioteca de media del tenant.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <div className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300 font-mono">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {success ? (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400 transition-transform duration-200 animate-in zoom-in-75" />
                  <p className="text-sm font-bold text-foreground font-mono">¡Archivo guardado con éxito!</p>
                  <p className="text-xs text-muted-foreground">Actualizando la biblioteca...</p>
                </div>
              ) : (
                <>
                  {/* Dropzone */}
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center border-2 border-dashed p-6 text-center cursor-pointer transition ${
                      isDragging
                        ? 'border-sky-400 bg-sky-950/20'
                        : file
                        ? 'border-border bg-muted/40 hover:border-muted-foreground/40'
                        : 'border-border bg-background hover:border-muted-foreground/40 hover:bg-muted/30'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
                      onChange={onFileInputChange}
                      className="hidden"
                    />

                    {previewUrl ? (
                      <div className="flex flex-col items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Preview local de blob URL antes de subir */}
                        <img
                          src={previewUrl}
                          alt="Vista previa"
                          className="max-h-36 max-w-full rounded object-contain border border-border"
                        />
                        <div className="text-center">
                          <p className="text-xs font-mono text-foreground truncate max-w-xs">{file?.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {(Number(file?.size || 0) / (1024 * 1024)).toFixed(2)} MB · Clic para cambiar
                          </p>
                        </div>
                      </div>
                    ) : file ? (
                      <div className="flex flex-col items-center gap-2">
                        <ImageIcon className="h-8 w-8 text-sky-400" />
                        <p className="text-xs font-mono text-foreground">{file.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {(Number(file.size) / 1024).toFixed(1)} KB · Clic para cambiar
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <p className="text-xs font-mono text-foreground/80">
                          Arrastra tu imagen o archivo aquí, o <span className="text-sky-400 underline">explora</span>
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          PNG, JPG, WEBP, AVIF, PDF, TXT, CSV, DOC/XLS (Guardado automático en R2/S3)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Alt / Descripción */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Descripción / Texto Alt
                    </label>
                    <input
                      type="text"
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                      placeholder="Ej: Logo oficial, Comprobante de pago..."
                      className={inputCls}
                    />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={closeDialog}
                      disabled={isPending}
                      className="px-3.5 font-mono text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={handleUpload}
                      disabled={!file || isPending}
                      className="bg-sky-400 px-4 font-mono text-xs font-black uppercase text-black shadow-[0_0_12px_rgba(56,189,248,0.25)] transition hover:bg-sky-300 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo...
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5" /> Guardar en biblioteca
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
