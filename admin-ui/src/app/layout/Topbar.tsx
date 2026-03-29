import { useCallback, useSyncExternalStore } from 'react'
import type { NotificationItem } from '../../lib/api'

type TopbarProps = {
  email: string
  title: string
  onMenuOpen: () => void
  onLogout: () => void
  notifications: NotificationItem[]
  onMarkRead: (id: string) => void
  isMarkingRead: boolean
}

function getTheme(): string {
  return document.documentElement.getAttribute('data-theme') ?? 'system'
}

function subscribeTheme(callback: () => void): () => void {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function resolveEffectiveDark(theme: string): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function Topbar({
  email,
  title,
  onMenuOpen,
  onLogout,
  notifications,
  onMarkRead,
  isMarkingRead
}: TopbarProps) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme)
  const isDark = resolveEffectiveDark(theme)

  const toggleTheme = useCallback(() => {
    const next = isDark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }, [isDark])

  return (
    <header className="topbar">
      <button type="button" className="icon-btn mobile-only" onClick={onMenuOpen} aria-label="Open menu">
        Menu
      </button>
      <div>
        <p className="topbar-title">{title}</p>
        <p className="topbar-sub">Signed in as {email}</p>
      </div>
      <div className="topbar-actions">
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          <i className={isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'} aria-hidden="true" />
        </button>
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
