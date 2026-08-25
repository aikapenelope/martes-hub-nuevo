import type { Access, FieldAccess } from 'payload'
import type { User } from '@/payload-types'

const isAdminUser = (user?: User | null): boolean =>
  Boolean(user?.roles?.includes('admin'))

const isEditorUser = (user?: User | null): boolean =>
  Boolean(user && (user.roles?.includes('admin') || user.roles?.includes('agente')))

export const anyone: Access = () => true

export const authenticated: Access = ({ req }) => Boolean(req.user)

export const adminOnly: Access = ({ req }) => isAdminUser(req.user as User | null)

export const editorsOnly: Access = ({ req }) => isEditorUser(req.user as User | null)

export const fieldAdminOnly: FieldAccess = ({ req }) =>
  isAdminUser(req.user as User | null)
