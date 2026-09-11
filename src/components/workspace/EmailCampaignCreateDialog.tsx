'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Eye, Monitor, Plus, Send, Smartphone, Users } from 'lucide-react'

import {
  campaignRecipientCountAction,
  createEmailCampaignAction,
  renderCampaignPreviewAction,
  sendCampaignTestAction,
} from '@/lib/email-campaign-actions'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Segment } from '@/payload-types'

const inputCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground'

export function EmailCampaignCreateDialog({
  segments,
  testEmail,
}: {
  segments: Segment[]
  testEmail?: string
}) {
  const [open, setOpen] = useState(false)
  // Vista previa en vivo + alcance real del segmento + envío de prueba
  const [previewHtml, setPreviewHtml] = useState('')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [recipientCount, setRecipientCount] = useState<{ total: number; leads: number; clients: number } | null>(null)
  const [testTo, _setTestTo] = useState(testEmail ?? '')
  const [testFeedback, setTestFeedback] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // Guardar con manejo de error real: la acción DEVEULVE la promesa — React
  // no resetea el formulario hasta que settle, así que un fallo conserva el
  // borrador completo con el drawer abierto y el error visible.
  const [saving, setSaving] = useState(false)
  const handleSave = useCallback(
    async (formData: FormData) => {
      setSaving(true)
      setSaveError(null)
      try {
        await createEmailCampaignAction(formData)
        setOpen(false)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Error guardando la campaña')
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const readDraft = useCallback(() => {
    const form = formRef.current
    if (!form) return null
    const data = new FormData(form)
    const bodyHtml = String(data.get('bodyHtml') ?? '').trim()
    if (!bodyHtml) return null
    return {
      subject: String(data.get('subject') ?? ''),
      preheader: String(data.get('preheader') ?? ''),
      bodyHtml,
      segmentId: data.get('segment') ? Number(data.get('segment')) : undefined,
    }
  }, [])

  // IDs monotónicos: una respuesta vieja (draft anterior) nunca pisa el
  // preview/conteo del estado más reciente del formulario.
  const previewSeqRef = useRef(0)
  const countSeqRef = useRef(0)

  const refreshPreview = useCallback(() => {
    const draft = readDraft()
    if (!draft) {
      previewSeqRef.current += 1
      setPreviewHtml('')
      return
    }
    const seq = ++previewSeqRef.current
    startTransition(async () => {
      try {
        const result = await renderCampaignPreviewAction(draft)
        if (seq === previewSeqRef.current) setPreviewHtml(result.html)
      } catch {
        // la preview es best-effort: sin render se muestra el placeholder
      }
    })
  }, [readDraft])

  const refreshCount = useCallback(() => {
    const seq = ++countSeqRef.current
    const draft = readDraft()
    startTransition(async () => {
      try {
        const result = await campaignRecipientCountAction(draft?.segmentId)
        if (seq === countSeqRef.current) setRecipientCount(result)
      } catch {
        if (seq === countSeqRef.current) setRecipientCount(null)
      }
    })
  }, [readDraft])

  useEffect(() => {
    if (!open) return
    refreshCount()
  }, [open, refreshCount])


  return (
    <>
      <Button
        type="button"
        className="bg-sky-400 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:bg-sky-300"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" /> + Campaña
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
      >
        <SheetContent side="right" className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Nueva Campaña de Email
            </SheetTitle>
            <SheetDescription className="sr-only">
              Crea la campaña, revisa alcance y vista previa, y envía una prueba antes de guardar.
            </SheetDescription>
          </SheetHeader>

        <div className="grid max-h-[75vh] flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form ref={formRef} action={handleSave} onChange={refreshPreview} className="flex min-w-0 flex-col gap-3">
          <label className={labelCls}>
            Nombre interno
            <input name="name" required maxLength={160} placeholder="Ej: Promo julio 2026" className={inputCls} />
          </label>
          <label className={labelCls}>
            Asunto
            <input name="subject" required maxLength={200} className={inputCls} />
          </label>
          <label className={labelCls}>
            Preheader (opcional)
            <input name="preheader" maxLength={200} className={inputCls} />
          </label>
          <label className={labelCls}>
            Audiencia (rubro, opcional)
            <select name="segment" defaultValue="" className={inputCls}>
              <option value="">Todos los leads/clientes con email</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Cuerpo (HTML)
            <textarea name="bodyHtml" rows={8} required maxLength={20000} placeholder="<p>Hola {{nombre}}...</p>" className={`${inputCls} font-mono text-xs`} />
          </label>
          <p className="text-[11px] text-muted-foreground">
            El HTML se sanitiza en el servidor (sin scripts/iframes/handlers inline) y se envuelve
            automáticamente con la plantilla base de la marca.
          </p>
          {saveError && (
            <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
              {saveError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            {/* type="button": sin él, Cancelar haría submit del form (review Devin). */}
            <Button type="button" variant="outline" className="bg-muted font-mono text-xs font-bold uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-foreground">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="font-mono text-xs font-bold uppercase tracking-wider">
              {saving ? 'Guardando…' : 'Guardar borrador'}
            </Button>
          </div>
        </form>

        {/* Panel derecho: alcance + preview + prueba */}
        <div className="flex min-w-0 flex-col gap-3 border-l border-border pl-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Users size={12} /> Alcance
            </span>
            <Button type="button" variant="link" onClick={refreshCount} className="h-auto p-0 text-[10px] font-mono text-sky-400 hover:text-sky-300">
              Recalcular
            </Button>
          </div>
          <p className="text-xs text-foreground/80 font-mono">
            {recipientCount
              ? `${recipientCount.total} destinatarios (${recipientCount.leads} leads + ${recipientCount.clients} clientes con email${recipientCount.clients > 0 ? ', sin opt-out' : ''})`
              : 'Elige un rubro y recalcula para ver el alcance real.'}
          </p>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Eye size={12} /> Vista previa
            </span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="link" onClick={() => { refreshPreview() }} className="h-auto p-0 text-[10px] font-mono text-sky-400 hover:text-sky-300">Actualizar</Button>
              <Button type="button" variant="outline" size="icon-xs" onClick={() => setDevice('desktop')} aria-label="Vista escritorio" className={device === 'desktop' ? 'border-foreground/50 text-foreground' : 'border-border text-muted-foreground'}>
                <Monitor className="size-3" />
              </Button>
              <Button type="button" variant="outline" size="icon-xs" onClick={() => setDevice('mobile')} aria-label="Vista móvil" className={device === 'mobile' ? 'border-foreground/50 text-foreground' : 'border-border text-muted-foreground'}>
                <Smartphone className="size-3" />
              </Button>
            </div>
          </div>
          <div className="flex justify-center border border-border bg-background p-2">
            {previewHtml ? (
              <iframe
                title="Vista previa de campaña"
                srcDoc={previewHtml}
                sandbox=""
                className="h-[380px] border border-border bg-white"
                style={{ width: device === 'mobile' ? 375 : 640, maxWidth: '100%' }}
              />
            ) : (
              <div className="flex h-[380px] w-full items-center justify-center text-[11px] font-mono text-muted-foreground">
                Escribe el cuerpo (HTML) y pulsa Actualizar
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Send size={12} /> Envío de prueba
            </span>
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-[11px] font-mono text-muted-foreground">
                Destino: {testTo || 'tu correo de usuario'}
              </p>
              <Button
                type="button"
                onClick={() => {
                  const draft = readDraft()
                  if (!draft) { setTestError('Escribe el cuerpo del correo primero'); return }
                  setTestError(null)
                  startTransition(async () => {
                    try {
                      const result = await sendCampaignTestAction(draft)
                      setTestFeedback(`Prueba enviada a ${result.to}`)
                    } catch (err) {
                      setTestFeedback(null)
                      setTestError(err instanceof Error ? err.message : 'Error enviando la prueba')
                    }
                  })
                }}
                disabled={isPending}
                className="shrink-0 border border-sky-700 bg-sky-950/60 px-3 py-2 text-[11px] font-mono text-sky-300 hover:bg-sky-900/60"
              >
                Enviar prueba
              </Button>
            </div>
            {testFeedback && <p className="text-[11px] font-mono text-emerald-400">{testFeedback}</p>}
            {testError && <p className="text-[11px] font-mono text-red-400" role="alert">{testError}</p>}
          </div>
        </div>
        </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
