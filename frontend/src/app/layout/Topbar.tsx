import type { NotificationItem } from '../../lib/api'

type TopbarProps = {
  email: string
  onMenuOpen: () => void
  onLogout: () => void
  notifications: NotificationItem[]
  onMarkRead: (id: string) => void
  isMarkingRead: boolean
}

export function Topbar({
  email,
  onMenuOpen,
  onLogout,
  notifications,
  onMarkRead,
  isMarkingRead
}: TopbarProps) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn mobile-only" onClick={onMenuOpen} aria-label="Open menu">
        Menu
      </button>
      <div>
        <p className="topbar-title">Loan Management</p>
        <p className="topbar-sub">Signed in as {email}</p>
      </div>
      <div className="topbar-actions">
        <details className="notif-wrap">
          <summary className="icon-btn" aria-label="Notifications">
            Alerts ({notifications.length})
          </summary>
          <div className="notif-popover">
            {notifications.length ? (
              <ul>
                {notifications.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <p>{item.title}</p>
                    <small>{item.message}</small>
                    <button type="button" className="link-btn" onClick={() => onMarkRead(item.id)} disabled={isMarkingRead}>
                      Mark read
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No unread notifications.</p>
            )}
          </div>
        </details>
        <button type="button" className="btn btn-secondary" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}
