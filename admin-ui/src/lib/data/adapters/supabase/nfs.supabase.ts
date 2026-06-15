import { createSupabaseDataClient } from '../../../supabase/client'
import type { CreateNfsInput, NonFinancialSupportItem } from '../../../api'

type NfsRow = {
  id: string
  client_id: string
  application_id: string | null
  advisor_user_id: string
  support_type: string
  duration_hours: number
  date_provided: string
  notes: string | null
  created_at: string
}

function mapNfsRow(row: NfsRow): NonFinancialSupportItem {
  return {
    id: row.id,
    clientId: row.client_id,
    applicationId: row.application_id,
    advisorUserId: row.advisor_user_id,
    supportType: row.support_type,
    durationHours: row.duration_hours,
    dateProvided: row.date_provided,
    notes: row.notes,
    createdAt: row.created_at
  }
}

export function createSupabaseNfsAdapter(accessToken: string) {
  const client = createSupabaseDataClient(accessToken)

  return {
    listNfs: async (clientId: string): Promise<NonFinancialSupportItem[]> => {
      const { data, error } = await client
        .from('non_financial_support')
        .select('*')
        .eq('client_id', clientId)
        .order('date_provided', { ascending: false })

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`)
      }

      return (data as NfsRow[]).map(mapNfsRow)
    },
    createNfs: async (input: CreateNfsInput): Promise<NonFinancialSupportItem> => {
      const authReq = await client.auth.getUser()
      if (authReq.error || !authReq.data.user) {
        throw new Error('Not authenticated')
      }

      const { data, error } = await client
        .from('non_financial_support')
        .insert({
          client_id: input.clientId,
          application_id: input.applicationId ?? null,
          advisor_user_id: authReq.data.user.id,
          support_type: input.supportType,
          duration_hours: input.durationHours,
          date_provided: input.dateProvided,
          notes: input.notes ?? null
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Supabase insert failed: ${error.message}`)
      }

      return mapNfsRow(data as NfsRow)
    }
  }
}
