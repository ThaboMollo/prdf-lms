import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createNfsUseCases } from '../../logic/usecases/nfs'
import { EmptyState } from '../../components/shared/EmptyState'
import { NumericInput } from '../../components/shared/NumericInput'
import { useToast } from '../../components/shared/ToastProvider'
import { formatDate } from '../../lib/format'

type CaseAdvisoryProps = {
  clientId: string
  applicationId: string
  accessToken: string
}

export function CaseAdvisory({ clientId, applicationId, accessToken }: CaseAdvisoryProps) {
  const nfsUseCases = useMemo(() => createNfsUseCases(accessToken), [accessToken])
  const queryClient = useQueryClient()
  const toast = useToast()

  const [supportType, setSupportType] = useState('Mentorship')
  const [durationHours, setDurationHours] = useState<number | null>(1)
  const [dateProvided, setDateProvided] = useState('')
  const [notes, setNotes] = useState('')

  const nfsQuery = useQuery({
    queryKey: ['case-nfs', clientId],
    queryFn: () => nfsUseCases.listNfs(clientId)
  })

  const createMutation = useMutation({
    mutationFn: () => {
      if (!supportType || !dateProvided || durationHours === null || durationHours <= 0) {
        throw new Error('Please fill all required advisory fields.')
      }
      return nfsUseCases.createNfs({ clientId, applicationId, supportType, durationHours, dateProvided, notes })
    },
    onSuccess: async () => {
      toast.push('Advisory session logged.', 'success')
      setSupportType('Mentorship')
      setDurationHours(1)
      setDateProvided('')
      setNotes('')
      await queryClient.invalidateQueries({ queryKey: ['case-nfs', clientId] })
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Could not log session.', 'error')
  })

  const items = nfsQuery.data ?? []

  return (
    <div className="stack-sm">
      <div className="form-grid">
        <label>
          Support type
          <select value={supportType} onChange={(event) => setSupportType(event.target.value)}>
            <option value="Mentorship">Mentorship</option>
            <option value="Accounting">Accounting Advisory</option>
            <option value="Legal">Legal Advisory</option>
            <option value="Business Plan">Business Plan Writing</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <div className="field-block">
          <label htmlFor="nfsDuration">Duration (hours)</label>
          <NumericInput field="nfsDuration" mode="decimal" min={0} value={durationHours} onChange={setDurationHours} />
        </div>
        <label>
          Date provided
          <input type="date" value={dateProvided} onChange={(event) => setDateProvided(event.target.value)} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        <button
          className="btn"
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !dateProvided || !durationHours || durationHours <= 0}
        >
          {createMutation.isPending ? 'Logging…' : 'Log session'}
        </button>
      </div>

      {nfsQuery.isLoading ? <p>Loading advisory logs…</p> : items.length ? (
        <ul className="list-clean">
          {items.map((item) => (
            <li key={item.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <p className="list-title">{item.supportType} ({item.durationHours} hours)</p>
                <small>{formatDate(item.dateProvided)}</small>
                {item.notes ? <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{item.notes}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No advisory logs" message="Log non-financial support sessions above." />
      )}
    </div>
  )
}
