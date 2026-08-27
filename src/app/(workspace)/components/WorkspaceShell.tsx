'use client'

import React, { useState } from 'react'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { WorkspaceHeader } from './WorkspaceHeader'
import { HermesAiSidecar } from './HermesAiSidecar'

interface WorkspaceShellProps {
  userEmail?: string
  userName?: string
  children: React.ReactNode
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  userEmail,
  userName,
  children,
}) => {
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(true)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#050505', color: '#fff' }}>
      <WorkspaceSidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <WorkspaceHeader
          userEmail={userEmail}
          userName={userName}
          isAiDrawerOpen={isAiDrawerOpen}
          onToggleAiDrawer={() => setIsAiDrawerOpen((prev) => !prev)}
        />
        <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
          <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {children}
          </main>
          <HermesAiSidecar
            isOpen={isAiDrawerOpen}
            onClose={() => setIsAiDrawerOpen(false)}
          />
        </div>
      </div>
    </div>
  )
}
