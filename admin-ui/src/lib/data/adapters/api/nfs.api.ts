import { createNfs, listNfs, type CreateNfsInput, type NonFinancialSupportItem } from '../../../api'

export function createApiNfsAdapter(accessToken: string) {
  return {
    listNfs: (clientId: string): Promise<NonFinancialSupportItem[]> => listNfs(accessToken, clientId),
    createNfs: (input: CreateNfsInput): Promise<NonFinancialSupportItem> => createNfs(accessToken, input)
  }
}
