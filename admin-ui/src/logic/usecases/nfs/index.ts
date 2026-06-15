import type { CreateNfsInput } from '../../../lib/api'
import { createNfsRepository } from '../../../lib/data/repositories/nfs.repo'

export function createNfsUseCases(accessToken: string) {
  const repository = createNfsRepository(accessToken)

  return {
    listNfs: (clientId: string) => repository.listNfs(clientId),
    createNfs: (input: CreateNfsInput) => repository.createNfs(input)
  }
}
