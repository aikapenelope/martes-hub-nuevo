'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Eye, Monitor, Plus, Send, Smartphone, Users } from 'lucide-react'

import {
  campaignRecipientCountAction,
  createEmailCampaignAction,
  renderCampaignPreviewAction,
  sendCampaignTestAction,
} from '@/lib/email-campaign-actions'
import { Drawer } from '@/components/workspace/overlays'
import type { Segment } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

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
  const [testTo, setTestTo] = useState(testEmail ?? '')
  const [testFeedback, setTestFeedback] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // Guardar con manejo de error real: si falla, el drawer permanece abierto
  // con el borrador intacto y el error visible — nunca un falso éxito.
  const handleSave = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        setSaveError(null)
        try {
          await createEmailCampaignAction(formData)
          setOpen(false)
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : 'Error guardando la campaña')
        }
      })
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

  const refreshPreview = useCallback(() => {
    const draft = readDraft()
    if (!draft) {
      setPreviewHtml('')
      return
    }
    startTransition(async () => {
      try {
        const result = await renderCampaignPreviewAction(draft)
        setPreviewHtml(result.html)
      } catch {
        // la preview es best-effort: sin render se muestra el placeholder
      }
    })
  }, [readDraft])

  const refreshCount = useCallback(() => {
    const draft = readDraft()
    startTransition(async () => {
      try {
        setRecipientCount(await campaignRecipientCountAction(draft?.segmentId))
      } catch {
        setRecipientCount(null)
      }
    })
  }, [readDraft])

  useEffect(() => {
    if (!open) return
    refreshCount()
  }, [open, refreshCount])


  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" /> + Campaña
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Nueva Campaña de Email" size="xl">

        <div className="grid max-h-[75vh] gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
          <p className="text-[11px] text-zinc-500">
            El HTML se sanitiza en el servidor (sin scripts/iframes/handlers inline) y se envuelve
            automáticamente con la plantilla base de la marca.
          </p>
          {saveError && (
            <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
              {saveError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
            >
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-50">
              {isPending ? 'Guardando…' : 'Guardar borrador'}
            </button>
          </div>
        </form>

        {/* Panel derecho: alcance + preview + prueba */}
        <div className="flex min-w-0 flex-col gap-3 border-l border-zinc-800 pl-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              <Users size={12} /> Alcance
            </span>
            <button type="button" onClick={refreshCount} className="text-[10px] font-mono text-sky-400 hover:text-sky-300">
              Recalcular
            </button>
          </div>
          <p className="text-xs text-zinc-300 font-mono">
            {recipientCount
              ? `${recipientCount.total} destinatarios (${recipientCount.leads} leads + ${recipientCount.clients} clientes con email${recipientCount.clients > 0 ? ', sin opt-out' : ''})`
              : 'Elige un rubro y recalcula para ver el alcance real.'}
          </p>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              <Eye size={12} /> Vista previa
            </span>
            <div className="flex gap-1">
              <button type="button" onClick={() => { refreshPreview() }} className="text-[10px] font-mono text-sky-400 hover:text-sky-300">Actualizar</button>
              <button type="button" onClick={() => setDevice('desktop')} aria-label="Vista escritorio" className={`border px-1.5 py-0.5 ${device === 'desktop' ? 'border-zinc-500 text-white' : 'border-zinc-800 text-zinc-500'}`}>
                <Monitor size={11} />
              </button>
              <button type="button" onClick={() => setDevice('mobile')} aria-label="Vista móvil" className={`border px-1.5 py-0.5 ${device === 'mobile' ? 'border-zinc-500 text-white' : 'border-zinc-800 text-zinc-500'}`}>
                <Smartphone size={11} />
              </button>
            </div>
          </div>
          <div className="flex justify-center border border-zinc-800 bg-zinc-950 p-2">
            {previewHtml ? (
              <iframe
                title="Vista previa de campaña"
                srcDoc={previewHtml}
                sandbox=""
                className="h-[380px] border border-zinc-800 bg-white"
                style={{ width: device === 'mobile' ? 375 : 640, maxWidth: '100%' }}
              />
            ) : (
              <div className="flex h-[380px] w-full items-center justify-center text-[11px] font-mono text-zinc-600">
                Escribe el cuerpo (HTML) y pulsa Actualizar
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
            <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              <Send size={12} /> Envío de prueba
            </span>
            <div className="flex gap-2">
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="correo@destino.com"
                className="min-w-0 flex-1 border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
              />
              <button
                type="button"
                onClick={() => {
                  const draft = readDraft()
                  if (!draft) { setTestError('Escribe el cuerpo del correo primero'); return }
                  setTestError(null)
                  startTransition(async () => {
                    try {
                      const result = await sendCampaignTestAction({ ...draft, to: testTo })
                      setTestFeedback(`Prueba enviada a ${result.to}`)
                    } catch (err) {
                      setTestFeedback(null)
                      setTestError(err instanceof Error ? err.message : 'Error enviando la prueba')
                    }
                  })
                }}
                disabled={isPending}
                className="shrink-0 border border-sky-700 bg-sky-950/60 px-3 py-2 text-[11px] font-mono text-sky-300 transition hover:bg-sky-900/60 disabled:opacity-50"
              >
                Enviar prueba
              </button>
            </div>
            {testFeedback && <p className="text-[11px] font-mono text-emerald-400">{testFeedback}</p>}
            {testError && <p className="text-[11px] font-mono text-red-400" role="alert">{testError}</p>}
          </div>
        </div>
        </div>
      </Drawer>
    </>
  )
}
