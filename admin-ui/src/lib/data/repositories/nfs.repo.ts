import type { CreateNfsInput, NonFinancialSupportItem } from '../../api'
import { createApiNfsAdapter } from '../adapters/api/nfs.api'

export type NfsRepository = {
  listNfs: (clientId: string) => Promise<NonFinancialSupportItem[]>
  createNfs: (input: CreateNfsInput) => Promise<NonFinancialSupportItem>
}

export function createNfsRepository(accessToken: string): NfsRepository {
  return createApiNfsAdapter(accessToken)
}
