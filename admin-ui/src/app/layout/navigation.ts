import type { AppRole } from '../../lib/rbac'
import { ALL_INTERNAL_ROLES, MANAGEMENT_ROLES } from '../../lib/rbac'

export type NavItem = {
  to: string
  label: string
  roles: AppRole[]
}

export const clientNavItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', roles: ['Client'] },
  { to: '/applications', label: 'Applications', roles: ['Client'] }
]

export const internalNavItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', roles: ALL_INTERNAL_ROLES },
  { to: '/pipeline', label: 'Pipeline', roles: ALL_INTERNAL_ROLES },
  { to: '/loans', label: 'Loans', roles: MANAGEMENT_ROLES },
  { to: '/portfolio', label: 'Portfolio', roles: MANAGEMENT_ROLES },
  { to: '/reports', label: 'Reports', roles: MANAGEMENT_ROLES },
  { to: '/user-access', label: 'User Access', roles: ['Admin'] }
]
