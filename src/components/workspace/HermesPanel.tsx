'use client'

/**
 * HermesLauncher — botón flotante + panel de chat de Hermes. Se monta una
 * vez en `src/app/(workspace)/layout.tsx` y queda disponible en todas las
 * páginas de `/workspace`. Conecta con `/api/ai/chat` (solo lectura,
 * tenant-scoped y autenticado en el servidor — ver
 * `src/app/(payload)/api/ai/chat/route.ts`). Atajo de teclado: Cmd/Ctrl+J.
 *
 * Antes de esta pieza, `/api/ai/chat` existía pero no tenía ninguna
 * superficie en el workspace: este componente es esa superficie, en su
 * primera versión (sin persistencia de historial entre aperturas).
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isTextUIPart, isToolUIPart } from 'ai'
import { LoaderCircle, Send, Sparkles } from 'lucide-react'

import { Drawer } from './overlays'

const TOOL_LABELS: Record<string, string> = {
  buscarClientes: 'Buscando clientes…',
  buscarLeads: 'Buscando leads…',
  buscarTareas: 'Buscando tareas…',
  resumenCobros: 'Consultando cobros…',
  resumenPipeline: 'Consultando pipeline…',
}

export function HermesLauncher() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir Hermes (Cmd+J)"
        title="Hermes (Cmd/Ctrl+J)"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 border border-zinc-700 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-black shadow-2xl transition hover:bg-zinc-200"
      >
        <Sparkles size={16} />
        Hermes
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Hermes — asistente de solo lectura">
        <HermesChat />
      </Drawer>
    </>
  )
}

function HermesChat() {
  const [transport] = useState(() => new DefaultChatTransport({ api: '/api/ai/chat' }))
  const { messages, sendMessage, status, error } = useChat({ transport })
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const isBusy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  function onSubmit(event: FormEvent): void {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isBusy) return
    setDraft('')
    void sendMessage({ text })
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs text-zinc-400">
        Acceso de solo lectura al CRM de tu tenant: clientes, leads, tareas, cobros y pipeline.
        No crea ni modifica nada.
      </p>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-zinc-500 font-mono">
            Pregúntale algo como &quot;¿cuántos leads nuevos hay esta semana?&quot;
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'ml-auto max-w-[85%] bg-white px-3 py-2 text-sm text-black'
                : 'mr-auto max-w-[85%] border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100'
            }
          >
            {message.parts.map((part, index) => {
              if (isTextUIPart(part)) {
                return (
                  <span key={index} className="whitespace-pre-wrap">
                    {part.text}
                  </span>
                )
              }
              if (isToolUIPart(part)) {
                const toolName = 'toolName' in part ? part.toolName : part.type.replace('tool-', '')
                return (
                  <span
                    key={index}
                    className="mt-1 block text-[10px] font-mono uppercase tracking-wider text-zinc-500"
                  >
                    {TOOL_LABELS[toolName] ?? `Consultando ${toolName}…`}
                  </span>
                )
              }
              return null
            })}
          </div>
        ))}
        {isBusy && (
          <div className="mr-auto flex items-center gap-2 text-xs text-zinc-500">
            <LoaderCircle size={14} className="animate-spin" /> Hermes está pensando…
          </div>
        )}
      </div>

      {error && (
        <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300">
          {error.message || 'Hermes no está disponible ahora. Verifica la configuración de IA.'}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-zinc-800 pt-3">
        <label className="sr-only" htmlFor="hermes-input">
          Mensaje para Hermes
        </label>
        <input
          id="hermes-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Pregúntale a Hermes…"
          disabled={isBusy}
          className="flex-1 border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isBusy || !draft.trim()}
          aria-label="Enviar"
          className="flex items-center justify-center border border-zinc-700 bg-white px-3 text-black disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
