import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import {
  changeStatus,
  completeTask,
  confirmUpload,
  createNote,
  createTask,
  createApplication,
  getApplication,
  getHistory,
  listNotes,
  listApplications,
  listDocuments,
  listTasks,
  presignUpload,
  submitApplication,
  type ApplicationDetails,
  type NoteItem,
  type ApplicationSummary,
  type LoanApplicationStatus,
  type TaskItem,
  updateApplication,
  uploadToSignedUrl
} from '../lib/api'
import {
  createApplicationSchema,
  statusChangeSchema,
  uploadSchema,
  type CreateApplicationFormData
} from '../features/applications/validation'

type ApplicationsPageProps = {
  session: Session | null
}

const statusColumns: LoanApplicationStatus[] = [
  'Draft',
  'Submitted',
  'UnderReview',
  'InfoRequested',
  'Approved',
  'Rejected',
  'Disbursed',
  'InRepayment',
  'Closed'
]

export function ApplicationsPage({ session }: ApplicationsPageProps) {
  const queryClient = useQueryClient()
  const accessToken = session?.access_token ?? ''

  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [wizardStep, setWizardStep] = useState(1)
  const [wizardValues, setWizardValues] = useState<CreateApplicationFormData>({
    businessName: '',
    registrationNo: '',
    address: '',
    requestedAmount: 0,
    termMonths: 0,
    purpose: ''
  })
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [docError, setDocError] = useState<string | null>(null)
  const [docType, setDocType] = useState('IDDocument')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [statusTarget, setStatusTarget] = useState<LoanApplicationStatus>('UnderReview')
  const [statusNote, setStatusNote] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [newTaskAssignTo, setNewTaskAssignTo] = useState('')
  const [newNoteBody, setNewNoteBody] = useState('')
  const [infoRequestNote, setInfoRequestNote] = useState('')

  const meRoles = (session?.user.user_metadata?.roles as string[] | undefined)
    ?? (session?.user.user_metadata?.role ? [session.user.user_metadata.role as string] : [])

  const isStaff = meRoles.some((role) => ['Admin', 'LoanOfficer', 'Intern', 'Originator'].includes(role))

  const applicationsQuery = useQuery({
    queryKey: ['applications', session?.user.id],
    queryFn: () => listApplications(accessToken),
    enabled: Boolean(accessToken)
  })

  useEffect(() => {
    if (!selectedApplicationId && applicationsQuery.data && applicationsQuery.data.length > 0) {
      setSelectedApplicationId(applicationsQuery.data[0].id)
    }
  }, [applicationsQuery.data, selectedApplicationId])

  const detailsQuery = useQuery({
    queryKey: ['application-details', selectedApplicationId],
    queryFn: () => getApplication(accessToken, selectedApplicationId as string),
    enabled: Boolean(accessToken && selectedApplicationId)
  })

  const documentsQuery = useQuery({
    queryKey: ['application-documents', selectedApplicationId],
    queryFn: () => listDocuments(accessToken, selectedApplicationId as string),
    enabled: Boolean(accessToken && selectedApplicationId)
  })

  const historyQuery = useQuery({
    queryKey: ['application-history', selectedApplicationId],
    queryFn: () => getHistory(accessToken, selectedApplicationId as string),
    enabled: Boolean(accessToken && selectedApplicationId)
  })

  const notesQuery = useQuery({
    queryKey: ['application-notes', selectedApplicationId],
    queryFn: () => listNotes(accessToken, selectedApplicationId as string),
    enabled: Boolean(accessToken && selectedApplicationId)
  })

  const applicationTasksQuery = useQuery({
    queryKey: ['application-tasks', selectedApplicationId],
    queryFn: () => listTasks(accessToken, { applicationId: selectedApplicationId as string }),
    enabled: Boolean(accessToken && selectedApplicationId)
  })

  const myTasksQuery = useQuery({
    queryKey: ['my-tasks', session?.user.id],
    queryFn: () => listTasks(accessToken, { assignedToMe: true }),
    enabled: Boolean(accessToken)
  })

  const createDraftMutation = useMutation({
    mutationFn: (payload: CreateApplicationFormData) =>
      createApplication(accessToken, {
        requestedAmount: payload.requestedAmount,
        termMonths: payload.termMonths,
        purpose: payload.purpose,
        businessName: payload.businessName,
        registrationNo: payload.registrationNo,
        address: payload.address
      }),
    onSuccess: async (created) => {
      setWizardError(null)
      setSelectedApplicationId(created.id)
      setWizardStep(3)
      await queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
    onError: (error) => {
      setWizardError(error instanceof Error ? error.message : 'Could not create draft.')
    }
  })

  const submitMutation = useMutation({
    mutationFn: (id: string) => submitApplication(accessToken, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-details', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['application-history', selectedApplicationId] })
      ])
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId || !docFile) {
        throw new Error('Select application and file first.')
      }

      const parsed = uploadSchema.safeParse({ docType })
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0].message)
      }

      const presign = await presignUpload(accessToken, selectedApplicationId, docType, docFile.name, docFile.type)
      await uploadToSignedUrl(presign.uploadUrl, docFile)
      await confirmUpload(accessToken, selectedApplicationId, docType, presign.storagePath, 'Pending')
    },
    onSuccess: async () => {
      setDocError(null)
      setDocFile(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['application-documents', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['applications'] })
      ])
    },
    onError: (error) => {
      setDocError(error instanceof Error ? error.message : 'Upload failed.')
    }
  })

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId) {
        throw new Error('Select an application first.')
      }

      const parsed = statusChangeSchema.safeParse({ toStatus: statusTarget, note: statusNote })
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0].message)
      }

      return changeStatus(accessToken, selectedApplicationId, statusTarget, statusNote)
    },
    onSuccess: async () => {
      setStatusError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-details', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['application-history', selectedApplicationId] })
      ])
    },
    onError: (error) => {
      setStatusError(error instanceof Error ? error.message : 'Status change failed.')
    }
  })

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId || !detailsQuery.data) {
        throw new Error('Select an application first.')
      }

      return updateApplication(accessToken, selectedApplicationId, {
        requestedAmount: detailsQuery.data.requestedAmount,
        termMonths: detailsQuery.data.termMonths,
        purpose: detailsQuery.data.purpose,
        assignedToUserId: assignUserId || undefined
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-details', selectedApplicationId] })
      ])
    },
    onError: (error) => {
      setStatusError(error instanceof Error ? error.message : 'Assign failed.')
    }
  })

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId) {
        throw new Error('Select an application first.')
      }
      return createTask(accessToken, {
        applicationId: selectedApplicationId,
        title: newTaskTitle,
        assignedTo: newTaskAssignTo || undefined,
        dueDate: newTaskDueDate || undefined
      })
    },
    onSuccess: async () => {
      setNewTaskTitle('')
      setNewTaskDueDate('')
      setNewTaskAssignTo('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['application-tasks', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      ])
    },
    onError: (error) => {
      setStatusError(error instanceof Error ? error.message : 'Task creation failed.')
    }
  })

  const completeTaskMutation = useMutation({
    mutationFn: (task: TaskItem) => completeTask(accessToken, task.id, 'Task completed in-app.'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['application-tasks', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      ])
    }
  })

  const createNoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId) {
        throw new Error('Select an application first.')
      }
      return createNote(accessToken, selectedApplicationId, newNoteBody)
    },
    onSuccess: async () => {
      setNewNoteBody('')
      await queryClient.invalidateQueries({ queryKey: ['application-notes', selectedApplicationId] })
    },
    onError: (error) => {
      setStatusError(error instanceof Error ? error.message : 'Note creation failed.')
    }
  })

  const infoRequestedMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId) {
        throw new Error('Select an application first.')
      }
      return changeStatus(accessToken, selectedApplicationId, 'InfoRequested', infoRequestNote)
    },
    onSuccess: async () => {
      setInfoRequestNote('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-details', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['application-history', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['application-tasks', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['application-notes', selectedApplicationId] }),
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      ])
    },
    onError: (error) => {
      setStatusError(error instanceof Error ? error.message : 'Info request failed.')
    }
  })

  const applicationsByStatus = useMemo(() => {
    const groups: Record<LoanApplicationStatus, ApplicationSummary[]> = {
      Draft: [],
      Submitted: [],
      UnderReview: [],
      InfoRequested: [],
      Approved: [],
      Rejected: [],
      Disbursed: [],
      InRepayment: [],
      Closed: []
    }

    for (const app of applicationsQuery.data ?? []) {
      groups[app.status].push(app)
    }

    return groups
  }, [applicationsQuery.data])

  if (!accessToken) {
    return <p>Please log in to continue.</p>
  }

  function saveWizardAndContinue(nextStep: number) {
    const parsed = createApplicationSchema.safeParse(wizardValues)
    if (!parsed.success) {
      setWizardError(parsed.error.issues[0].message)
      return
    }

    setWizardError(null)
    setWizardValues(parsed.data)
    setWizardStep(nextStep)
  }

  const selectedDetails: ApplicationDetails | undefined = detailsQuery.data
  const notes: NoteItem[] = notesQuery.data ?? []

  return (
    <section>
      <h1>Applications</h1>

      {!isStaff ? (
        <div>
          <h2>Client Application Wizard</h2>
          <p>Step {wizardStep} of 3</p>

          {wizardStep === 1 ? (
            <div>
              <h3>Business Information</h3>
              <input
                placeholder="Business name"
                value={wizardValues.businessName}
                onChange={(e) => setWizardValues((prev) => ({ ...prev, businessName: e.target.value }))}
              />
              <input
                placeholder="Registration number"
                value={wizardValues.registrationNo ?? ''}
                onChange={(e) => setWizardValues((prev) => ({ ...prev, registrationNo: e.target.value }))}
              />
              <input
                placeholder="Address"
                value={wizardValues.address ?? ''}
                onChange={(e) => setWizardValues((prev) => ({ ...prev, address: e.target.value }))}
              />
              <button onClick={() => saveWizardAndContinue(2)}>Continue</button>
            </div>
          ) : null}

          {wizardStep === 2 ? (
            <div>
              <h3>Loan Request</h3>
              <input
                type="number"
                placeholder="Requested amount"
                value={wizardValues.requestedAmount}
                onChange={(e) => setWizardValues((prev) => ({ ...prev, requestedAmount: Number(e.target.value) }))}
              />
              <input
                type="number"
                placeholder="Term months"
                value={wizardValues.termMonths}
                onChange={(e) => setWizardValues((prev) => ({ ...prev, termMonths: Number(e.target.value) }))}
              />
              <input
                placeholder="Purpose"
                value={wizardValues.purpose}
                onChange={(e) => setWizardValues((prev) => ({ ...prev, purpose: e.target.value }))}
              />
              <button onClick={() => setWizardStep(1)}>Back</button>
              <button onClick={() => createDraftMutation.mutate(wizardValues)} disabled={createDraftMutation.isPending}>
                {createDraftMutation.isPending ? 'Creating...' : 'Create Draft'}
              </button>
            </div>
          ) : null}

          {wizardStep === 3 ? (
            <div>
              <h3>Uploads and Submit</h3>
              <p>Selected application: {selectedApplicationId ?? '-'}</p>

              <input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="Document type" />
              <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? 'Uploading...' : 'Upload Document'}
              </button>

              <button
                onClick={() => selectedApplicationId && submitMutation.mutate(selectedApplicationId)}
                disabled={!selectedApplicationId || submitMutation.isPending}
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          ) : null}

          {wizardError ? <p style={{ color: 'crimson' }}>{wizardError}</p> : null}
          {docError ? <p style={{ color: 'crimson' }}>{docError}</p> : null}

          <h3>Status Timeline</h3>
          {historyQuery.isLoading ? <p>Loading history...</p> : null}
          {historyQuery.data?.length ? (
            <ul>
              {historyQuery.data.map((item) => (
                <li key={item.id}>
                  {item.fromStatus ?? 'None'} to {item.toStatus} at {new Date(item.changedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No status history yet.</p>
          )}

          <h3>My Tasks</h3>
          {myTasksQuery.data?.length ? (
            <ul>
              {myTasksQuery.data.map((task) => (
                <li key={task.id}>
                  {task.title} ({task.status}) {task.dueDate ? `due ${task.dueDate}` : ''}
                  {task.status !== 'Completed' ? (
                    <button onClick={() => completeTaskMutation.mutate(task)} disabled={completeTaskMutation.isPending}>
                      Complete
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No assigned tasks.</p>
          )}

          <h3>Notes Timeline</h3>
          {notes.length ? (
            <ul>
              {notes.map((note) => (
                <li key={note.id}>
                  {new Date(note.createdAt).toLocaleString()} - {note.body}
                </li>
              ))}
            </ul>
          ) : (
            <p>No notes yet.</p>
          )}
        </div>
      ) : (
        <div>
          <h2>Pipeline Board</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))', gap: 12 }}>
            {statusColumns.map((status) => (
              <div key={status} style={{ background: '#fff', border: '1px solid #d0d7e2', padding: 10 }}>
                <strong>{status}</strong>
                <ul>
                  {applicationsByStatus[status].map((app) => (
                    <li key={app.id}>
                      <button onClick={() => setSelectedApplicationId(app.id)}>{app.id.slice(0, 8)}</button>
                      {' - '}R{app.requestedAmount}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <h2>Application Detail View</h2>
          {selectedDetails ? (
            <div>
              <p>ID: {selectedDetails.id}</p>
              <p>Status: {selectedDetails.status}</p>
              <p>Purpose: {selectedDetails.purpose}</p>
              <p>Assigned to: {selectedDetails.assignedToUserId ?? 'Unassigned'}</p>

              <h3>Assign Application</h3>
              <input
                placeholder="Assignee user UUID"
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
              />
              <button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>
                {assignMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>

              <h3>Documents</h3>
              <input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="Document type" />
              <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </button>

              {documentsQuery.data?.length ? (
                <ul>
                  {documentsQuery.data.map((doc) => (
                    <li key={doc.id}>
                      {doc.docType} - {doc.status} - {doc.storagePath}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No documents yet.</p>
              )}

              <h3>Status Change</h3>
              <select value={statusTarget} onChange={(e) => setStatusTarget(e.target.value as LoanApplicationStatus)}>
                {statusColumns.filter((s) => s !== 'Draft').map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Optional note" />
              <button onClick={() => statusMutation.mutate()} disabled={statusMutation.isPending}>
                {statusMutation.isPending ? 'Updating...' : 'Update Status'}
              </button>

              <h3>Info Request (Loan Officer)</h3>
              <input
                value={infoRequestNote}
                onChange={(e) => setInfoRequestNote(e.target.value)}
                placeholder="What information is missing?"
              />
              <button onClick={() => infoRequestedMutation.mutate()} disabled={infoRequestedMutation.isPending || !infoRequestNote.trim()}>
                {infoRequestedMutation.isPending ? 'Requesting...' : 'Request More Info'}
              </button>

              <h3>Task Board</h3>
              <input
                placeholder="Task title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <input
                placeholder="Assign user UUID (optional)"
                value={newTaskAssignTo}
                onChange={(e) => setNewTaskAssignTo(e.target.value)}
              />
              <input
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
              />
              <button onClick={() => createTaskMutation.mutate()} disabled={createTaskMutation.isPending || !newTaskTitle.trim()}>
                {createTaskMutation.isPending ? 'Creating task...' : 'Create Task'}
              </button>

              {applicationTasksQuery.data?.length ? (
                <ul>
                  {applicationTasksQuery.data.map((task) => (
                    <li key={task.id}>
                      {task.title} ({task.status}) {task.dueDate ? `due ${task.dueDate}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No tasks yet.</p>
              )}

              <h3>Notes Timeline</h3>
              <input
                placeholder="Add note"
                value={newNoteBody}
                onChange={(e) => setNewNoteBody(e.target.value)}
              />
              <button onClick={() => createNoteMutation.mutate()} disabled={createNoteMutation.isPending || !newNoteBody.trim()}>
                {createNoteMutation.isPending ? 'Saving note...' : 'Add Note'}
              </button>
              {notes.length ? (
                <ul>
                  {notes.map((note) => (
                    <li key={note.id}>
                      {new Date(note.createdAt).toLocaleString()} - {note.body}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No notes yet.</p>
              )}

              <h3>History</h3>
              {historyQuery.data?.length ? (
                <ul>
                  {historyQuery.data.map((item) => (
                    <li key={item.id}>
                      {item.fromStatus ?? 'None'} to {item.toStatus} ({new Date(item.changedAt).toLocaleString()})
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No history yet.</p>
              )}
            </div>
          ) : (
            <p>Select an application from the pipeline.</p>
          )}
        </div>
      )}

      {applicationsQuery.isLoading ? <p>Loading applications...</p> : null}
      {applicationsQuery.error ? <p style={{ color: 'crimson' }}>Unable to load applications.</p> : null}
      {statusError ? <p style={{ color: 'crimson' }}>{statusError}</p> : null}
    </section>
  )
}
