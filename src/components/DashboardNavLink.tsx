'use client'

import React from 'react'
import Link from 'next/link'

/**
 * afterNavLinks injected in the Payload admin sidebar.
 * Exposes quick access to the custom workspace views registered as admin views.
 */
export const DashboardNavLink: React.FC = () => (
  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
    <Link href="/admin/analytics" className="nav__link">
      Analytics
    </Link>
    <Link href="/admin/dashboard" className="nav__link">
      Dashboard (Hermes)
    </Link>
    <Link href="/admin/overview" className="nav__link">
      Resumen
    </Link>
    <Link href="/admin/hoy" className="nav__link">
      Hoy
    </Link>
    <Link href="/admin/inbox" className="nav__link">
      Inbox
    </Link>
    <Link href="/admin/crm" className="nav__link">
      CRM
    </Link>
    <Link href="/admin/tasks" className="nav__link">
      Tareas
    </Link>
    <Link href="/admin/billing" className="nav__link">
      Facturación
    </Link>
    <Link href="/admin/social" className="nav__link">
      Social
    </Link>
  </div>
)
