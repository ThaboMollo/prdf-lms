import { NavLink } from 'react-router-dom'
import type { NavItem } from './navigation'

type MobileNavDrawerProps = {
  open: boolean
  onClose: () => void
  items: NavItem[]
  title: string
}

export function MobileNavDrawer({ open, onClose, items, title }: MobileNavDrawerProps) {
  return (
    <div className={open ? 'drawer drawer-open' : 'drawer'} aria-hidden={!open}>
      <button type="button" className="drawer-backdrop" onClick={onClose} aria-label="Close menu" />
      <aside className="drawer-panel" aria-label="Mobile navigation">
        <div className="sidebar-brand"><span>{title}</span></div>
        <nav>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
            >
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </div>
  )
}
