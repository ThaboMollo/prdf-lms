import { createNotesRepository } from '../../../lib/data/repositories/notes.repo'

export function createNotesUseCases(accessToken: string) {
  const repository = createNotesRepository(accessToken)

  return {
    listNotes: (applicationId: string) => repository.listNotes(applicationId),
    createNote: (applicationId: string, body: string) => repository.createNote(applicationId, body)
  }
}
