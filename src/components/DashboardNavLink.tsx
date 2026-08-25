'use client'

import React from 'react'
import Link from 'next/link'

export const DashboardNavLink: React.FC = () => (
  <div style={{ marginTop: 10 }}>
    <Link href="/admin/dashboard" className="nav__link">
      Dashboard
    </Link>
  </div>
)
