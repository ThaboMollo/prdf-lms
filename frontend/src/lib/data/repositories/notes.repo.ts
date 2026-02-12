import type { NoteItem } from '../../api'
import { getDataProvider } from '../../config/dataProvider'
import { createApiNotesAdapter } from '../adapters/api/notes.api'
import { createSupabaseNotesAdapter } from '../adapters/supabase/notes.supabase'

export type NotesRepository = {
  listNotes: (applicationId: string) => Promise<NoteItem[]>
  createNote: (applicationId: string, body: string) => Promise<NoteItem>
}

export function createNotesRepository(accessToken: string): NotesRepository {
  const provider = getDataProvider()
  if (provider === 'api') {
    return createApiNotesAdapter(accessToken)
  }

  return createSupabaseNotesAdapter(accessToken)
}
