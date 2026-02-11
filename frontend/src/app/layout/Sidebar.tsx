import { NavLink } from 'react-router-dom'
import type { NavItem } from './navigation'

type SidebarProps = {
  items: NavItem[]
}

export function Sidebar({ items }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">PRDF LMS</div>
      <nav>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
