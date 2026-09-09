'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Send, X } from 'lucide-react'

import { Drawer } from '@/components/workspace/overlays'
import { createSocialPostAction, publishSocialPostAction } from '@/lib/social-actions'
import type { SocialAccount } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'
const btnPrimary =
  'px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-40'
const btnGhost =
  'px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono'

type Platform = 'instagram' | 'tiktok'

/**
 * Composer de publicaciones tipo Metricool: imagen + caption → Publicar ya
 * (vía Composio: contenedor → publish) o Programar. Pestaña por plataforma —
 * Instagram activo; TikTok aparece pero requiere registrar la app propia
 * (sin managed auth) antes de poder conectar.
 */
export function SocialPostCreateDialog({ accounts }: { accounts: SocialAccount[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [accountId, setAccountId] = useState('')
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [publishNow, setPublishNow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const connectedAccounts = accounts.filter(
    (account) => account.platform === platform && account.status === 'conectada',
  )

  function reset() {
    setCaption('')
    setImage(null)
    setImagePreview(null)
    setPublishNow(false)
    setBusy(false)
    setFeedback(null)
  }

  function pickImage(file: File | null) {
    setImage(file)
    setImagePreview(file ? URL.createObjectURL(file) : null)
  }

  async function handleSubmit() {
    setBusy(true)
    setFeedback(null)
    try {
      const formData = new FormData()
      formData.set('account', accountId)
      formData.set('caption', caption)
      const scheduledAt = formRef.current?.querySelector<HTMLInputElement>('input[name="scheduledAt"]')?.value
      if (scheduledAt) formData.set('scheduledAt', scheduledAt)
      if (image) formData.set('image', image)

      const created = await createSocialPostAction(formData)
      if (!created.ok) {
        setFeedback({ kind: 'error', text: created.error })
        return
      }

      if (publishNow) {
        setFeedback({ kind: 'ok', text: 'Publicando en Instagram…' })
        const published = await publishSocialPostAction(created.postId)
        if (!published.ok) {
          setFeedback({
            kind: 'error',
            text: `El post quedó en 'fallido' — error de Composio: ${published.error}`,
          })
          router.refresh()
          return
        }
        setFeedback({ kind: 'ok', text: '¡Publicado en Instagram!' })
        router.refresh()
        setTimeout(() => setOpen(false), 1200)
        return
      }

      setFeedback({ kind: 'ok', text: created.status === 'programado' ? 'Programado' : 'Borrador guardado' })
      router.refresh()
      setOpen(false)
      reset()
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Error inesperado' })
    } finally {
      setBusy(false)
    }
  }

  function switchPlatform(next: Platform) {
    setPlatform(next)
    setAccountId('')
    setFeedback(null)
  }

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
        onClick={() => setOpen(true)}
      >
        <Send size={14} /> Nuevo post
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Nueva Publicación" size="xl">
        {/* Pestañas por plataforma */}
        <div className="flex gap-1 px-4 pt-1 border-b border-zinc-800">
          {(['instagram', 'tiktok'] as Platform[]).map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => switchPlatform(slug)}
              className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider font-mono border-b-2 -mb-px transition ${
                platform === slug ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {slug === 'instagram' ? 'Instagram' : 'TikTok'}
            </button>
          ))}
        </div>

        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4 p-4 flex-1"
        >
          {platform === 'tiktok' && (
            <p className="border border-amber-500/30 bg-amber-500/10 text-amber-300 px-3 py-2 text-[11px] font-sans normal-case">
              TikTok requiere registrar una app propia de TikTok (sin OAuth gestionado por Composio).
              Fase 4 del plan — por ahora conecta y publica por Instagram.
            </p>
          )}

          {connectedAccounts.length === 0 ? (
            <p className="text-xs text-zinc-400 font-sans normal-case">
              {platform === 'instagram'
                ? 'No hay cuentas Instagram conectadas todavía — conéctala en Ajustes → Conexiones.'
                : 'Conecta una cuenta TikTok para publicar.'}
            </p>
          ) : (
            <>
              <label className={labelCls}>
                Cuenta de destino
                <select
                  name="account"
                  required
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className={inputCls}
                >
                  <option value="" disabled>
                    Selecciona una cuenta
                  </option>
                  {connectedAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelCls}>
                Imagen (JPG/PNG/WebP — temporal: se borra a las 48h)
                {imagePreview ? (
                  <div className="relative border border-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Vista previa" className="max-h-64 w-auto" />
                    <button
                      type="button"
                      aria-label="Quitar imagen"
                      className="absolute top-2 right-2 p-1 bg-black/70 border border-zinc-700 text-white"
                      onClick={() => pickImage(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="border border-dashed border-zinc-700 p-4 flex items-center gap-2 text-zinc-500">
                    <ImagePlus size={16} />
                    <input
                      type="file"
                      name="image"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => pickImage(event.target.files?.[0] ?? null)}
                      className="text-xs font-sans normal-case"
                    />
                  </div>
                )}
              </label>

              <label className={labelCls}>
                <div className="flex justify-between items-center w-full">
                  <span>Caption</span>
                  <span className={caption.length > 2200 ? 'text-red-500' : 'text-zinc-500'}>
                    {caption.length}/2200
                  </span>
                </div>
                <textarea
                  name="caption"
                  rows={5}
                  required
                  maxLength={2200}
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  className={inputCls}
                  placeholder="Escribe el contenido de tu publicación..."
                />
              </label>

              <label className={labelCls}>
                Programar para (opcional — vacío = borrador)
                <input name="scheduledAt" type="datetime-local" className={inputCls} />
              </label>

              <label className="flex items-center gap-2 text-xs text-white font-sans normal-case">
                <input
                  type="checkbox"
                  checked={publishNow}
                  onChange={(event) => setPublishNow(event.target.checked)}
                  className="accent-white"
                />
                Publicar ya en {platform === 'instagram' ? 'Instagram' : 'TikTok'}
              </label>

              {feedback && (
                <div
                  className={`border px-3 py-2 text-[11px] font-sans normal-case ${
                    feedback.kind === 'ok'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/30 bg-red-500/10 text-red-300'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 mt-auto border-t border-zinc-800">
                <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className={btnPrimary} disabled={busy}>
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
                  ) : (
                    <Send size={12} className="inline mr-1" />
                  )}
                  {publishNow ? 'Publicar' : 'Guardar'}
                </button>
              </div>
            </>
          )}
        </form>
      </Drawer>
    </>
  )
}
