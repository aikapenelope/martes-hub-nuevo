'use client'

import { changeMembershipStatusAction } from '@/lib/membership-actions'

/**
 * `<select>` de cambio de estado de membresía. Client Component por la misma
 * razón que TaskStatusSelect: los Server Components no pueden pasar
 * `onChange`. La mutación la ejecuta la Server Action de memberships.
 */
export function MembershipStatusSelect({
  membershipId,
  status,
  label,
}: {
  membershipId: number
  status: string
  label: string
}) {
  const options: Array<{ value: string; label: string }> = [
    { value: 'activa', label: 'Activa' },
    { value: 'pausada', label: 'Pausada' },
    { value: 'vencida', label: 'Vencida' },
    { value: 'cancelada', label: 'Cancelada' },
  ]

  return (
    <form action={changeMembershipStatusAction}>
      <input type="hidden" name="id" value={membershipId} />
      <select
        name="status"
        defaultValue={status}
        aria-label={label}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="border border-zinc-800 bg-black px-1.5 py-0.5 text-[10px] text-zinc-300 font-mono uppercase"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  )
}