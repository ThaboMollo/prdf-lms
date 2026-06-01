import type { AppRole } from '../../lib/rbac'

export type NavItem = {
  to: string
  label: string
  roles: AppRole[]
  icon: string
}

export const clientNavItems: NavItem[] = [
  { to: '/home', label: 'Home', roles: ['Client'], icon: 'fa-house' },
  { to: '/apply', label: 'Applications', roles: ['Client'], icon: 'fa-file-lines' },
  { to: '/documents', label: 'Documents', roles: ['Client'], icon: 'fa-folder-open' },
  { to: '/status', label: 'Status', roles: ['Client'], icon: 'fa-chart-line' }
]

export const internalNavItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', roles: ['Intern', 'Originator', 'LoanOfficer', 'Admin'], icon: 'fa-gauge-high' },
  { to: '/applications', label: 'Applications', roles: ['Intern', 'Originator', 'LoanOfficer', 'Admin'], icon: 'fa-file-lines' },
  { to: '/loans', label: 'Loans', roles: ['Originator', 'LoanOfficer', 'Admin'], icon: 'fa-hand-holding-dollar' },
  { to: '/portfolio', label: 'Portfolio', roles: ['LoanOfficer', 'Admin'], icon: 'fa-chart-pie' }
]
