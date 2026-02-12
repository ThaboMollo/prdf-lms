import type { LoanDetails, LoanRepaymentItem, LoanScheduleItem } from '../../../api'
import { createSupabaseDataClient } from '../../../supabase/client'
import type { LoansRepository } from '../../repositories/loans.repo'

type LoanRow = {
  id: string
  application_id: string
  principal_amount: number
  outstanding_principal: number
  interest_rate: number
  term_months: number
  status: 'PendingDisbursement' | 'Disbursed' | 'InRepayment' | 'Closed'
  disbursed_at: string | null
  created_at: string
}

type RepaymentRow = {
  id: string
  amount: number
  principal_component: number
  interest_component: number
  paid_at: string
  payment_reference: string | null
}

type ScheduleRow = {
  id: string
  installment_no: number
  due_date: string
  due_principal: number
  due_interest: number
  due_total: number
  paid_amount: number
  status: string
  paid_at: string | null
}

function mapRepayment(row: RepaymentRow): LoanRepaymentItem {
  return {
    id: row.id,
    amount: row.amount,
    principalComponent: row.principal_component,
    interestComponent: row.interest_component,
    paidAt: row.paid_at,
    paymentReference: row.payment_reference
  }
}

function mapSchedule(row: ScheduleRow): LoanScheduleItem {
  return {
    id: row.id,
    installmentNo: row.installment_no,
    dueDate: row.due_date,
    duePrincipal: row.due_principal,
    dueInterest: row.due_interest,
    dueTotal: row.due_total,
    paidAmount: row.paid_amount,
    status: row.status,
    paidAt: row.paid_at
  }
}

function decodeUserId(accessToken: string): string {
  try {
    const [, payload] = accessToken.split('.')
    if (!payload) return ''
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }
    return json.sub ?? ''
  } catch {
    return ''
  }
}

export function createSupabaseLoansAdapter(accessToken: string): LoansRepository {
  const client = createSupabaseDataClient(accessToken)
  const userId = decodeUserId(accessToken)

  const getLoanInternal = async (loanId: string): Promise<LoanDetails> => {
    const loan = await client
      .from('loans')
      .select('id, application_id, principal_amount, outstanding_principal, interest_rate, term_months, status, disbursed_at, created_at')
      .eq('id', loanId)
      .single()
    if (loan.error) {
      throw new Error(`Supabase get loan failed: ${loan.error.message}`)
    }

    const schedule = await client
      .from('repayment_schedule')
      .select('id, installment_no, due_date, due_principal, due_interest, due_total, paid_amount, status, paid_at')
      .eq('loan_id', loanId)
      .order('installment_no', { ascending: true })
    if (schedule.error) {
      throw new Error(`Supabase get repayment schedule failed: ${schedule.error.message}`)
    }

    const repayments = await client
      .from('repayments')
      .select('id, amount, principal_component, interest_component, paid_at, payment_reference')
      .eq('loan_id', loanId)
      .order('paid_at', { ascending: false })
    if (repayments.error) {
      throw new Error(`Supabase get repayments failed: ${repayments.error.message}`)
    }

    const row = loan.data as LoanRow
    return {
      id: row.id,
      applicationId: row.application_id,
      principalAmount: row.principal_amount,
      outstandingPrincipal: row.outstanding_principal,
      interestRate: row.interest_rate,
      termMonths: row.term_months,
      status: row.status,
      disbursedAt: row.disbursed_at,
      createdAt: row.created_at,
      schedule: (schedule.data as ScheduleRow[]).map(mapSchedule),
      repayments: (repayments.data as RepaymentRow[]).map(mapRepayment)
    }
  }

  return {
    getLoan: (loanId: string) => getLoanInternal(loanId),
    async disburseLoan(loanId: string, amount: number, reference?: string): Promise<LoanDetails> {
      const nowIso = new Date().toISOString()
      const disbursement = await client.from('disbursements').insert({
        loan_id: loanId,
        amount,
        reference: reference ?? null,
        disbursed_by: userId || null,
        disbursed_at: nowIso
      })
      if (disbursement.error) {
        throw new Error(`Supabase disbursement insert failed: ${disbursement.error.message}`)
      }

      const update = await client
        .from('loans')
        .update({ status: 'Disbursed', disbursed_at: nowIso })
        .eq('id', loanId)
      if (update.error) {
        throw new Error(`Supabase loan disburse update failed: ${update.error.message}`)
      }

      return getLoanInternal(loanId)
    },
    async recordRepayment(loanId: string, amount: number, paymentReference?: string, paidAt?: string): Promise<LoanDetails> {
      const insert = await client.from('repayments').insert({
        loan_id: loanId,
        amount,
        principal_component: amount,
        interest_component: 0,
        payment_reference: paymentReference ?? null,
        paid_at: paidAt ?? new Date().toISOString(),
        recorded_by: userId || null
      })
      if (insert.error) {
        throw new Error(`Supabase repayment insert failed: ${insert.error.message}`)
      }

      const current = await client
        .from('loans')
        .select('outstanding_principal')
        .eq('id', loanId)
        .single()
      if (!current.error && current.data) {
        const outstanding = Math.max(0, Number((current.data as { outstanding_principal: number }).outstanding_principal) - amount)
        await client.from('loans').update({ outstanding_principal: outstanding }).eq('id', loanId)
      }

      return getLoanInternal(loanId)
    }
  }
}
