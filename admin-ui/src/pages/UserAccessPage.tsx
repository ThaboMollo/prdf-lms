import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/shared/EmptyState'
import { PaginationControls } from '../components/shared/PaginationControls'
import { PageHeader } from '../components/shared/PageHeader'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { useToast } from '../components/shared/ToastProvider'
import {
  assignUserRole,
  removeUserRole,
  resetUserMfa,
  listAdminUserAccess,
  type AssignableRole,
  type AdminAccessFilter,
  type AdminAccessListItem,
  type MeResponse
} from '../lib/api'
import { toAppRoles } from '../lib/rbac'
import { paginateItems, parsePageParam } from '../lib/pagination'

type UserAccessPageProps = {
  session: Session
  me: MeResponse
}

type PendingAction =
  | { type: 'assign'; user: AdminAccessListItem; role: AssignableRole }
  | { type: 'remove'; user: AdminAccessListItem; role: AssignableRole }
  // The only recovery path from an MFA lockout: Supabase has no self-service
  // reset, so a staff member who loses their authenticator cannot get past the
  // challenge screen without a SuperAdmin clearing their factors here.
  | { type: 'reset-mfa'; user: AdminAccessListItem }

const ALL_ROLES: AssignableRole[] = ['Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin']
const ELEVATED_ROLES: AssignableRole[] = ['Admin']
const ROLE_OPTIONS = ['Admin', 'LoanOfficer', 'Originator', 'Intern', 'Client'] as const
const PAGE_SIZE = 10

export function UserAccessPage({ session, me }: UserAccessPageProps) {
  const accessToken = session.access_token
  const queryClient = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AdminAccessFilter>('all')
  const [role, setRole] = useState<string>('all')
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<Record<string, AssignableRole>>({})
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const deferredSearch = useDeferredValue(search)
  const usersPage = parsePageParam(params.get('usersPage'))

  // The actor's own powers decide which roles they may grant/revoke.
  const actorRoles = useMemo(() => toAppRoles(me.roles), [me.roles])
  const isSuperAdmin = actorRoles.includes('SuperAdmin')
  const isAdmin = actorRoles.includes('Admin')
  const canManageRole = (target: AssignableRole) =>
    ELEVATED_ROLES.includes(target) ? isSuperAdmin : isAdmin || isSuperAdmin
  const assignableRoles = useMemo(() => ALL_ROLES.filter((r) => canManageRole(r)), [isSuperAdmin, isAdmin])

  const accessQuery = useQuery({
    queryKey: ['admin-user-access', session.user.id, deferredSearch, filter, role],
    queryFn: () =>
      listAdminUserAccess(accessToken, {
        search: deferredSearch,
        filter,
        role: role === 'all' ? undefined : role
      })
  })

  const mutation = useMutation({
    mutationFn: async (action: PendingAction) => {
      if (action.type === 'assign') return assignUserRole(accessToken, action.user.userId, action.role)
      if (action.type === 'remove') return removeUserRole(accessToken, action.user.userId, action.role)
      return resetUserMfa(accessToken, action.user.userId)
    },
    onSuccess: (_result, action) => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-access'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      toast.push(
        action.type === 'assign'
          ? `${displayName(action.user)} now has the ${action.role} role.`
          : action.type === 'remove'
            ? `Removed the ${action.role} role from ${displayName(action.user)}.`
            : `Cleared MFA for ${displayName(action.user)}. They will be asked to enrol again at next sign-in.`,
        'success'
      )
      setPendingAction(null)
    },
    onError: (error) => {
      toast.push(error instanceof Error ? error.message : 'Access update failed.', 'error')
    }
  })

  const summary = useMemo(() => {
    const items = accessQuery.data ?? []
    const internalRoles = ['Intern', 'Originator', 'LoanOfficer', 'Admin']
    return {
      visibleUsers: items.length,
      internal: items.filter((item) => item.roles.some((role) => internalRoles.includes(role))).length,
      clients: items.filter((item) => item.roles.includes('Client')).length,
      admins: items.filter((item) => item.isAdmin).length,
    }
  }, [accessQuery.data])

  const pagedUsers = useMemo(
    () => paginateItems(accessQuery.data ?? [], usersPage, PAGE_SIZE),
    [accessQuery.data, usersPage]
  )

  useEffect(() => {
    if (pagedUsers.page !== usersPage) {
      const next = new URLSearchParams(params)
      next.set('usersPage', String(pagedUsers.page))
      setParams(next, { replace: true })
    }
  }, [pagedUsers.page, params, setParams, usersPage])

  return (
    <section className="stack">
      <PageHeader
        title="User Access"
        subtitle={
          isSuperAdmin
            ? 'Manage application roles for registered users. Platform ownership is managed outside the app.'
            : 'Assign or remove standard internal roles. Only a SuperAdmin can manage Admin access.'
        }
      />

      <div className="grid-four">
        <article className="kpi-card">
          <p className="kpi-label">Visible Users</p>
          <p className="kpi-value">{summary.visibleUsers}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Internal</p>
          <p className="kpi-value">{summary.internal}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Clients</p>
          <p className="kpi-value">{summary.clients}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Admins</p>
          <p className="kpi-value">{summary.admins}</p>
        </article>
      </div>

      <section className="card stack-sm">
        <div className="filters-row">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              const next = new URLSearchParams(params)
              next.set('usersPage', '1')
              setParams(next, { replace: true })
            }}
            placeholder="Search by name or email"
            aria-label="Search users"
          />
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as AdminAccessFilter)
              const next = new URLSearchParams(params)
              next.set('usersPage', '1')
              setParams(next, { replace: true })
            }}
            aria-label="Filter users"
          >
            <option value="all">All users</option>
            <option value="internal">Internal users</option>
            <option value="clients">Clients</option>
            <option value="admins">Admins only</option>
            <option value="non-admins">Non-admin internal users</option>
          </select>
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value)
              const next = new URLSearchParams(params)
              next.set('usersPage', '1')
              setParams(next, { replace: true })
            }}
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            {ROLE_OPTIONS.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption}
              </option>
            ))}
          </select>
        </div>
      </section>

      <p className="helper-text">
        Roles, least &rarr; most access: <strong>Client · Intern · Originator · LoanOfficer · Admin</strong>. The ×
        on a chip removes that role · <strong>Admin</strong> is managed by a SuperAdmin only · <strong>Reset MFA</strong>{' '}
        clears a user&rsquo;s authenticators so they can enrol a new device.
      </p>

      <section className="card table-wrap stack-sm">
        <div className="access-table-header">
          <h2>User Access</h2>
          {accessQuery.isFetching ? <span className="table-meta">Refreshing...</span> : null}
        </div>

        {accessQuery.isLoading ? <p>Loading access data...</p> : null}
        {accessQuery.isError ? (
          <div className="stack-sm" role="alert">
            <p className="text-error">
              Could not load user access data. {accessQuery.error instanceof Error ? accessQuery.error.message : ''}
            </p>
            <button className="btn btn-secondary" type="button" onClick={() => void accessQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        {!accessQuery.isLoading && !accessQuery.isError && !(accessQuery.data?.length ?? 0) ? (
          <EmptyState title="No matching users" message="Adjust your search or filters to find another user." />
        ) : null}

        {!accessQuery.isLoading && !accessQuery.isError && (accessQuery.data?.length ?? 0) > 0 ? (
          <>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Assign Role</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.items.map((user) => {
                const selected = selectedRoleByUser[user.userId]
                  ?? assignableRoles.find((r) => !user.roles.includes(r))
                  ?? assignableRoles[0]
                const alreadyHas = selected ? user.roles.includes(selected) : true
                return (
                <tr key={user.userId}>
                  <td>
                    <div className="stack-sm">
                      <strong>{displayName(user)}</strong>
                      <span className="table-meta">{user.userId}</span>
                    </div>
                  </td>
                  <td>{user.email ?? 'No email'}</td>
                  <td>
                    <div className="role-chip-row">
                      {user.roles.length === 0 ? <span className="table-meta">No roles</span> : null}
                      {user.roles.map((roleName) => {
                        const managed = canManageRole(roleName as AssignableRole)
                        return (
                          <span key={`${user.userId}-${roleName}`} className="role-chip">
                            {roleName}
                            {managed ? (
                              <button
                                type="button"
                                className="role-chip-remove"
                                aria-label={`Remove ${roleName} role from ${displayName(user)}`}
                                title={`Remove ${roleName} role`}
                                disabled={mutation.isPending}
                                onClick={() =>
                                  setPendingAction({ type: 'remove', user, role: roleName as AssignableRole })
                                }
                              >
                                ×
                              </button>
                            ) : null}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td>
                    {assignableRoles.length === 0 ? (
                      <span className="table-meta">No assignable roles</span>
                    ) : (
                      <div className="inline-actions">
                        <select
                          value={selected}
                          onChange={(event) =>
                            setSelectedRoleByUser((prev) => ({
                              ...prev,
                              [user.userId]: event.target.value as AssignableRole
                            }))
                          }
                          aria-label={`Assign role for ${displayName(user)}`}
                          disabled={mutation.isPending}
                        >
                          {assignableRoles.map((roleOption) => (
                            <option key={`${user.userId}-assign-${roleOption}`} value={roleOption}>
                              {roleOption}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn"
                          disabled={mutation.isPending || alreadyHas || !selected}
                          title={alreadyHas ? 'User already has this role.' : 'Assign selected role'}
                          onClick={() =>
                            selected && setPendingAction({ type: 'assign', user, role: selected })
                          }
                        >
                          Assign
                        </button>
                        {/* Only a SuperAdmin can clear another user's MFA, and
                            never their own — a self-service reset would let
                            anyone holding your password strip your second
                            factor, which defeats the control entirely. */}
                        {isSuperAdmin && user.userId !== session.user.id ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={mutation.isPending}
                            title="Clear this user's authenticators so they can enrol a new device"
                            onClick={() => setPendingAction({ type: 'reset-mfa', user })}
                          >
                            Reset MFA
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          <PaginationControls
            page={pagedUsers.page}
            totalPages={pagedUsers.totalPages}
            onPageChange={(nextPage) => {
              const next = new URLSearchParams(params)
              next.set('usersPage', String(nextPage))
              setParams(next)
            }}
          />
          </>
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={
          pendingAction?.type === 'assign'
            ? `Assign ${pendingAction.role} role`
            : pendingAction?.type === 'remove'
              ? `Remove ${pendingAction.role} role`
              : 'Reset multi-factor authentication'
        }
        confirmLabel={pendingAction?.type === 'reset-mfa' ? 'Reset MFA' : 'Confirm'}
        danger={pendingAction?.type === 'remove' || pendingAction?.type === 'reset-mfa'}
        busy={mutation.isPending}
        onConfirm={() => {
          if (pendingAction) mutation.mutate(pendingAction)
        }}
        onCancel={() => {
          if (!mutation.isPending) setPendingAction(null)
        }}
      >
        {pendingAction ? (
          <>
            <p className={pendingAction.type === 'reset-mfa' ? 'text-error' : undefined}>
              {pendingAction.type === 'assign'
                ? `This will add the ${pendingAction.role} role while preserving all existing roles.`
                : pendingAction.type === 'remove'
                  ? `This will remove only the ${pendingAction.role} role and leave the user's other roles unchanged.`
                  : 'This clears every authenticator registered to this user, so they can enrol a new device. Their roles are unchanged. Only do this once you are confident who you are talking to — it lowers the account to password-only until they re-enrol.'}
            </p>
            <p><strong>User:</strong> {displayName(pendingAction.user)}</p>
            <p><strong>Email:</strong> {pendingAction.user.email ?? 'No email'}</p>
            <p><strong>Current roles:</strong> {pendingAction.user.roles.join(', ') || 'None'}</p>
          </>
        ) : null}
      </ConfirmDialog>
    </section>
  )
}

function displayName(user: AdminAccessListItem): string {
  return user.fullName?.trim() || user.email?.trim() || user.userId
}
