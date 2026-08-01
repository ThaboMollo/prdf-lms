import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createNotesUseCases } from '../../logic/usecases/notes'
import { EmptyState } from '../../components/shared/EmptyState'
import { useToast } from '../../components/shared/ToastProvider'
import { formatDateTime } from '../../lib/format'

type CaseNotesProps = {
  applicationId: string
  accessToken: string
}

export function CaseNotes({ applicationId, accessToken }: CaseNotesProps) {
  const notesUseCases = useMemo(() => createNotesUseCases(accessToken), [accessToken])
  const queryClient = useQueryClient()
  const toast = useToast()
  const [body, setBody] = useState('')

  const notesQuery = useQuery({
    queryKey: ['case-notes', applicationId],
    queryFn: () => notesUseCases.listNotes(applicationId)
  })

  const createMutation = useMutation({
    mutationFn: () => notesUseCases.createNote(applicationId, body),
    onSuccess: async () => {
      toast.push('Note added.', 'success')
      setBody('')
      await queryClient.invalidateQueries({ queryKey: ['case-notes', applicationId] })
    },
    onError: () => toast.push('Could not add note.', 'error')
  })

  const notes = notesQuery.data ?? []

  return (
    <div className="stack-sm">
      <div className="form-grid">
        <label>
          New note
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
        </label>
        <button className="btn" type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !body.trim()}>
          {createMutation.isPending ? 'Adding…' : 'Add note'}
        </button>
      </div>

      {notesQuery.isLoading ? <p>Loading notes…</p> : notes.length ? (
        <ol className="timeline">
          {notes.map((note) => (
            <li key={note.id}>
              <p style={{ whiteSpace: 'pre-wrap' }}>{note.body}</p>
              <small>{formatDateTime(note.createdAt)}</small>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="No notes" message="Add internal notes for your team." />
      )}
    </div>
  )
}
