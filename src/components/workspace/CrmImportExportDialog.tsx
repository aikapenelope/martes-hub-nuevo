'use client'

import { useState } from 'react'
import { Download, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'

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
    <Dialog
      onOpenChange={(open) => {
        // Equivalente al `onClose` del <dialog> nativo: al cerrar se limpia el feedback.
        if (!open) {
          setResult(null)
          setError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          className="border-border bg-muted font-mono text-xs font-bold uppercase tracking-wider text-foreground hover:bg-accent"
        >
          <Upload className="size-4" /> Importar / exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[30rem]" showCloseButton={false}>
        <DialogHeader className="flex-row items-center justify-between gap-4 border-b border-border pb-3">
          <div>
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Importar / exportar {collection === 'leads' ? 'leads' : 'clientes'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Descarga el CSV del tenant activo o sube un CSV para crear contactos.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <a
            href={`/api/export-csv?collection=${collection}`}
            className="flex items-center justify-center gap-2 border border-border bg-muted px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-foreground transition hover:bg-accent"
          >
            <Download className="size-4" /> Descargar CSV del tenant activo
          </a>

          <div className="border-t border-border pt-4">
            <form
              action={(formData) => void handleImport(formData)}
              className="flex flex-col gap-2"
            >
              <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Subir CSV ({collection === 'leads' ? 'fullName' : 'name'}, email, phone{collection === 'leads' ? ', status, source' : ', stage'})
              </label>
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
              />
              <Button
                type="submit"
                disabled={importing}
                className="mt-1 font-mono text-xs font-bold uppercase tracking-wider"
              >
                {importing ? 'Importando…' : 'Importar filas'}
              </Button>
            </form>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            {result && (
              <p className="mt-2 text-xs text-foreground/80">
                {result.createdCount} de {result.totalRows} filas creadas.
                {result.issueCount > 0 && ` ${result.issueCount} con problemas (duplicados o datos faltantes).`}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
