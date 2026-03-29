import type { AppRole } from '../../lib/rbac'

export type NavItem = {
  to: string
  label: string
  roles: AppRole[]
}

export const clientNavItems: NavItem[] = [
  { to: '/apply', label: 'Apply', roles: ['Client'] },
  { to: '/home', label: 'Dashboard', roles: ['Client'] },
  { to: '/status', label: 'Status', roles: ['Client'] }
]

export const internalNavItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', roles: ['Intern', 'Originator', 'LoanOfficer', 'Admin'] },
  { to: '/applications', label: 'Applications', roles: ['Intern', 'Originator', 'LoanOfficer', 'Admin'] },
  { to: '/loans', label: 'Loans', roles: ['Originator', 'LoanOfficer', 'Admin'] },
  { to: '/portfolio', label: 'Portfolio', roles: ['LoanOfficer', 'Admin'] }
]
