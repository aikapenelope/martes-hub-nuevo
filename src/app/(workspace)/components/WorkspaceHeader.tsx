'use client'

import Link from 'next/link'
import { Bell, Bot, Menu, Search, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import type { Notification } from '@/payload-types'
import { markAllReadAction } from '../notifications/actions'

interface WorkspaceHeaderProps {
  userEmail?: string
  userName?: string
  tenantName: string
  onToggleSidebar: () => void
  onToggleAiDrawer: () => void
  isAiDrawerOpen: boolean
  notifications: Pick<Notification, 'id' | 'title' | 'severity' | 'createdAt'>[]
  unreadCount: number
}

/** Color del punto indicador según la severidad de la notificación. */
function severityColor(severity: Notification['severity'] | null | undefined): string {
  if (severity === 'error') return 'var(--workspace-danger)'
  if (severity === 'warning') return '#f59e0b'
  return 'var(--workspace-accent)'
}

export function WorkspaceHeader({
  userEmail,
  userName,
  tenantName,
  onToggleSidebar,
  onToggleAiDrawer,
  isAiDrawerOpen,
  notifications,
  unreadCount,
}: WorkspaceHeaderProps) {
  const displayName = userName || userEmail?.split('@')[0] || 'Agente'
  const [bellOpen, setBellOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleMarkRead() {
    startTransition(async () => {
      await markAllReadAction()
      setBellOpen(false)
    })
  }

  return (
    <header className="workspace-header">
      <div className="workspace-header-left">
        <button className="workspace-icon-button workspace-mobile-trigger" type="button" onClick={onToggleSidebar} aria-label="Abrir navegación">
          <Menu size={18} />
        </button>
        <button className="workspace-search" type="button" aria-label="Buscar en Martes Hub">
          <Search size={16} aria-hidden="true" />
          <span>Buscar clientes, leads y tareas</span>
          <kbd>⌘ K</kbd>
        </button>
      </div>

      <div className="workspace-header-right">
        <div className="workspace-user">
          <span className="workspace-user-copy">
            <strong>{displayName}</strong>
            <span>{tenantName}</span>
          </span>
          <span className="workspace-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</span>
        </div>

        {/* Notification bell */}
        <div style={{ position: 'relative' }}>
          <button
            className="workspace-icon-button"
            type="button"
            onClick={() => setBellOpen((open) => !open)}
            aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
            aria-pressed={bellOpen}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="workspace-notif-badge" aria-hidden="true">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="workspace-notif-panel" role="dialog" aria-label="Notificaciones recientes">
              <div className="workspace-notif-head">
                <strong>Notificaciones</strong>
                <button
                  className="workspace-icon-button"
                  type="button"
                  onClick={() => setBellOpen(false)}
                  aria-label="Cerrar notificaciones"
                >
                  <X size={16} />
                </button>
              </div>

              {notifications.length === 0 ? (
                <div className="workspace-notif-empty">Sin notificaciones pendientes</div>
              ) : (
                <ul className="workspace-notif-list" role="list">
                  {notifications.map((n) => (
                    <li key={n.id} className="workspace-notif-item">
                      <span
                        className="workspace-notif-dot"
                        style={{ background: severityColor(n.severity) }}
                        aria-hidden="true"
                      />
                      <span>{n.title}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="workspace-notif-footer">
                <button
                  className="workspace-button"
                  type="button"
                  onClick={handleMarkRead}
                  disabled={isPending || unreadCount === 0}
                  style={{ fontSize: '0.75rem' }}
                >
                  {isPending ? 'Marcando…' : 'Marcar como leídas'}
                </button>
                <Link
                  className="workspace-button"
                  href="/admin/collections/notifications"
                  style={{ fontSize: '0.75rem' }}
                >
                  Ver todas →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Hermes AI toggle */}
        <button
          className="workspace-icon-button"
          type="button"
          onClick={onToggleAiDrawer}
          aria-label={isAiDrawerOpen ? 'Cerrar Hermes' : 'Abrir Hermes'}
          aria-pressed={isAiDrawerOpen}
        >
          <Bot size={18} />
        </button>
      </div>
    </header>
  )
}
