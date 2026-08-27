'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  label: string
  href: string
  icon: string
  badge?: string
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: '📊' },
  { label: 'CRM Studio', href: '/crm', icon: '💼' },
  { label: 'Tareas', href: '/tasks', icon: '⚡' },
  { label: 'Inbox', href: '/inbox', icon: '💬' },
  { label: 'Social Hub', href: '/social', icon: '📱' },
  { label: 'Facturación', href: '/billing', icon: '💰' },
  { label: 'Analíticas', href: '/analytics', icon: '📈' },
]

export const WorkspaceSidebar: React.FC = () => {
  const pathname = usePathname()

  return (
    <aside
      style={{
        width: 240,
        background: '#080808',
        borderRight: '1px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px 16px',
        flexShrink: 0,
      }}
    >
      <div>
        {/* Brand Header */}
        <div style={{ padding: '0 8px 24px', borderBottom: '1px solid #141414', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                background: 'linear-gradient(135deg, #ff3333, #aa00ff)',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                color: '#fff',
                fontSize: 14,
              }}
            >
              M
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
                MARTES HUB
              </div>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                WORKSPACE SUITE
              </div>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 4,
                  textDecoration: 'none',
                  background: active ? '#141414' : 'transparent',
                  color: active ? '#ffffff' : '#888888',
                  borderLeft: active ? '2px solid #00ffaa' : '2px solid transparent',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    style={{
                      background: '#222',
                      color: '#00ffaa',
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 10,
                      fontWeight: 700,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Bottom Section: Superadmin Gateway */}
      <div style={{ borderTop: '1px solid #141414', paddingTop: 16 }}>
        <Link
          href="/admin"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: '#111',
            border: '1px solid #222',
            borderRadius: 4,
            textDecoration: 'none',
            color: '#aaa',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <span>👑 Superadmin</span>
          <span style={{ fontSize: 9, color: '#555' }}>/ADMIN ↗</span>
        </Link>
      </div>
    </aside>
  )
}
