import { createNote, listNotes } from '../../../api'
import type { NotesRepository } from '../../repositories/notes.repo'

export function createApiNotesAdapter(accessToken: string): NotesRepository {
  return {
    listNotes: (applicationId: string) => listNotes(accessToken, applicationId),
    createNote: (applicationId: string, body: string) => createNote(accessToken, applicationId, body)
  }
}
