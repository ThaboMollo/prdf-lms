import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/shared/EmptyState'
import { PaginationControls } from '../components/shared/PaginationControls'
import { PageHeader } from '../components/shared/PageHeader'
import { useToast } from '../components/shared/ToastProvider'
import {
  assignUserRole,
  removeUserRole,
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

const ALL_ROLES: AssignableRole[] = ['Client', 'Intern', 'Originator', 'LoanOfficer', 'Admin', 'SuperAdmin']
const ELEVATED_ROLES: AssignableRole[] = ['Admin', 'SuperAdmin']
const ROLE_OPTIONS = ['SuperAdmin', 'Admin', 'LoanOfficer', 'Originator', 'Intern', 'Client'] as const
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
  const modalRef = useRef<HTMLElement | null>(null)
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
    mutationFn: async (action: PendingAction) =>
      action.type === 'assign'
        ? assignUserRole(accessToken, action.user.userId, action.role)
        : removeUserRole(accessToken, action.user.userId, action.role),
    onSuccess: (_result, action) => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-access'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      toast.push(
        action.type === 'assign'
          ? `${displayName(action.user)} now has the ${action.role} role.`
          : `Removed the ${action.role} role from ${displayName(action.user)}.`,
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
    return {
      visibleUsers: items.length,
      admins: items.filter((item) => item.isAdmin).length,
      superAdmins: items.filter((item) => item.isSuperAdmin).length
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

  useEffect(() => {
    if (!pendingAction || !modalRef.current) return
    modalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const firstButton = modalRef.current.querySelector('button')
    if (firstButton instanceof HTMLButtonElement) {
      firstButton.focus()
    }
  }, [pendingAction])

  return (
    <section className="stack">
      <PageHeader
        title="User Access"
        subtitle={
          isSuperAdmin
            ? 'Assign or remove any role, including Admin and SuperAdmin, for any registered user.'
            : 'Assign or remove standard internal roles. Only a SuperAdmin can manage Admin access.'
        }
      />

      <div className="grid-three">
        <article className="kpi-card">
          <p className="kpi-label">Visible Users</p>
          <p className="kpi-value">{summary.visibleUsers}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Admins</p>
          <p className="kpi-value">{summary.admins}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Super Admins</p>
          <p className="kpi-value">{summary.superAdmins}</p>
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

      <section className="card table-wrap stack-sm">
        <div className="access-table-header">
          <h2>User Access</h2>
          {accessQuery.isFetching ? <span className="table-meta">Refreshing...</span> : null}
        </div>

        {accessQuery.isLoading ? <p>Loading access data...</p> : null}
        {accessQuery.isError ? <p className="text-error">Could not load user access data.</p> : null}

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

      {pendingAction ? (
        <div className="modal-backdrop" role="presentation">
          <section ref={modalRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="user-access-dialog-title">
            <header className="modal-header">
              <div className="stack-sm">
                <h2 id="user-access-dialog-title">
                  {pendingAction.type === 'assign'
                    ? `Assign ${pendingAction.role} role`
                    : `Remove ${pendingAction.role} role`}
                </h2>
                <p>
                  {pendingAction.type === 'assign'
                    ? `This will add the ${pendingAction.role} role while preserving all existing roles.`
                    : `This will remove only the ${pendingAction.role} role and leave the user's other roles unchanged.`}
                </p>
              </div>
            </header>

            <div className="stack-sm">
              <p><strong>User:</strong> {displayName(pendingAction.user)}</p>
              <p><strong>Email:</strong> {pendingAction.user.email ?? 'No email'}</p>
              <p><strong>Current roles:</strong> {pendingAction.user.roles.join(', ') || 'None'}</p>
            </div>

            <div className="inline-actions">
              <button
                type="button"
                className={`btn${mutation.isPending ? ' btn-loading' : ''}`}
                onClick={() => mutation.mutate(pendingAction)}
                disabled={mutation.isPending}
              >
                Confirm
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPendingAction(null)}
                disabled={mutation.isPending}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function displayName(user: AdminAccessListItem): string {
  return user.fullName?.trim() || user.email?.trim() || user.userId
}
