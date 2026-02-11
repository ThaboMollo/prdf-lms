
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import {
  changeStatus,
  completeTask,
  confirmUpload,
  createApplication,
  createNote,
  createTask,
  getApplication,
  getHistory,
  listApplications,
  listDocuments,
  listNotes,
  listTasks,
  presignUpload,
  submitApplication,
  updateApplication,
  uploadToSignedUrl,
  type ApplicationDetails,
  type ApplicationDocument,
  type LoanApplicationStatus,
  type MeResponse,
  type NoteItem,
  type StatusHistoryItem,
  type TaskItem
} from '../lib/api'
import { createApplicationSchema, statusChangeSchema, uploadSchema, type CreateApplicationFormData } from '../features/applications/validation'
import { EmptyState } from '../components/shared/EmptyState'
import { PageHeader } from '../components/shared/PageHeader'
import { DetailSkeleton, ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import { useToast } from '../components/shared/ToastProvider'
import { formatCurrency, formatDate, formatDateTime } from '../lib/format'
import { hasAnyRole, toAppRoles } from '../lib/rbac'

type ApplicationsPageProps = {
  session: Session
  me: MeResponse
}

const statuses: LoanApplicationStatus[] = [
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

const requiredDocumentTypes = ['IDDocument', 'BankStatement', 'BusinessRegistration']

type DetailTab = 'Details' | 'Documents' | 'History' | 'Tasks' | 'Notes'

export function ApplicationsPage({ session, me }: ApplicationsPageProps) {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<DetailTab>('Details')
  const [statusTarget, setStatusTarget] = useState<LoanApplicationStatus>('UnderReview')
  const [statusNote, setStatusNote] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskAssignTo, setTaskAssignTo] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [docType, setDocType] = useState('IDDocument')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [infoRequestNote, setInfoRequestNote] = useState('')
  const [wizardStep, setWizardStep] = useState(1)
  const [wizardValues, setWizardValues] = useState<CreateApplicationFormData>({
    businessName: '',
    registrationNo: '',
    address: '',
    requestedAmount: 0,
    termMonths: 0,
    purpose: ''
  })

  const queryClient = useQueryClient()
  const toast = useToast()
  const accessToken = session.access_token
  const roles = toAppRoles(me.roles)
  const isInternal = hasAnyRole(roles, ['Intern', 'Originator', 'LoanOfficer', 'Admin'])

  const statusFilter = params.get('status') ?? 'all'
  const search = params.get('q') ?? ''
  const selectedApplicationId = params.get('app')

  const applicationsQuery = useQuery({
    queryKey: ['applications', session.user.id],
    queryFn: () => listApplications(accessToken)
  })

  const filteredApplications = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return (applicationsQuery.data ?? []).filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (!normalizedSearch) return true

      return (
        item.id.toLowerCase().includes(normalizedSearch)
        || item.clientId.toLowerCase().includes(normalizedSearch)
        || item.purpose.toLowerCase().includes(normalizedSearch)
      )
    })
  }, [applicationsQuery.data, search, statusFilter])

  useEffect(() => {
    if (!selectedApplicationId && filteredApplications.length) {
      const next = new URLSearchParams(params)
      next.set('app', filteredApplications[0].id)
      setParams(next, { replace: true })
    }
  }, [filteredApplications, params, selectedApplicationId, setParams])

  const detailsQuery = useQuery({
    queryKey: ['application-details', selectedApplicationId],
    queryFn: () => getApplication(accessToken, selectedApplicationId as string),
    enabled: Boolean(selectedApplicationId)
  })

  const docsQuery = useQuery({
    queryKey: ['application-documents', selectedApplicationId],
    queryFn: () => listDocuments(accessToken, selectedApplicationId as string),
    enabled: Boolean(selectedApplicationId)
  })

  const historyQuery = useQuery({
    queryKey: ['application-history', selectedApplicationId],
    queryFn: () => getHistory(accessToken, selectedApplicationId as string),
    enabled: Boolean(selectedApplicationId)
  })

  const tasksQuery = useQuery({
    queryKey: ['application-tasks', selectedApplicationId],
    queryFn: () => listTasks(accessToken, { applicationId: selectedApplicationId as string }),
    enabled: Boolean(selectedApplicationId)
  })

  const notesQuery = useQuery({
    queryKey: ['application-notes', selectedApplicationId],
    queryFn: () => listNotes(accessToken, selectedApplicationId as string),
    enabled: Boolean(selectedApplicationId)
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
      toast.push('Draft application created.', 'success')
      await queryClient.invalidateQueries({ queryKey: ['applications'] })
      const next = new URLSearchParams(params)
      next.set('app', created.id)
      setParams(next)
      setWizardStep(3)
    },
    onError: (error) => {
      toast.push(error instanceof Error ? error.message : 'Could not create draft.', 'error')
    }
  })

  const submitMutation = useMutation({
    mutationFn: (id: string) => submitApplication(accessToken, id),
    onSuccess: async () => {
      toast.push('Application submitted.', 'success')
      await refreshSelected(queryClient, selectedApplicationId)
    },
    onError: () => toast.push('Could not submit application.', 'error')
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId || !docFile) throw new Error('Select application and file first.')

      const parsed = uploadSchema.safeParse({ docType })
      if (!parsed.success) throw new Error(parsed.error.issues[0].message)

      const presign = await presignUpload(accessToken, selectedApplicationId, docType, docFile.name, docFile.type)
      await uploadToSignedUrl(presign.uploadUrl, docFile)
      await confirmUpload(accessToken, selectedApplicationId, docType, presign.storagePath, 'Uploaded')
    },
    onSuccess: async () => {
      toast.push('Document uploaded.', 'success')
      setDocFile(null)
      await queryClient.invalidateQueries({ queryKey: ['application-documents', selectedApplicationId] })
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Upload failed.', 'error')
  })

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId) throw new Error('Select an application first.')

      const parsed = statusChangeSchema.safeParse({ toStatus: statusTarget, note: statusNote })
      if (!parsed.success) throw new Error(parsed.error.issues[0].message)

      return changeStatus(accessToken, selectedApplicationId, statusTarget, statusNote)
    },
    onSuccess: async () => {
      toast.push('Status updated.', 'success')
      setStatusNote('')
      await refreshSelected(queryClient, selectedApplicationId)
    },
    onError: (error) => toast.push(error instanceof Error ? error.message : 'Status update failed.', 'error')
  })

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId || !detailsQuery.data) throw new Error('Select an application first.')

      return updateApplication(accessToken, selectedApplicationId, {
        requestedAmount: detailsQuery.data.requestedAmount,
        termMonths: detailsQuery.data.termMonths,
        purpose: detailsQuery.data.purpose,
        assignedToUserId: assignUserId || undefined
      })
    },
    onSuccess: async () => {
      toast.push('Application assignment saved.', 'success')
      await refreshSelected(queryClient, selectedApplicationId)
    },
    onError: () => toast.push('Assignment failed.', 'error')
  })

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId) throw new Error('Select an application first.')
      return createTask(accessToken, {
        applicationId: selectedApplicationId,
        title: taskTitle,
        assignedTo: taskAssignTo || undefined,
        dueDate: taskDueDate || undefined
      })
    },
    onSuccess: async () => {
      toast.push('Task created.', 'success')
      setTaskTitle('')
      setTaskDueDate('')
      setTaskAssignTo('')
      await queryClient.invalidateQueries({ queryKey: ['application-tasks', selectedApplicationId] })
    },
    onError: () => toast.push('Task creation failed.', 'error')
  })

  const completeTaskMutation = useMutation({
    mutationFn: (task: TaskItem) => completeTask(accessToken, task.id, 'Completed from UI.'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['application-tasks', selectedApplicationId] })
    },
    onError: () => toast.push('Could not complete task.', 'error')
  })

  const createNoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId) throw new Error('Select an application first.')
      return createNote(accessToken, selectedApplicationId, noteBody)
    },
    onSuccess: async () => {
      toast.push('Note added.', 'success')
      setNoteBody('')
      await queryClient.invalidateQueries({ queryKey: ['application-notes', selectedApplicationId] })
    },
    onError: () => toast.push('Could not add note.', 'error')
  })

  const infoRequestedMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApplicationId) throw new Error('Select an application first.')
      return changeStatus(accessToken, selectedApplicationId, 'InfoRequested', infoRequestNote)
    },
    onSuccess: async () => {
      toast.push('Info request submitted.', 'success')
      setInfoRequestNote('')
      await refreshSelected(queryClient, selectedApplicationId)
    },
    onError: () => toast.push('Could not request more info.', 'error')
  })

  const detail = detailsQuery.data

  return (
    <section className="stack">
      <PageHeader title="Applications" subtitle="Search and manage cases with a responsive list + tabbed detail workspace." />

      <div className="card">
        <div className="filters-row">
          <input
            aria-label="Search applications"
            placeholder="Search by application ID, client ID, or purpose"
            value={search}
            onChange={(event) => {
              const next = new URLSearchParams(params)
              next.set('q', event.target.value)
              setParams(next)
            }}
          />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => {
              const next = new URLSearchParams(params)
              next.set('status', event.target.value)
              setParams(next)
            }}
          >
            <option value="all">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {applicationsQuery.isLoading ? <ListSkeleton rows={8} /> : null}

        {!applicationsQuery.isLoading && !filteredApplications.length ? (
          <EmptyState title="No matching applications" message="Adjust filters or create a new draft application." />
        ) : null}
        {filteredApplications.length ? (
          <>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Assigned</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplications.map((app) => (
                    <tr key={app.id}>
                      <td>{app.id.slice(0, 8)}</td>
                      <td>{formatCurrency(app.requestedAmount)}</td>
                      <td><StatusBadge status={app.status} /></td>
                      <td>{app.assignedToUserId ?? 'Unassigned'}</td>
                      <td>{formatDateTime(app.submittedAt ?? app.createdAt)}</td>
                      <td>
                        <button className="link-btn" type="button" onClick={() => chooseApplication(params, setParams, app.id)}>
                          {resolvePrimaryAction(app.status, isInternal)}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-cards mobile-only">
              {filteredApplications.map((app) => (
                <button key={app.id} type="button" className="card card-button" onClick={() => chooseApplication(params, setParams, app.id)}>
                  <div className="list-row">
                    <p className="list-title">{app.id.slice(0, 8)}</p>
                    <StatusBadge status={app.status} />
                  </div>
                  <p>{formatCurrency(app.requestedAmount)}</p>
                  <small>{formatDateTime(app.submittedAt ?? app.createdAt)}</small>
                  <span className="link-quiet">{resolvePrimaryAction(app.status, isInternal)}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {!isInternal ? (
        <ClientWizard
          wizardStep={wizardStep}
          values={wizardValues}
          setValues={setWizardValues}
          onContinue={() => {
            if (wizardValues.businessName.trim().length < 2) {
              toast.push('Business name is required.', 'error')
              return
            }
            setWizardStep(2)
          }}
          onBack={() => setWizardStep(1)}
          onCreate={() => {
            const parsed = createApplicationSchema.safeParse(wizardValues)
            if (!parsed.success) {
              toast.push(parsed.error.issues[0].message, 'error')
              return
            }

            setWizardValues(parsed.data)
            createDraftMutation.mutate(parsed.data)
          }}
          onSubmit={() => selectedApplicationId ? submitMutation.mutate(selectedApplicationId) : null}
          creating={createDraftMutation.isPending}
          submitting={submitMutation.isPending}
          selectedApplicationId={selectedApplicationId}
        />
      ) : null}

      {detailsQuery.isLoading ? <DetailSkeleton /> : null}
      {detail ? (
        <ApplicationDetail
          application={detail}
          docs={docsQuery.data ?? []}
          history={historyQuery.data ?? []}
          tasks={tasksQuery.data ?? []}
          notes={notesQuery.data ?? []}
          tab={tab}
          setTab={setTab}
          isInternal={isInternal}
          docType={docType}
          setDocType={setDocType}
          setDocFile={setDocFile}
          uploadPending={uploadMutation.isPending}
          onUpload={() => uploadMutation.mutate()}
          statusTarget={statusTarget}
          setStatusTarget={setStatusTarget}
          statusNote={statusNote}
          setStatusNote={setStatusNote}
          onStatusChange={() => statusMutation.mutate()}
          statusPending={statusMutation.isPending}
          assignUserId={assignUserId}
          setAssignUserId={setAssignUserId}
          onAssign={() => assignMutation.mutate()}
          assignPending={assignMutation.isPending}
          infoRequestNote={infoRequestNote}
          setInfoRequestNote={setInfoRequestNote}
          onRequestInfo={() => infoRequestedMutation.mutate()}
          requestInfoPending={infoRequestedMutation.isPending}
          taskTitle={taskTitle}
          setTaskTitle={setTaskTitle}
          taskDueDate={taskDueDate}
          setTaskDueDate={setTaskDueDate}
          taskAssignTo={taskAssignTo}
          setTaskAssignTo={setTaskAssignTo}
          onCreateTask={() => createTaskMutation.mutate()}
          taskPending={createTaskMutation.isPending}
          onCompleteTask={(task) => completeTaskMutation.mutate(task)}
          completePending={completeTaskMutation.isPending}
          noteBody={noteBody}
          setNoteBody={setNoteBody}
          onCreateNote={() => createNoteMutation.mutate()}
          notePending={createNoteMutation.isPending}
          onSubmitApp={() => selectedApplicationId ? submitMutation.mutate(selectedApplicationId) : null}
          submitting={submitMutation.isPending}
        />
      ) : null}
    </section>
  )
}

async function refreshSelected(queryClient: ReturnType<typeof useQueryClient>, selectedApplicationId: string | null) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['applications'] }),
    queryClient.invalidateQueries({ queryKey: ['application-details', selectedApplicationId] }),
    queryClient.invalidateQueries({ queryKey: ['application-history', selectedApplicationId] }),
    queryClient.invalidateQueries({ queryKey: ['application-documents', selectedApplicationId] }),
    queryClient.invalidateQueries({ queryKey: ['application-tasks', selectedApplicationId] }),
    queryClient.invalidateQueries({ queryKey: ['application-notes', selectedApplicationId] })
  ])
}

function chooseApplication(params: URLSearchParams, setParams: (params: URLSearchParams) => void, appId: string) {
  const next = new URLSearchParams(params)
  next.set('app', appId)
  setParams(next)
}

function resolvePrimaryAction(status: LoanApplicationStatus, isInternal: boolean): string {
  if (!isInternal && (status === 'Draft' || status === 'InfoRequested')) return 'Continue'
  if (isInternal && (status === 'Submitted' || status === 'UnderReview')) return 'Review'
  return 'Open'
}

type ClientWizardProps = {
  wizardStep: number
  values: CreateApplicationFormData
  setValues: Dispatch<SetStateAction<CreateApplicationFormData>>
  onContinue: () => void
  onBack: () => void
  onCreate: () => void
  onSubmit: () => void
  creating: boolean
  submitting: boolean
  selectedApplicationId: string | null
}
function ClientWizard({
  wizardStep,
  values,
  setValues,
  onContinue,
  onBack,
  onCreate,
  onSubmit,
  creating,
  submitting,
  selectedApplicationId
}: ClientWizardProps) {
  return (
    <section className="card">
      <h2>Client Application Wizard</h2>
      <p>Step {wizardStep} of 3</p>

      {wizardStep === 1 ? (
        <div className="form-grid">
          <label>
            Business name
            <input value={values.businessName} onChange={(e) => setValues((prev) => ({ ...prev, businessName: e.target.value }))} />
          </label>
          <label>
            Registration no.
            <input value={values.registrationNo ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, registrationNo: e.target.value }))} />
          </label>
          <label>
            Address
            <input value={values.address ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, address: e.target.value }))} />
          </label>
          <button className="btn" type="button" onClick={onContinue}>Continue</button>
        </div>
      ) : null}

      {wizardStep === 2 ? (
        <div className="form-grid">
          <label>
            Requested amount
            <input type="number" value={values.requestedAmount} onChange={(e) => setValues((prev) => ({ ...prev, requestedAmount: Number(e.target.value) }))} />
          </label>
          <label>
            Term (months)
            <input type="number" value={values.termMonths} onChange={(e) => setValues((prev) => ({ ...prev, termMonths: Number(e.target.value) }))} />
          </label>
          <label>
            Purpose
            <input value={values.purpose} onChange={(e) => setValues((prev) => ({ ...prev, purpose: e.target.value }))} />
          </label>
          <div className="inline-actions">
            <button className="btn btn-secondary" type="button" onClick={onBack}>Back</button>
            <button className="btn" type="button" onClick={onCreate} disabled={creating}>{creating ? 'Creating...' : 'Create Draft'}</button>
          </div>
        </div>
      ) : null}

      {wizardStep === 3 ? (
        <div className="inline-actions">
          <p>Draft selected: {selectedApplicationId ?? '-'}</p>
          <button className="btn" type="button" disabled={!selectedApplicationId || submitting} onClick={onSubmit}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

type ApplicationDetailProps = {
  application: ApplicationDetails
  docs: ApplicationDocument[]
  history: StatusHistoryItem[]
  tasks: TaskItem[]
  notes: NoteItem[]
  tab: DetailTab
  setTab: (tab: DetailTab) => void
  isInternal: boolean
  docType: string
  setDocType: (value: string) => void
  setDocFile: (file: File | null) => void
  uploadPending: boolean
  onUpload: () => void
  statusTarget: LoanApplicationStatus
  setStatusTarget: (value: LoanApplicationStatus) => void
  statusNote: string
  setStatusNote: (value: string) => void
  onStatusChange: () => void
  statusPending: boolean
  assignUserId: string
  setAssignUserId: (value: string) => void
  onAssign: () => void
  assignPending: boolean
  infoRequestNote: string
  setInfoRequestNote: (value: string) => void
  onRequestInfo: () => void
  requestInfoPending: boolean
  taskTitle: string
  setTaskTitle: (value: string) => void
  taskDueDate: string
  setTaskDueDate: (value: string) => void
  taskAssignTo: string
  setTaskAssignTo: (value: string) => void
  onCreateTask: () => void
  taskPending: boolean
  onCompleteTask: (task: TaskItem) => void
  completePending: boolean
  noteBody: string
  setNoteBody: (value: string) => void
  onCreateNote: () => void
  notePending: boolean
  onSubmitApp: () => void
  submitting: boolean
}

function ApplicationDetail(props: ApplicationDetailProps) {
  const missingDocs = requiredDocumentTypes.filter((requiredDoc) => !props.docs.some((doc) => doc.docType === requiredDoc))

  return (
    <section className="grid-two">
      <article className="card">
        <PageHeader
          title={`Application ${props.application.id.slice(0, 8)}`}
          subtitle={`Amount ${formatCurrency(props.application.requestedAmount)}`}
          actions={<StatusBadge status={props.application.status} />}
        />

        <NextStepPanel
          status={props.application.status}
          missingDocs={missingDocs}
          onSubmitApp={props.onSubmitApp}
          onUploadTab={() => props.setTab('Documents')}
          submitting={props.submitting}
        />

        {props.isInternal ? (
          <div className="stack-sm">
            <h3>Internal Actions</h3>
            <label>
              Assign to user
              <input value={props.assignUserId} onChange={(e) => props.setAssignUserId(e.target.value)} placeholder="Assignee UUID" />
            </label>
            <button className="btn" type="button" onClick={props.onAssign} disabled={props.assignPending}>
              {props.assignPending ? 'Saving...' : 'Save Assignment'}
            </button>

            <label>
              Change status
              <select value={props.statusTarget} onChange={(e) => props.setStatusTarget(e.target.value as LoanApplicationStatus)}>
                {statuses.filter((status) => status !== 'Draft').map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Status note
              <input value={props.statusNote} onChange={(e) => props.setStatusNote(e.target.value)} placeholder="Optional note" />
            </label>
            <button className="btn" type="button" onClick={props.onStatusChange} disabled={props.statusPending}>
              {props.statusPending ? 'Updating...' : 'Update Status'}
            </button>

            <label>
              Request info
              <input value={props.infoRequestNote} onChange={(e) => props.setInfoRequestNote(e.target.value)} placeholder="What is missing?" />
            </label>
            <button className="btn btn-secondary" type="button" onClick={props.onRequestInfo} disabled={props.requestInfoPending || !props.infoRequestNote.trim()}>
              {props.requestInfoPending ? 'Requesting...' : 'Request More Info'}
            </button>
          </div>
        ) : null}
      </article>

      <article className="card">
        <div className="tabs-row">
          {(['Details', 'Documents', 'History', 'Tasks', 'Notes'] as DetailTab[]).map((name) => (
            <button key={name} type="button" className={props.tab === name ? 'tab tab-active' : 'tab'} onClick={() => props.setTab(name)}>
              {name}
            </button>
          ))}
        </div>

        {props.tab === 'Details' ? <DetailsTab application={props.application} /> : null}
        {props.tab === 'Documents' ? <DocumentsTab {...props} /> : null}
        {props.tab === 'History' ? <HistoryTab history={props.history} /> : null}
        {props.tab === 'Tasks' ? <TasksTab {...props} /> : null}
        {props.tab === 'Notes' ? <NotesTab {...props} /> : null}
      </article>
    </section>
  )
}

function DetailsTab({ application }: { application: ApplicationDetails }) {
  return (
    <dl className="detail-grid">
      <dt>Application ID</dt>
      <dd>{application.id}</dd>
      <dt>Client ID</dt>
      <dd>{application.clientId}</dd>
      <dt>Status</dt>
      <dd>{application.status}</dd>
      <dt>Created</dt>
      <dd>{formatDateTime(application.createdAt)}</dd>
      <dt>Submitted</dt>
      <dd>{formatDateTime(application.submittedAt)}</dd>
      <dt>Purpose</dt>
      <dd>{application.purpose}</dd>
      <dt>Assigned to</dt>
      <dd>{application.assignedToUserId ?? 'Unassigned'}</dd>
    </dl>
  )
}

function DocumentsTab(props: ApplicationDetailProps) {
  return (
    <div className="stack-sm">
      <h3>Document Checklist</h3>
      <ul className="list-clean">
        {requiredDocumentTypes.map((itemDocType) => {
          const found = props.docs.find((doc) => doc.docType === itemDocType)
          return (
            <li key={itemDocType} className="list-row">
              <span>{itemDocType}</span>
              {found ? <StatusBadge status={found.status} /> : <span className="status-badge status-alert">Missing</span>}
            </li>
          )
        })}
      </ul>

      <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault()
        const file = event.dataTransfer.files?.[0]
        props.setDocFile(file ?? null)
      }}>
        <p>Drag and drop file here, or choose file below.</p>
        <label>
          Document type
          <input value={props.docType} onChange={(e) => props.setDocType(e.target.value)} />
        </label>
        <input type="file" onChange={(e) => props.setDocFile(e.target.files?.[0] ?? null)} />
        <button className="btn" type="button" onClick={props.onUpload} disabled={props.uploadPending}>
          {props.uploadPending ? 'Uploading...' : 'Upload Document'}
        </button>
      </div>
      {props.docs.length ? (
        <ul className="list-clean">
          {props.docs.map((doc) => (
            <li key={doc.id} className="card list-card">
              <div className="list-row">
                <p className="list-title">{doc.docType}</p>
                <StatusBadge status={doc.status} />
              </div>
              <small>Uploaded {formatDateTime(doc.uploadedAt)} by {doc.uploadedBy}</small>
              <small>{doc.storagePath}</small>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No documents yet" message="Upload required files to move the application forward." />
      )}
    </div>
  )
}

function HistoryTab({ history }: { history: StatusHistoryItem[] }) {
  if (!history.length) return <EmptyState title="No status history" message="Status changes will appear here." />

  return (
    <ol className="timeline">
      {history.map((item) => (
        <li key={item.id}>
          <p><strong>{item.fromStatus ?? 'None'}</strong> to <strong>{item.toStatus}</strong></p>
          <small>{formatDateTime(item.changedAt)} by {item.changedBy}</small>
          {item.note ? <p>{item.note}</p> : null}
        </li>
      ))}
    </ol>
  )
}

function TasksTab(props: ApplicationDetailProps) {
  return (
    <div className="stack-sm">
      <div className="form-grid">
        <label>
          Task title
          <input value={props.taskTitle} onChange={(e) => props.setTaskTitle(e.target.value)} />
        </label>
        <label>
          Assign to
          <input value={props.taskAssignTo} onChange={(e) => props.setTaskAssignTo(e.target.value)} placeholder="Optional UUID" />
        </label>
        <label>
          Due date
          <input type="date" value={props.taskDueDate} onChange={(e) => props.setTaskDueDate(e.target.value)} />
        </label>
        <button className="btn" type="button" onClick={props.onCreateTask} disabled={props.taskPending || !props.taskTitle.trim()}>
          {props.taskPending ? 'Creating...' : 'Create Task'}
        </button>
      </div>

      {props.tasks.length ? (
        <ul className="list-clean">
          {props.tasks.map((task) => (
            <li key={task.id} className="list-row">
              <div>
                <p className="list-title">{task.title}</p>
                <small>{task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'} | {task.assignedTo ?? 'Unassigned'}</small>
              </div>
              {task.status !== 'Completed' ? (
                <button className="btn btn-secondary" type="button" onClick={() => props.onCompleteTask(task)} disabled={props.completePending}>
                  Complete
                </button>
              ) : (
                <StatusBadge status={task.status} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No tasks yet" message="Create your first follow-up task for this application." />
      )}
    </div>
  )
}

function NotesTab(props: ApplicationDetailProps) {
  return (
    <div className="stack-sm">
      <label>
        Add note
        <textarea rows={4} value={props.noteBody} onChange={(e) => props.setNoteBody(e.target.value)} />
      </label>
      <button className="btn" type="button" onClick={props.onCreateNote} disabled={props.notePending || !props.noteBody.trim()}>
        {props.notePending ? 'Saving...' : 'Add Note'}
      </button>

      {props.notes.length ? (
        <ul className="list-clean">
          {props.notes.map((note) => (
            <li key={note.id} className="card list-card">
              <small>{formatDateTime(note.createdAt)} by {note.createdBy}</small>
              <p>{note.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No notes" message="Capture context to support handover and review." />
      )}
    </div>
  )
}

function NextStepPanel({
  status,
  missingDocs,
  onSubmitApp,
  onUploadTab,
  submitting
}: {
  status: LoanApplicationStatus
  missingDocs: string[]
  onSubmitApp: () => void
  onUploadTab: () => void
  submitting: boolean
}) {
  let title = 'Next Step'
  let message = 'Continue reviewing this application.'

  if (missingDocs.length > 0) {
    title = 'Upload missing documents'
    message = `Required: ${missingDocs.join(', ')}`
  } else if (status === 'InfoRequested') {
    title = 'More information required'
    message = 'Respond to the information request and upload updates.'
  } else if (status === 'UnderReview') {
    title = 'Awaiting review'
    message = 'A reviewer will process the latest submission.'
  } else if (status === 'Approved') {
    title = 'Prepare disbursement'
    message = 'Loan can move to disbursement workflow.'
  }

  return (
    <section className="next-step">
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="inline-actions">
        <button className="btn btn-secondary" type="button" onClick={onUploadTab}>View Documents</button>
        {(status === 'Draft' || status === 'InfoRequested') ? (
          <button className="btn" type="button" onClick={onSubmitApp} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        ) : null}
      </div>
    </section>
  )
}
