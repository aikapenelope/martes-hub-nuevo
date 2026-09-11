'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Send, X } from 'lucide-react'

import { createSocialPostAction, publishSocialPostAction } from '@/lib/social-actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { SocialAccount } from '@/payload-types'

const inputCls =
  'w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground'
const btnCls = 'font-mono text-xs font-bold uppercase tracking-wider'

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
      <Button
        type="button"
        className={btnCls}
        onClick={() => setOpen(true)}
      >
        <Send className="size-3.5" /> Nuevo post
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
              Nueva Publicación
            </SheetTitle>
            <SheetDescription className="sr-only">Composer de publicaciones para redes sociales</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {/* Pestañas por plataforma */}
          <div className="flex gap-1 px-4 pt-1 border-b border-border">
            {(['instagram', 'tiktok'] as Platform[]).map((slug) => (
              <Button
                key={slug}
                type="button"
                variant="ghost"
                onClick={() => switchPlatform(slug)}
                className={`-mb-px rounded-none border-b-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider font-mono ${
                  platform === slug ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {slug === 'instagram' ? 'Instagram' : 'TikTok'}
              </Button>
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
            <p className="text-xs text-muted-foreground font-sans normal-case">
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
                  <div className="relative border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Vista previa" className="max-h-64 w-auto" />
                    <Button
                      type="button"
                      size="icon-xs"
                      aria-label="Quitar imagen"
                      className="absolute top-2 right-2 border-border bg-background/70 text-foreground hover:bg-background"
                      onClick={() => pickImage(null)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="border border-dashed border-border p-4 flex items-center gap-2 text-muted-foreground">
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
                  <span className={caption.length > 2200 ? 'text-red-500' : 'text-muted-foreground'}>
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

              <label htmlFor="social-post-publish-now" className="flex items-center gap-2 text-xs text-foreground font-sans normal-case">
                <Checkbox
                  id="social-post-publish-now"
                  checked={publishNow}
                  onCheckedChange={(checked) => setPublishNow(checked === true)}
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

              <div className="flex justify-end gap-2 pt-3 mt-auto border-t border-border">
                <Button type="button" variant="outline" className={btnCls} onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className={btnCls} disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-1 inline size-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1 inline size-3" />
                  )}
                  {publishNow ? 'Publicar' : 'Guardar'}
                </Button>
              </div>
            </>
          )}
        </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
