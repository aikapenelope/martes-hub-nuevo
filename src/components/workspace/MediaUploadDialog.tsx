'use client'

import { useRef, useState, useTransition, type DragEvent, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { uploadMediaAction } from '@/lib/media-actions'

export function MediaUploadDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)
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
    dialogRef.current?.showModal()
  }

  function closeDialog() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPreviewUrl(null)
    setAltText('')
    dialogRef.current?.close()
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
      <button
        type="button"
        onClick={openDialog}
        className="flex items-center gap-2 bg-sky-400 px-4 py-2 text-xs font-black uppercase text-black font-mono shadow-[0_0_16px_rgba(56,189,248,0.35)] transition hover:bg-sky-300"
      >
        <Upload className="h-4 w-4" /> Subir archivo
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(34rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-sky-400" />
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-white">
              Subir a la Biblioteca
            </span>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            className="text-zinc-500 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300 font-mono">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 animate-bounce" />
              <p className="text-sm font-bold text-white font-mono">¡Archivo guardado con éxito!</p>
              <p className="text-xs text-zinc-400">Actualizando la biblioteca...</p>
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
                    ? 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-500'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900/30'
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
                      className="max-h-36 max-w-full rounded object-contain border border-zinc-800"
                    />
                    <div className="text-center">
                      <p className="text-xs font-mono text-white truncate max-w-xs">{file?.name}</p>
                      <p className="text-[10px] font-mono text-zinc-400">
                        {(Number(file?.size || 0) / (1024 * 1024)).toFixed(2)} MB · Clic para cambiar
                      </p>
                    </div>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center gap-2">
                    <ImageIcon className="h-8 w-8 text-sky-400" />
                    <p className="text-xs font-mono text-white">{file.name}</p>
                    <p className="text-[10px] font-mono text-zinc-400">
                      {(Number(file.size) / 1024).toFixed(1)} KB · Clic para cambiar
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-zinc-500" />
                    <p className="text-xs font-mono text-zinc-300">
                      Arrastra tu imagen o archivo aquí, o <span className="text-sky-400 underline">explora</span>
                    </p>
                    <p className="text-[10px] font-mono text-zinc-500">
                      PNG, JPG, WEBP, AVIF, PDF, TXT, CSV, DOC/XLS (Guardado automático en R2/S3)
                    </p>
                  </div>
                )}
              </div>

              {/* Alt / Descripción */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Descripción / Texto Alt
                </label>
                <input
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Ej: Logo oficial, Comprobante de pago..."
                  className="w-full border border-zinc-800 bg-black px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:border-sky-400 focus:outline-none"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={isPending}
                  className="px-3.5 py-1.5 text-xs font-mono text-zinc-400 hover:text-white transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || isPending}
                  className="flex items-center gap-2 bg-sky-400 px-4 py-2 text-xs font-black uppercase text-black font-mono shadow-[0_0_12px_rgba(56,189,248,0.25)] transition hover:bg-sky-300 disabled:opacity-40 disabled:pointer-events-none"
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
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  )
}
