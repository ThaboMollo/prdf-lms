import type { NoteItem } from '../../../api'
import { createSupabaseDataClient } from '../../../supabase/client'
import type { NotesRepository } from '../../repositories/notes.repo'

type NoteRow = {
  id: string
  application_id: string
  body: string
  created_by: string
  created_at: string
}

function mapNoteRow(row: NoteRow): NoteItem {
  return {
    id: row.id,
    applicationId: row.application_id,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

export function createSupabaseNotesAdapter(accessToken: string): NotesRepository {
  const client = createSupabaseDataClient(accessToken)
  const userId = (() => {
    try {
      const [, payload] = accessToken.split('.')
      if (!payload) return ''
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }
      return json.sub ?? ''
    } catch {
      return ''
    }
  })()

  return {
    async listNotes(applicationId: string): Promise<NoteItem[]> {
      const { data, error } = await client
        .from('notes')
        .select('id, application_id, body, created_by, created_at')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true })

      if (error) {
        throw new Error(`Supabase list notes failed: ${error.message}`)
      }

      return (data as NoteRow[]).map(mapNoteRow)
    },
    async createNote(applicationId: string, body: string): Promise<NoteItem> {
      if (!userId) {
        throw new Error('Unable to resolve authenticated user id for note creation.')
      }

      const { data, error } = await client
        .from('notes')
        .insert({
          application_id: applicationId,
          body,
          created_by: userId
        })
        .select('id, application_id, body, created_by, created_at')
        .single()

      if (error) {
        throw new Error(`Supabase create note failed: ${error.message}`)
      }

      return mapNoteRow(data as NoteRow)
    }
  }
}
