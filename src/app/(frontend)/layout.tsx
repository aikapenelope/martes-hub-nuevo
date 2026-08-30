import React from 'react'
import './styles.css'

export const metadata = {
  title: 'Martes Hub — CRM & Operaciones',
  description: 'CRM integral privado Martes Hub - Payload 3 + Neon + Vercel.',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
