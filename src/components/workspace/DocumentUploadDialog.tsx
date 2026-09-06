'use client'

import { useState } from 'react'
import { Plus, Upload, X } from 'lucide-react'

import { uploadDocumentAction } from '@/lib/document-actions'
import { Drawer } from '@/components/workspace/overlays'
import type { Client } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

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
      <button
        type="button"
        className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono"
        onClick={() => setOpen(true)}
      >
        <Upload className="w-4 h-4" /> + Documento
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Subir Documento" size="md">

        {clients.length === 0 ? (
          <p className="p-4 text-xs text-zinc-400">No hay clientes en este tenant todavía. Crea uno primero desde el CRM.</p>
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
                className="w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white file:mr-3 file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:text-white"
              />
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
              >
                Cancelar
              </button>
              <button type="submit" disabled={uploading} className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1.5 disabled:opacity-50">
                <Plus size={14} /> {uploading ? 'Subiendo…' : 'Subir documento'}
              </button>
            </div>
          </form>
        )}
      </Drawer>
    </>
  )
}
