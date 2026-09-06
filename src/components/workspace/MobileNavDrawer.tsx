'use client'

import { useState, useEffect } from 'react'
import { WorkspaceSidebar } from './WorkspaceSidebar'

export function MobileNavDrawer({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onToggle() { setOpen(v => !v) }
    window.addEventListener('workspace:toggle-mobile-nav', onToggle)
    return () => window.removeEventListener('workspace:toggle-mobile-nav', onToggle)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Cerrar menú"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="absolute left-0 top-0 h-full">
        <WorkspaceSidebar isAdmin={isAdmin} />
      </div>
    </div>
  )
}
