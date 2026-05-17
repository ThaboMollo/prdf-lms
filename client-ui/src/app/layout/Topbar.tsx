import type { NotificationItem } from '../../lib/api'

type TopbarProps = {
  email: string
  title: string
  showMenu?: boolean
  onMenuOpen: () => void
  onLogout: () => void
  notifications: NotificationItem[]
  onMarkRead: (id: string) => void
  isMarkingRead: boolean
}

export function Topbar({
  email,
  title,
  showMenu = true,
  onMenuOpen,
  onLogout,
  notifications,
  onMarkRead,
  isMarkingRead
}: TopbarProps) {

  return (
    <header className="topbar">
      {showMenu ? (
        <button type="button" className="icon-btn mobile-only" onClick={onMenuOpen} aria-label="Open menu">
          <i className="fa-solid fa-bars" aria-hidden="true" />
        </button>
      ) : (
        <span />
      )}
      <div>
        <p className="topbar-title">{title}</p>
        <p className="topbar-sub">{email}</p>
      </div>
      <div className="topbar-actions">
        <details className="notif-wrap">
          <summary className="icon-btn" aria-label={`Notifications (${notifications.length} unread)`}>
            <i className="fa-solid fa-bell" aria-hidden="true" />
            {notifications.length > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  background: 'var(--danger)',
                  color: '#fff',
                  borderRadius: '50%',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  marginLeft: '4px',
                }}
              >
                {notifications.length}
              </span>
            )}
          </summary>
          <div className="notif-popover">
            {notifications.length ? (
              <ul>
                {notifications.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <p>{item.title}</p>
                    <small>{item.message}</small>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => onMarkRead(item.id)}
                      disabled={isMarkingRead}
                    >
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
