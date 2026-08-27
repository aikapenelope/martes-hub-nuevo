import React from 'react'
import { headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { WorkspaceShell } from './components/WorkspaceShell'
import '../(frontend)/styles.css'

export const metadata = {
  title: 'Martes Hub — Workspace Suite',
  description: 'Sistema Operativo y Centro de Comando Empresarial para Martes Hub',
}

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/admin/login?redirect=${encodeURIComponent('/overview')}`)
  }

  const userDoc = user as { email?: string; firstName?: string; lastName?: string }
  const userName = userDoc.firstName ? `${userDoc.firstName} ${userDoc.lastName || ''}`.trim() : undefined

  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, background: '#050505' }}>
        <WorkspaceShell userEmail={userDoc.email} userName={userName}>
          {children}
        </WorkspaceShell>
      </body>
    </html>
  )
}
