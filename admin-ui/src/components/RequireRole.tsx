import { Outlet } from 'react-router-dom'
import type { MeResponse } from '../lib/api'
import type { AppRole } from '../lib/rbac'
import { supabase } from '../lib/supabase'
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
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
            <strong>Debug info:</strong><br />
            Assigned roles: <code>{JSON.stringify(roles)}</code><br />
            Required roles: <code>{JSON.stringify(allowed)}</code>
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
              Sign Out
            </button>
          </div>
        </section>
      </main>
    )
  }

  return <Outlet />
}
