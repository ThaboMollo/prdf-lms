import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MeResponse } from '../lib/api'
import { updateMyProfile } from '../lib/api'
import { PageHeader } from '../components/shared/PageHeader'
import { useToast } from '../components/shared/ToastProvider'

type ProfilePageProps = {
  session: Session
  me: MeResponse
}

const hintStyle: React.CSSProperties = { color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }

export function ProfilePage({ session, me }: ProfilePageProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState(me.fullName ?? '')
  const [phone, setPhone] = useState(me.phone ?? '')

  const mutation = useMutation({
    mutationFn: () => updateMyProfile(session.access_token, { fullName: fullName.trim(), phone: phone.trim() || null }),
    onSuccess: async () => {
      // Refresh the app-wide profile so the sidebar/topbar name and every
      // assignee/author lookup pick up the new name immediately.
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      toast.push('Profile updated.', 'success')
    },
    onError: () => {
      toast.push('Could not save your profile. Please try again.', 'error')
    }
  })

  const trimmed = fullName.trim()
  const dirty = trimmed !== (me.fullName ?? '') || phone.trim() !== (me.phone ?? '')
  const canSave = trimmed.length > 0 && dirty && !mutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    mutation.mutate()
  }

  return (
    <div className="stack">
      <PageHeader
        title="My Profile"
        subtitle="Update the name and contact details shown across the console."
      />

      <div className="card" style={{ maxWidth: 560 }}>
        <form className="stack" onSubmit={handleSubmit}>
          <div className="field-block">
            <label htmlFor="profile-name">Full name</label>
            <input
              id="profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Thabo Mthembu"
              maxLength={200}
              required
            />
            <p style={hintStyle}>This is the name teammates see on assignments, notes, and reports.</p>
          </div>

          <div className="field-block">
            <label htmlFor="profile-phone">Phone <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +27 82 000 0000"
              maxLength={40}
            />
          </div>

          <div className="field-block">
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" value={me.email ?? session.user.email ?? '—'} disabled readOnly />
            <p style={hintStyle}>Managed by your sign-in — contact an administrator to change it.</p>
          </div>

          <div className="field-block">
            <label>Roles</label>
            <div className="chip-row">
              {me.roles.length ? (
                me.roles.map((role) => (
                  <span key={role} className="status-badge status-neutral">{role}</span>
                ))
              ) : (
                <p style={hintStyle}>No roles assigned.</p>
              )}
            </div>
          </div>

          <div>
            <button type="submit" className="btn" disabled={!canSave}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
