import type { NoteItem } from '../../api'
import { createApiNotesAdapter } from '../adapters/api/notes.api'

export type NotesRepository = {
  listNotes: (applicationId: string) => Promise<NoteItem[]>
  createNote: (applicationId: string, body: string) => Promise<NoteItem>
}

export function createNotesRepository(accessToken: string): NotesRepository {
  return createApiNotesAdapter(accessToken)
}
