import { Navigate, Outlet } from 'react-router-dom'
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
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
