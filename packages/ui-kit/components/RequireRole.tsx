import { Outlet } from 'react-router-dom'

// Role-checking (toAppRoles/hasAnyRole) stays in each app's own lib/rbac —
// this component only renders the allow/deny outcome, so it doesn't need to
// know either app's concrete role type.
type RequireRoleProps = {
  isAllowed: boolean
  onSignOut: () => void
}

export function RequireRole({ isAllowed, onSignOut }: RequireRoleProps) {
  if (!isAllowed) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <h1>Access restricted</h1>
          <p>Your account does not have permission to view this area.</p>
          <p>Please contact an administrator to grant the correct role.</p>
          <div style={{ marginTop: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={onSignOut}>
              Sign Out
            </button>
          </div>
        </section>
      </main>
    )
  }

  return <Outlet />
}
