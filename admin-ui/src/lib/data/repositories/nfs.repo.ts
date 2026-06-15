import type { CreateNfsInput, NonFinancialSupportItem } from '../../api'
import { getDataProvider } from '../../config/dataProvider'
import { createApiNfsAdapter } from '../adapters/api/nfs.api'
import { createSupabaseNfsAdapter } from '../adapters/supabase/nfs.supabase'

export type NfsRepository = {
  listNfs: (clientId: string) => Promise<NonFinancialSupportItem[]>
  createNfs: (input: CreateNfsInput) => Promise<NonFinancialSupportItem>
}

export function createNfsRepository(accessToken: string): NfsRepository {
  const provider = getDataProvider()
  if (provider === 'api') {
    return createApiNfsAdapter(accessToken)
  }

  return createSupabaseNfsAdapter(accessToken)
}
