'use client'

import { useRef, useState } from 'react'
import { Download, Upload, X } from 'lucide-react'

interface ImportResult {
  totalRows: number
  createdCount: number
  issueCount: number
  issues: Array<{ row: number; message: string }>
}

/**
 * Reemplaza el link a `/admin/collections/{leads|clients}` (UI del plugin
 * de import/export, que vive en el admin de Payload). Usa los endpoints
 * nativos del workspace (`/api/import-csv`, `/api/export-csv`) para que
 * cargar/descargar contactos no saque al usuario del producto.
 */
export function CrmImportExportDialog({ collection }: { collection: 'leads' | 'clients' }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleImport(formData: FormData) {
    setImporting(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/import-csv?collection=${collection}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Error al importar')
        return
      }
      setResult(data)
    } catch {
      setError('Error de red al importar el archivo')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Upload className="w-4 h-4" /> Importar / exportar
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(30rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onClose={() => {
          setResult(null)
          setError(null)
        }}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Importar / exportar {collection === 'leads' ? 'leads' : 'clientes'}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => dialogRef.current?.close()}
            className="text-zinc-400 transition hover:text-white"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-col gap-4 p-4">
          <a
            href={`/api/export-csv?collection=${collection}`}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
          >
            <Download className="w-4 h-4" /> Descargar CSV del tenant activo
          </a>

          <div className="border-t border-zinc-800 pt-4">
            <form
              action={(formData) => void handleImport(formData)}
              className="flex flex-col gap-2"
            >
              <label className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Subir CSV ({collection === 'leads' ? 'fullName' : 'name'}, email, phone{collection === 'leads' ? ', status, source' : ', stage'})
              </label>
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                className="w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white file:mr-3 file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:text-white"
              />
              <button
                type="submit"
                disabled={importing}
                className="mt-1 px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-50"
              >
                {importing ? 'Importando…' : 'Importar filas'}
              </button>
            </form>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            {result && (
              <p className="mt-2 text-xs text-zinc-300">
                {result.createdCount} de {result.totalRows} filas creadas.
                {result.issueCount > 0 && ` ${result.issueCount} con problemas (duplicados o datos faltantes).`}
              </p>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}
