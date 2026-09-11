'use client'

import { useState } from 'react'
import { Plus, Upload } from 'lucide-react'

import { uploadDocumentAction } from '@/lib/document-actions'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Client } from '@/payload-types'

const inputCls =
  'w-full border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground/40'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground'

/** Reemplaza el link a `/admin/collections/documents/create` (que ni siquiera existía en el workspace). */
export function DocumentUploadDialog({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(formData: FormData) {
    setUploading(true)
    setError(null)
    try {
      await uploadDocumentAction(formData)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir el documento')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-sky-400 px-4 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] transition hover:bg-sky-300"
      >
        <Upload className="h-4 w-4" /> + Documento
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
      >
        <SheetContent side="right" className="gap-0 data-[side=right]:sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="truncate text-sm font-bold uppercase tracking-wider text-foreground">
              Subir Documento
            </SheetTitle>
            <SheetDescription className="sr-only">
              Adjunta un PDF y vincúlalo a un cliente del tenant.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            {clients.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No hay clientes en este tenant todavía. Crea uno primero desde el CRM.</p>
            ) : (
              <form action={(formData) => void handleUpload(formData)} className="flex flex-col gap-3">
                <label className={labelCls}>
                  Cliente
                  <select name="client" required defaultValue="" className={inputCls}>
                    <option value="" disabled>Selecciona un cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Título (opcional, usa el nombre del archivo si se omite)
                  <input name="title" maxLength={160} className={inputCls} />
                </label>
                <label className={labelCls}>
                  Tipo
                  <select name="documentType" defaultValue="contrato" className={inputCls}>
                    <option value="contrato">Contrato</option>
                    <option value="factura">Factura</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
                <label className={labelCls}>
                  Archivo PDF
                  <input
                    type="file"
                    name="file"
                    accept="application/pdf"
                    required
                    className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
                  />
                </label>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    className="px-4 font-mono text-xs font-bold uppercase tracking-wider"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={uploading}
                    className="bg-primary px-4 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Plus size={14} /> {uploading ? 'Subiendo…' : 'Subir documento'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
