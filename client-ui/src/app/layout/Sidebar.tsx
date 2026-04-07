import { NavLink } from 'react-router-dom'
import type { NavItem } from './navigation'

type SidebarProps = {
  items: NavItem[]
  title: string
}

export function Sidebar({ items, title }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <span style={{ color: '#ffffff', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em' }}>
          {title}
        </span>
      </div>
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
