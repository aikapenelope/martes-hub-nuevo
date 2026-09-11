'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

import { createSocialAccountAction } from '@/lib/social-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground'

/**
 * Reemplaza el link a `/admin/collections/social-accounts/create`. Solo se
 * renderiza para admins (`SocialAccounts.access.create: adminOnly`) — el
 * caller decide si mostrar el botón según `context.isAdmin`.
 */
export function SocialAccountCreateDialog({ variant = 'button' }: { variant?: 'button' | 'cta' }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'button' ? (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Conectar cuenta"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className="mt-2 font-mono text-xs font-bold uppercase tracking-wider"
          onClick={() => setOpen(true)}
        >
          Conectar cuenta
        </Button>
      )}

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
      >
        <SheetContent side="right" className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Conectar Cuenta Social
            </SheetTitle>
            <SheetDescription className="sr-only">Registra una cuenta social del tenant</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">

        <form action={createSocialAccountAction} className="flex flex-col gap-3">
          <p className="text-[11px] text-muted-foreground">
            Referencia de la cuenta (nombre e ID) — sin credenciales. La conexión real de publicación
            se gestiona en Metricool o Composio, conectados por MCP a este sistema.
          </p>
          <label className={labelCls}>
            Nombre de la cuenta / página
            <Input name="accountName" required maxLength={160} />
          </label>
          <label className={labelCls}>
            Plataforma
            <Select name="platform" defaultValue="instagram">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Instagram Business" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram Business</SelectItem>
                <SelectItem value="facebook">Facebook Page</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className={labelCls}>
            ID de la cuenta en la plataforma
            <Input name="platformAccountId" required maxLength={160} placeholder="Page ID, IG Business Account ID, o el de Metricool" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="font-mono text-xs font-bold uppercase tracking-wider"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="font-mono text-xs font-bold uppercase tracking-wider">
              Conectar
            </Button>
          </div>
        </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
