import { SidebarTrigger } from '@/components/ui/sidebar'

/**
 * Trigger del sidebar con el estilo del bloque efferd/dashboard-2.
 * (El registro no incluye este archivo aunque app-header lo importa —
 * creado localmente sobre el SidebarTrigger oficial de shadcn.)
 */
export function CustomSidebarTrigger() {
  return <SidebarTrigger className="-ml-1" />
}
