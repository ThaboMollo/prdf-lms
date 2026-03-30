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
  grantAdminAccess,
  listAdminUserAccess,
  revokeAdminAccess,
  type AssignableRole,
  type AdminAccessFilter,
  type AdminAccessListItem
} from '../lib/api'
import { paginateItems, parsePageParam } from '../lib/pagination'

type UserAccessPageProps = {
  session: Session
}

type PendingAction =
  | { type: 'grant'; user: AdminAccessListItem }
  | { type: 'revoke'; user: AdminAccessListItem }
  | { type: 'assign-role'; user: AdminAccessListItem; role: AssignableRole }

const ROLE_OPTIONS = ['Admin', 'LoanOfficer', 'Originator', 'Intern', 'Client'] as const
const ASSIGNABLE_ROLE_OPTIONS: AssignableRole[] = ['Client', 'Intern', 'Originator', 'LoanOfficer']
const PAGE_SIZE = 10

export function UserAccessPage({ session }: UserAccessPageProps) {
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
      action.type === 'grant'
        ? grantAdminAccess(accessToken, action.user.userId)
        : action.type === 'revoke'
          ? revokeAdminAccess(accessToken, action.user.userId)
          : assignUserRole(accessToken, action.user.userId, action.role),
    onSuccess: (_result, action) => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-access'] })
      toast.push(
        action.type === 'grant'
          ? `${displayName(action.user)} now has Admin access.`
          : action.type === 'revoke'
            ? `${displayName(action.user)} no longer has Admin access.`
            : `${displayName(action.user)} now has the ${action.role} role.`,
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
      eligible: items.filter((item) => item.canGrantAdmin).length
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
        subtitle="Review all users and grant or revoke Admin access for eligible internal users."
      />

      <div className="grid-three">
        <article className="kpi-card">
          <p className="kpi-label">Visible Users</p>
          <p className="kpi-value">{summary.visibleUsers}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Current Admins</p>
          <p className="kpi-value">{summary.admins}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Eligible For Admin</p>
          <p className="kpi-value">{summary.eligible}</p>
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
                <th>Admin Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.items.map((user) => (
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
                      {user.roles.map((roleName) => (
                        <span key={`${user.userId}-${roleName}`} className="role-chip">
                          {roleName}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${user.isAdmin ? 'status-ok' : 'status-alert'}`}>
                      {user.isAdmin ? 'Admin' : user.isInternal ? 'Standard internal' : 'Client/External'}
                    </span>
                  </td>
                  <td>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={!user.canGrantAdmin || mutation.isPending}
                        title={user.grantDisabledReason ?? 'Grant Admin access'}
                        onClick={() => setPendingAction({ type: 'grant', user })}
                      >
                        Grant Admin
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!user.canRevokeAdmin || mutation.isPending}
                        title={user.revokeDisabledReason ?? 'Revoke Admin access'}
                        onClick={() => setPendingAction({ type: 'revoke', user })}
                      >
                        Revoke Admin
                      </button>
                      <select
                        value={selectedRoleByUser[user.userId] ?? 'Client'}
                        onChange={(event) =>
                          setSelectedRoleByUser((prev) => ({
                            ...prev,
                            [user.userId]: event.target.value as AssignableRole
                          }))
                        }
                        aria-label={`Assign role for ${displayName(user)}`}
                        disabled={mutation.isPending}
                      >
                        {ASSIGNABLE_ROLE_OPTIONS.map((roleOption) => (
                          <option key={`${user.userId}-assign-${roleOption}`} value={roleOption}>
                            {roleOption}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={
                          mutation.isPending ||
                          user.roles.includes(selectedRoleByUser[user.userId] ?? 'Client')
                        }
                        title={
                          user.roles.includes(selectedRoleByUser[user.userId] ?? 'Client')
                            ? 'User already has this role.'
                            : 'Assign selected role'
                        }
                        onClick={() =>
                          setPendingAction({
                            type: 'assign-role',
                            user,
                            role: selectedRoleByUser[user.userId] ?? 'Client'
                          })
                        }
                      >
                        Assign Role
                      </button>
                    </div>
                    {!user.canGrantAdmin && user.grantDisabledReason ? (
                      <p className="helper-text">{user.grantDisabledReason}</p>
                    ) : null}
                    {!user.canRevokeAdmin && user.revokeDisabledReason ? (
                      <p className="helper-text">{user.revokeDisabledReason}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
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
                  {pendingAction.type === 'grant'
                    ? 'Grant Admin access'
                    : pendingAction.type === 'revoke'
                      ? 'Revoke Admin access'
                      : `Assign ${pendingAction.role} role`}
                </h2>
                <p>
                  {pendingAction.type === 'grant'
                    ? "This will add the Admin role while preserving the user's existing internal roles."
                    : pendingAction.type === 'revoke'
                      ? "This will remove only the Admin role and leave the user's other roles unchanged."
                      : `This will add the ${pendingAction.role} role while preserving all existing roles.`}
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
