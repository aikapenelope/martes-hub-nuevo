'use client'

/**
 * Overlays interactivos del workspace — Dialog (modal centrado) y Drawer
 * (panel lateral, usado por el panel de Hermes). Van en un archivo separado
 * de `ui.tsx` porque requieren estado de cliente (foco, teclado); las
 * primitivas puramente presentacionales de `ui.tsx` no necesitan `'use client'`.
 */

import { useEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { X } from 'lucide-react'

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

/** Atrapa el foco dentro de `containerRef` mientras `active` es true; Escape invoca `onClose`. */
function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    const [first] = getFocusable(container)
    ;(first ?? container)?.focus()

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = getFocusable(container)
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [active, containerRef, onClose])
}

/** Dialog modal centrado sobre el elemento nativo `<dialog>` (foco/Escape/backdrop gratis del navegador). */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={title}
      className="workspace-dialog m-auto w-[min(32rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
    >
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="text-zinc-400 transition hover:text-white"
        >
          <X size={16} />
        </button>
      </header>
      <div className="p-4">{children}</div>
    </dialog>
  )
}

/** Panel lateral deslizante (usado por el chat de Hermes). Foco atrapado dentro mientras está abierto. */
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, panelRef, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-zinc-400 transition hover:text-white"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex flex-1 flex-col overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  )
}
