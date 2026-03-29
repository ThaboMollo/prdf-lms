import { Outlet } from 'react-router-dom'
import type { MeResponse } from '../lib/api'
import type { AppRole } from '../lib/rbac'
import { hasAnyRole, toAppRoles } from '../lib/rbac'

type RequireRoleProps = {
  me: MeResponse
  allowed: AppRole[]
}

export function RequireRole({ me, allowed }: RequireRoleProps) {
  const roles = toAppRoles(me.roles)
  if (!hasAnyRole(roles, allowed)) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <h1>Access restricted</h1>
          <p>Your account does not have permission to view this area.</p>
          <p>Please contact an administrator to grant the correct role.</p>
        </section>
      </main>
    )
  }

  return <Outlet />
}
