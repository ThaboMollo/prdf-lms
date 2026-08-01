import type { AppRole } from '../../lib/rbac'

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
  { to: '/dashboard', label: 'Dashboard', roles: ['Intern', 'Originator', 'LoanOfficer', 'Admin'] },
  { to: '/pipeline', label: 'Pipeline', roles: ['Intern', 'Originator', 'LoanOfficer', 'Admin'] },
  { to: '/loans', label: 'Loans', roles: ['LoanOfficer', 'Admin'] },
  { to: '/portfolio', label: 'Portfolio', roles: ['LoanOfficer', 'Admin'] },
  { to: '/reports', label: 'Reports', roles: ['LoanOfficer', 'Admin'] },
  { to: '/user-access', label: 'User Access', roles: ['Admin'] }
]
