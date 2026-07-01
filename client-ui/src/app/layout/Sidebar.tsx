import { NavLink } from 'react-router-dom'
import type { NavItem } from './navigation'

type SidebarProps = {
  items: NavItem[]
  title: string
}

export function Sidebar({ items, title }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Primary">
      <NavLink to="/home" className="sidebar-brand" aria-label={`${title} home`}>
        <span>{title}</span>
      </NavLink>
      <nav>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
