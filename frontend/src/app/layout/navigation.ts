import type { AppRole } from '../../lib/rbac'

export type NavItem = {
  to: string
  label: string
  roles: AppRole[]
}

export const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', roles: ['Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin'] },
  { to: '/applications', label: 'Applications', roles: ['Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin'] },
  { to: '/loans', label: 'Loans', roles: ['Originator', 'LoanOfficer', 'Admin'] },
  { to: '/portfolio', label: 'Portfolio', roles: ['LoanOfficer', 'Admin'] }
]
