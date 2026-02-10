import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { disburseLoan, getLoan, recordRepayment } from '../lib/api'

type LoanDetailsPageProps = {
  session: Session | null
}

export function LoanDetailsPage({ session }: LoanDetailsPageProps) {
  const queryClient = useQueryClient()
  const accessToken = session?.access_token ?? ''
  const [loanId, setLoanId] = useState('')
  const [submittedLoanId, setSubmittedLoanId] = useState('')
  const [disburseAmount, setDisburseAmount] = useState(0)
  const [disburseReference, setDisburseReference] = useState('')
  const [repaymentAmount, setRepaymentAmount] = useState(0)
  const [repaymentReference, setRepaymentReference] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const loanQuery = useQuery({
    queryKey: ['loan-details', submittedLoanId],
    queryFn: () => getLoan(accessToken, submittedLoanId),
    enabled: Boolean(accessToken && submittedLoanId)
  })

  const disburseMutation = useMutation({
    mutationFn: () => disburseLoan(accessToken, submittedLoanId, disburseAmount, disburseReference),
    onSuccess: async () => {
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['loan-details', submittedLoanId] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Could not disburse loan.')
    }
  })

  const repaymentMutation = useMutation({
    mutationFn: () => recordRepayment(accessToken, submittedLoanId, repaymentAmount, repaymentReference),
    onSuccess: async () => {
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['loan-details', submittedLoanId] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Could not record repayment.')
    }
  })

  const totalDue = useMemo(() => {
    return loanQuery.data?.schedule.reduce((sum, item) => sum + item.dueTotal, 0) ?? 0
  }, [loanQuery.data])

  if (!accessToken) {
    return <p>Please log in to continue.</p>
  }

  return (
    <section>
      <h1>Loan Details</h1>
      <p>Enter a loan ID to view repayment schedule and payments.</p>

      <div>
        <input
          placeholder="Loan ID (UUID)"
          value={loanId}
          onChange={(e) => setLoanId(e.target.value)}
          style={{ minWidth: 360 }}
        />
        <button
          onClick={() => {
            setFormError(null)
            setSubmittedLoanId(loanId.trim())
          }}
          disabled={!loanId.trim()}
        >
          Load Loan
        </button>
      </div>

      {loanQuery.isLoading ? <p>Loading loan...</p> : null}
      {loanQuery.isError ? <p style={{ color: 'crimson' }}>Unable to load loan details.</p> : null}

      {loanQuery.data ? (
        <div>
          <h2>Overview</h2>
          <p>Loan ID: {loanQuery.data.id}</p>
          <p>Application ID: {loanQuery.data.applicationId}</p>
          <p>Status: {loanQuery.data.status}</p>
          <p>Principal: R{loanQuery.data.principalAmount.toFixed(2)}</p>
          <p>Outstanding: R{loanQuery.data.outstandingPrincipal.toFixed(2)}</p>
          <p>Total Scheduled Due: R{totalDue.toFixed(2)}</p>

          <h3>Disburse</h3>
          <input
            type="number"
            placeholder="Amount"
            value={disburseAmount}
            onChange={(e) => setDisburseAmount(Number(e.target.value))}
          />
          <input
            placeholder="Reference (optional)"
            value={disburseReference}
            onChange={(e) => setDisburseReference(e.target.value)}
          />
          <button
            onClick={() => disburseMutation.mutate()}
            disabled={disburseMutation.isPending || disburseAmount <= 0 || !submittedLoanId}
          >
            {disburseMutation.isPending ? 'Disbursing...' : 'Disburse Loan'}
          </button>

          <h3>Record Repayment</h3>
          <input
            type="number"
            placeholder="Amount"
            value={repaymentAmount}
            onChange={(e) => setRepaymentAmount(Number(e.target.value))}
          />
          <input
            placeholder="Payment reference (optional)"
            value={repaymentReference}
            onChange={(e) => setRepaymentReference(e.target.value)}
          />
          <button
            onClick={() => repaymentMutation.mutate()}
            disabled={repaymentMutation.isPending || repaymentAmount <= 0 || !submittedLoanId}
          >
            {repaymentMutation.isPending ? 'Recording...' : 'Record Repayment'}
          </button>

          <h2>Repayment Schedule</h2>
          {loanQuery.data.schedule.length ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Due Date</th>
                  <th>Due Total</th>
                  <th>Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loanQuery.data.schedule.map((item) => (
                  <tr key={item.id}>
                    <td>{item.installmentNo}</td>
                    <td>{item.dueDate}</td>
                    <td>R{item.dueTotal.toFixed(2)}</td>
                    <td>R{item.paidAmount.toFixed(2)}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No schedule generated yet.</p>
          )}

          <h2>Repayments</h2>
          {loanQuery.data.repayments.length ? (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Principal</th>
                  <th>Interest</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {loanQuery.data.repayments.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.paidAt).toLocaleString()}</td>
                    <td>R{item.amount.toFixed(2)}</td>
                    <td>R{item.principalComponent.toFixed(2)}</td>
                    <td>R{item.interestComponent.toFixed(2)}</td>
                    <td>{item.paymentReference ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No repayments recorded yet.</p>
          )}
        </div>
      ) : null}

      {formError ? <p style={{ color: 'crimson' }}>{formError}</p> : null}
    </section>
  )
}
