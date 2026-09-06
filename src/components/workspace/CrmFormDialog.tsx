'use client'

import { CrmSlideOverDrawer, type CrmSlideOverDrawerProps } from '@/components/workspace/crm/CrmSlideOverDrawer'

export type CrmFormDialogProps = CrmSlideOverDrawerProps

/**
 * CrmFormDialog — ahora enriquecido como Slide-Over Drawer lateral de alta ergonomía.
 * Mantiene compatibilidad total con CrmHeader y CockpitCommandStrip reemplazando
 * el modal centrado por un drawer espacioso con contexto comercial y radar.
 */
export function CrmFormDialog(props: CrmFormDialogProps) {
  return <CrmSlideOverDrawer {...props} />
}
