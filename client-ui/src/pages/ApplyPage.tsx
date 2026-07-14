import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import type { ApplicationDocument, CreateApplicationInput, MeResponse } from '../lib/api'
import { useCalculator } from '../contexts/CalculatorContext'
import { useToast } from '../components/shared/ToastProvider'
import { CardSkeleton } from '../components/shared/Skeletons'
import { WizardProgress } from '../components/shared/WizardProgress'
import { FileDropzone } from '../components/shared/FileDropzone'
import { FieldError } from '../components/shared/FieldError'
import { LoanCalculator } from '../components/shared/LoanCalculator'
import { AddressFields, type AddressValue } from '../components/shared/AddressFields'
import { WizardCostCard } from '../components/shared/WizardCostCard'
import { formatRand, calculateMonthlyInstalment, calculateTotalInterest, calculateTotalRepayment, DEFAULT_RATE_LABEL } from '../lib/loanCalc'
import { LENDING_RATE_LABEL } from '../lib/loanLimits'
import {
  step1Schema,
  step2Schema,
  step3Schema,
  type Step1Data,
  type Step2Data,
  type Step3Data,
  type WizardFormState,
} from '../features/applications/validation'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createDocumentsUseCases } from '../logic/usecases/documents'
import { ConsentModal } from '../components/shared/ConsentModal'
import type { ConsentPayload } from '../features/consent/consentItems'

const STEPS = ['Business Profile', 'Financials', 'Loan Details', 'Documents', 'Review']

const INDUSTRIES = [
  'Retail', 'Manufacturing', 'Construction', 'Agriculture', 'Technology',
  'Healthcare', 'Education', 'Transport & Logistics', 'Hospitality', 'Other',
]

const SA_BANKS = [
  'Absa', 'African Bank', 'Bidvest Bank', 'Capitec Bank', 'Discovery Bank',
  'FNB (First National Bank)', 'Investec', 'Nedbank', 'Standard Bank',
  'TymeBank', 'Bank Zero', 'Other',
]

const LOAN_PURPOSES = [
  'Working Capital', 'Equipment Purchase', 'Expansion', 'Inventory',
  'Staff Hiring', 'Marketing', 'Renovations', 'Other',
]

// Step 4 document slots. `type` is the stored doc_type (matches admin/back office).
const DOC_SLOTS: { type: string; label: string; hint: string; multiple?: boolean; optional?: boolean }[] = [
  { type: 'IDDocument', label: 'ID Document *', hint: 'Certified copy of the director or applicant identity document' },
  { type: 'ProofOfAddress', label: 'Proof of Address *', hint: 'Recent proof of business or director address' },
  { type: 'BusinessRegistration', label: 'Company Registration (CIPC) *', hint: 'CIPC company registration certificate' },
  { type: 'TaxClearance', label: 'Tax Clearance *', hint: 'SARS tax clearance or tax compliance status document' },
  { type: 'BankStatement', label: 'Bank Statements (last 3 months) *', hint: 'Upload 3 months of business bank statements', multiple: true },
  { type: 'Financials', label: 'Financial Statements *', hint: 'Latest annual financials or management accounts' },
  { type: 'VendorQuotation', label: 'Vendor Quotations (3x)', hint: 'Three vendor quotations for the goods or services to be funded', multiple: true, optional: true },
  { type: 'RfqSupplierSpec', label: 'RFQ / Supplier Specification', hint: 'Request for quotation or supplier specification document', optional: true },
  { type: 'PurchaseOrder', label: 'Purchase Order', hint: 'The purchase order itself, including validity details', optional: true },
  { type: 'TradeReference', label: 'Trade Reference', hint: 'Reference from a business organisation or trade reference', optional: true },
]
const REQUIRED_DOC_TYPES = DOC_SLOTS.filter((s) => !s.optional).map((s) => s.type)

// Strip the "applications/<id>/<uuid>-" prefix to show the original filename.
function docFileName(storagePath: string): string {
  const last = storagePath.split('/').pop() ?? storagePath
  return last.replace(/^[0-9a-fA-F-]{36}-/, '')
}

function missingDocTypes(documents: ApplicationDocument[]): string[] {
  return REQUIRED_DOC_TYPES.filter((t) => !documents.some((d) => d.docType === t))
}

// Whether the wizard holds enough to be worth persisting as a draft — avoids
// creating junk draft rows for users who land on the wizard and leave.
function hasMeaningfulData(data: WizardFormState): boolean {
  const { step1: s1, step2: s2, step3: s3 } = data
  return Boolean(
    s1?.businessName?.trim() ||
      s1?.registrationNo?.trim() ||
      s1?.industry ||
      s1?.addressLine1?.trim() ||
      s1?.sarsTaxPin?.trim() ||
      (s2 && (s2.monthlyRevenue || s2.numberOfEmployees || s2.bankName)) ||
      s3?.purpose?.trim() ||
      s3?.loanPurposeCategory
  )
}


// ----------------------------------------------------------------
// Wizard state / reducer
// ----------------------------------------------------------------
type WizardState = {
  currentStep: number
  data: WizardFormState
}

type WizardAction =
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SET_STEP1'; payload: Step1Data }
  | { type: 'SET_STEP2'; payload: Step2Data }
  | { type: 'SET_STEP3'; payload: Step3Data }
  | { type: 'GOTO_STEP'; step: number }
  | { type: 'HYDRATE'; payload: { data: WizardFormState; currentStep: number } }

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'HYDRATE':
      return { currentStep: action.payload.currentStep, data: action.payload.data }
    case 'NEXT':
      return { ...state, currentStep: Math.min(state.currentStep + 1, 5) }
    case 'PREV':
      return { ...state, currentStep: Math.max(state.currentStep - 1, 1) }
    case 'SET_STEP1':
      return { ...state, data: { ...state.data, step1: action.payload } }
    case 'SET_STEP2':
      return { ...state, data: { ...state.data, step2: action.payload } }
    case 'SET_STEP3':
      return { ...state, data: { ...state.data, step3: action.payload } }
    case 'GOTO_STEP':
      return { ...state, currentStep: Math.max(1, Math.min(action.step, 5)) }
    default:
      return state
  }
}

// ----------------------------------------------------------------
// Main component
// ----------------------------------------------------------------
type ApplyPageProps = {
  session: Session
  me: MeResponse
}

export function ApplyPage({ session }: ApplyPageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const { amount, term, setCalculator } = useCalculator()

  const applicationsUseCases = useMemo(
    () => createApplicationsUseCases(session.access_token),
    [session.access_token]
  )
  const documentsUseCases = useMemo(
    () => createDocumentsUseCases(session.access_token),
    [session.access_token]
  )

  const [state, dispatch] = useReducer(wizardReducer, {
    currentStep: 1,
    data: {
      step1: null,
      step2: null,
      step3: { requestedAmount: amount, termMonths: term, purpose: '', loanPurposeCategory: '' },
      step4: null,
      step5: { termsAccepted: false },
    },
  })

  const monthly = calculateMonthlyInstalment(amount, term)
  const total = calculateTotalRepayment(amount, term)
  const fees = calculateTotalInterest(amount, term)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)

  // ---- Draft persistence (save & resume) ----
  const draftParam = searchParams.get('draft')
  const [draftId, setDraftId] = useState<string | null>(draftParam)
  const [hydrating, setHydrating] = useState(true)
  const [savingDraft, setSavingDraft] = useState(false)
  const [savedTick, setSavedTick] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // Serialize saves so rapid autosaves never race the "one active draft" index:
  // each save waits for the previous and reuses the id it established.
  const draftIdRef = useRef<string | null>(draftParam)
  const saveChain = useRef<Promise<string | null>>(Promise.resolve(draftParam))
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persisted documents for the current draft (uploaded as they're added).
  const documentsQuery = useQuery({
    queryKey: ['draft-documents', draftId],
    queryFn: () => documentsUseCases.getDocuments(draftId as string),
    enabled: Boolean(draftId),
  })
  const documents = documentsQuery.data ?? []

  // On mount, resume from an explicit ?draft=<id> or the client's single open draft.
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        let id = draftParam
        if (!id) {
          const mine = await applicationsUseCases.getMyDraft()
          id = mine?.id ?? null
        }
        if (!id) return
        const detail = await applicationsUseCases.getApplication(id)
        if (cancelled) return
        const ds = (detail.draftState ?? {}) as Partial<WizardFormState> & { currentStep?: number }
        const step3 = (ds.step3 as Step3Data | undefined) ?? {
          requestedAmount: detail.requestedAmount,
          termMonths: detail.termMonths,
          purpose: '',
          loanPurposeCategory: '',
        }
        const data: WizardFormState = {
          step1: (ds.step1 as Step1Data) ?? null,
          step2: (ds.step2 as Step2Data) ?? null,
          step3,
          step4: null, // documents are re-collected on resume (Phase 1)
          step5: { termsAccepted: false },
        }
        const savedStep = ds.currentStep ?? detail.currentStep ?? 1
        const resumeStep = Math.min(Math.max(savedStep, 1), 5)
        setCalculator(step3.requestedAmount ?? amount, step3.termMonths ?? term)
        dispatch({ type: 'HYDRATE', payload: { data, currentStep: resumeStep } })
        draftIdRef.current = id
        setDraftId(id)
        saveChain.current = Promise.resolve(id)
        if (draftParam !== id) {
          const next = new URLSearchParams(searchParams)
          next.set('draft', id)
          setSearchParams(next, { replace: true })
        }
      } catch {
        // Fall back to a blank wizard.
      } finally {
        if (!cancelled) setHydrating(false)
      }
    }
    void init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildDraftPayload(data: WizardFormState, currentStep: number): CreateApplicationInput {
    const s1 = data.step1
    const s2 = data.step2
    const s3 = data.step3
    return {
      requestedAmount: s3?.requestedAmount ?? amount,
      termMonths: s3?.termMonths ?? term,
      purpose: s3 && (s3.loanPurposeCategory || s3.purpose) ? `${s3.loanPurposeCategory}: ${s3.purpose}` : '',
      businessName: s1?.businessName,
      registrationNo: s1?.registrationNo,
      address: s1
        ? [s1.addressLine1, s1.addressLine2, s1.city, s1.province, s1.country].filter(Boolean).join(', ')
        : undefined,
      province: s1?.province,
      spatialType: s1?.spatialType,
      industry: s1?.industry,
      gender: s1?.gender,
      isDisabled: s1?.isDisabled,
      isHdp: s1?.isHdp,
      isRural: s1?.isRural,
      isBlackWomenOwned: s1?.isBlackWomenOwned,
      saCitizenshipPercentage: s1?.saCitizenshipPercentage,
      isDirectorOperational: s1?.isDirectorOperational,
      cipcRegistered: s1?.cipcRegistered,
      sarsTaxPin: s1?.sarsTaxPin,
      insolventOrDebtReview: s1?.insolventOrDebtReview,
      monthlyRevenue: s2?.monthlyRevenue,
      yearsInOperation: s2?.yearsInOperation,
      numberOfEmployees: s2?.numberOfEmployees,
      bankName: s2?.bankName,
      currentStep,
      draftState: { step1: s1, step2: s2, step3: s3, currentStep },
    }
  }

  async function saveProgress(
    data: WizardFormState,
    currentStep: number,
    opts: { exit?: boolean; silent?: boolean } = {}
  ): Promise<string | null> {
    // Don't create a junk draft when nothing meaningful has been entered yet.
    if (!draftIdRef.current && !hasMeaningfulData(data) && !documents.length) {
      if (!opts.silent) toast.push('Add a few details before saving.', 'info')
      return null
    }
    setSavingDraft(true)
    // Chain onto the previous save so concurrent autosaves run one-at-a-time and
    // the second reuses the id the first established (no duplicate-draft race).
    const run = saveChain.current.then(async () => {
      try {
        const saved = await applicationsUseCases.saveDraft(draftIdRef.current, buildDraftPayload(data, currentStep))
        if (saved.id !== draftIdRef.current) {
          draftIdRef.current = saved.id
          setDraftId(saved.id)
          const next = new URLSearchParams(searchParams)
          next.set('draft', saved.id)
          setSearchParams(next, { replace: true })
        }
        setSavedTick(true)
        if (opts.exit) {
          toast.push('Draft saved — resume any time from your dashboard.', 'success')
          queryClient.invalidateQueries({ queryKey: ['home-applications'] })
          queryClient.invalidateQueries({ queryKey: ['status-applications'] })
          queryClient.invalidateQueries({ queryKey: ['progress-applications'] })
          navigate('/status')
        } else if (!opts.silent) {
          toast.push('Progress saved.', 'info')
        }
        return saved.id
      } catch (err) {
        // Autosaves fail quietly; only surface errors for explicit saves.
        if (!opts.silent) {
          toast.push(err instanceof Error ? err.message : 'Could not save your draft.', 'error')
        } else {
          console.warn('Draft autosave failed:', err)
        }
        return draftIdRef.current
      }
    })
    saveChain.current = run.catch(() => draftIdRef.current)
    const result = await run
    setSavingDraft(false)
    return result
  }

  // "Save & finish later" from a step: merge that step's current values, persist,
  // and leave for the dashboard.
  function saveAndExitFromStep(stepNum: number, stepData?: Step1Data | Step2Data | Step3Data) {
    const merged: WizardFormState = { ...state.data }
    if (stepNum === 1 && stepData) merged.step1 = stepData as Step1Data
    else if (stepNum === 2 && stepData) merged.step2 = stepData as Step2Data
    else if (stepNum === 3 && stepData) merged.step3 = stepData as Step3Data
    void saveProgress(merged, stepNum, { exit: true })
  }

  // Documents are uploaded straight onto the draft, so ensure one exists first.
  async function ensureDraft(): Promise<string | null> {
    return draftIdRef.current ?? (await saveProgress(state.data, state.currentStep, { silent: true }))
  }

  async function handleUploadDoc(docType: string, file: File) {
    setDocBusy(true)
    try {
      const id = await ensureDraft()
      if (!id) throw new Error('Could not start your draft — please try again.')
      await documentsUseCases.uploadDocumentFlow(id, docType, file)
      await queryClient.invalidateQueries({ queryKey: ['draft-documents', id] })
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Upload failed.', 'error')
    } finally {
      setDocBusy(false)
    }
  }

  async function handleRemoveDoc(doc: ApplicationDocument) {
    setDocBusy(true)
    try {
      await documentsUseCases.deleteDocument(doc.applicationId, doc.id, doc.storagePath)
      await queryClient.invalidateQueries({ queryKey: ['draft-documents', doc.applicationId] })
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not remove the document.', 'error')
    } finally {
      setDocBusy(false)
    }
  }

  async function handleViewDoc(doc: ApplicationDocument) {
    try {
      const url = await documentsUseCases.createSignedUrl(doc.storagePath)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not open the document.', 'error')
    }
  }

  // Debounced field-level autosave: persist ~1.4s after the user stops editing.
  function scheduleAutosave(stepNum: number, snapshot: Step1Data | Step2Data | Step3Data) {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    const merged: WizardFormState = { ...state.data }
    if (stepNum === 1) merged.step1 = snapshot as Step1Data
    else if (stepNum === 2) merged.step2 = snapshot as Step2Data
    else if (stepNum === 3) merged.step3 = snapshot as Step3Data
    setSavedTick(false)
    autosaveTimer.current = setTimeout(() => {
      void saveProgress(merged, stepNum, { silent: true })
    }, 1400)
  }

  // Clear any pending autosave on unmount.
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])

  async function discardDraft() {
    const id = draftIdRef.current
    if (!id) {
      navigate('/status')
      return
    }
    if (!window.confirm('Discard this draft application? This cannot be undone.')) return
    setDiscarding(true)
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      await saveChain.current.catch(() => null)
      // Remove uploaded files (storage + rows) before deleting the draft row.
      for (const doc of documents) {
        await documentsUseCases.deleteDocument(doc.applicationId, doc.id, doc.storagePath).catch(() => {})
      }
      await applicationsUseCases.deleteApplication(id)
      draftIdRef.current = null
      queryClient.invalidateQueries({ queryKey: ['home-applications'] })
      queryClient.invalidateQueries({ queryKey: ['status-applications'] })
      queryClient.invalidateQueries({ queryKey: ['progress-applications'] })
      toast.push('Draft discarded.', 'info')
      navigate('/status')
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not discard the draft.', 'error')
      setDiscarding(false)
    }
  }

  async function handleFinalSubmit(consent: ConsentPayload) {
    const { step1, step2, step3 } = state.data

    if (!step1 || !step2 || !step3) {
      setConsentOpen(false)
      setSubmitError('Please complete all steps before submitting.')
      return
    }

    // Documents are already uploaded onto the draft; just confirm the set is complete.
    if (missingDocTypes(documents).length) {
      setConsentOpen(false)
      setSubmitError('Please upload all required documents before submitting.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      // Persist the latest wizard data onto the client's draft (create if the user
      // never explicitly saved), then attach consent — resuming a draft submits the
      // same row rather than creating a duplicate. Let any in-flight autosave settle
      // first so we submit the same row it created.
      await saveChain.current.catch(() => null)
      const saved = await applicationsUseCases.saveDraft(
        draftIdRef.current,
        buildDraftPayload({ ...state.data, step1, step2, step3 }, 5)
      )
      const appId = saved.id
      draftIdRef.current = appId
      setDraftId(appId)

      await applicationsUseCases.recordConsent(appId, consent)
      await applicationsUseCases.submitApplication(appId)

      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['home-applications'] })
      queryClient.invalidateQueries({ queryKey: ['status-applications'] })

      navigate('/status')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
      setSubmitting(false)
      setConsentOpen(false)
    }
  }

  if (hydrating) {
    return (
      <main className="auth-wrap">
        <div className="auth-card">
          <CardSkeleton />
        </div>
      </main>
    )
  }

  return (
    <div className="wizard-shell">
      <div className="wizard-header">
        <div className="wizard-header-top">
          <div>
            <h1>Apply for Funding</h1>
            <p>Step {state.currentStep} of {STEPS.length} - {STEPS[state.currentStep - 1]}</p>
          </div>
          <div className="wizard-header-meta">
            {savingDraft ? (
              <span className="save-status">Saving…</span>
            ) : savedTick ? (
              <span className="save-status save-status--ok">✓ All changes saved</span>
            ) : null}
            {draftId ? (
              <button type="button" className="link-btn save-discard" onClick={discardDraft} disabled={discarding}>
                {discarding ? 'Discarding…' : 'Discard draft'}
              </button>
            ) : null}
          </div>
        </div>
        <WizardProgress steps={STEPS} currentStep={state.currentStep} />
      </div>

      <div className="wizard-content">
        <div className="wizard-form-col">
          {state.currentStep === 1 && (
            <Step1
              initial={state.data.step1}
              savingDraft={savingDraft}
              onSaveDraft={(data) => saveAndExitFromStep(1, data)}
              onAutosave={(data) => scheduleAutosave(1, data)}
              onNext={(data) => {
                dispatch({ type: 'SET_STEP1', payload: data })
                dispatch({ type: 'NEXT' })
                void saveProgress({ ...state.data, step1: data }, 2, { silent: true })
              }}
            />
          )}
          {state.currentStep === 2 && (
            <Step2
              initial={state.data.step2}
              savingDraft={savingDraft}
              onSaveDraft={(data) => saveAndExitFromStep(2, data)}
              onAutosave={(data) => scheduleAutosave(2, data)}
              onNext={(data) => {
                dispatch({ type: 'SET_STEP2', payload: data })
                dispatch({ type: 'NEXT' })
                void saveProgress({ ...state.data, step2: data }, 3, { silent: true })
              }}
              onBack={() => dispatch({ type: 'PREV' })}
            />
          )}
          {state.currentStep === 3 && (
            <Step3
              initial={state.data.step3}
              savingDraft={savingDraft}
              onSaveDraft={(data) => saveAndExitFromStep(3, data)}
              onAutosave={(data) => scheduleAutosave(3, data)}
              onNext={(data) => {
                dispatch({ type: 'SET_STEP3', payload: data })
                dispatch({ type: 'NEXT' })
                void saveProgress({ ...state.data, step3: data }, 4, { silent: true })
              }}
              onBack={() => dispatch({ type: 'PREV' })}
            />
          )}
          {state.currentStep === 4 && (
            <Step4
              documents={documents}
              uploading={docBusy}
              onUpload={handleUploadDoc}
              onRemove={handleRemoveDoc}
              onView={handleViewDoc}
              savingDraft={savingDraft}
              onSaveDraft={() => void saveProgress(state.data, 4, { exit: true })}
              onNext={() => {
                dispatch({ type: 'NEXT' })
                void saveProgress(state.data, 5, { silent: true })
              }}
              onBack={() => dispatch({ type: 'PREV' })}
            />
          )}
          {state.currentStep === 5 && (
            <Step5
              data={state.data}
              documents={documents}
              submitting={submitting}
              submitError={submitError}
              onBack={() => dispatch({ type: 'PREV' })}
              onOpenConsent={() => {
                setSubmitError(null)
                setConsentOpen(true)
              }}
            />
          )}
        </div>

        <WizardCostCard
          amount={amount}
          term={term}
          monthly={monthly}
          total={total}
          fees={fees}
          onEdit={() => dispatch({ type: 'GOTO_STEP', step: 3 })}
        />
      </div>

      <ConsentModal
        open={consentOpen}
        submitting={submitting}
        onClose={() => {
          if (!submitting) setConsentOpen(false)
        }}
        onProceed={handleFinalSubmit}
      />
    </div>
  )
}

// ----------------------------------------------------------------
// Step 1 — Business Profile
// ----------------------------------------------------------------
function SaveDraftButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button type="button" className="btn btn-ghost" onClick={onClick} disabled={saving}>
      {saving ? 'Saving…' : 'Save & finish later'}
    </button>
  )
}

function Step1({
  initial,
  onNext,
  onSaveDraft,
  onAutosave,
  savingDraft,
}: {
  initial: Step1Data | null
  onNext: (d: Step1Data) => void
  onSaveDraft: (d: Step1Data) => void
  onAutosave: (d: Step1Data) => void
  savingDraft: boolean
}) {
  const [form, setForm] = useState({
    businessName: initial?.businessName ?? '',
    registrationNo: initial?.registrationNo ?? '',
    industry: initial?.industry ?? '',
    gender: initial?.gender ?? 'Prefer not to say',
    spatialType: initial?.spatialType ?? '',
    isDisabled: initial?.isDisabled ?? false,
    isHdp: initial?.isHdp ?? false,
    isRural: initial?.isRural ?? false,
    isBlackWomenOwned: initial?.isBlackWomenOwned ?? false,
    saCitizenshipPercentage: initial?.saCitizenshipPercentage?.toString() ?? '',
    isDirectorOperational: initial?.isDirectorOperational ?? false,
    cipcRegistered: initial?.cipcRegistered ?? false,
    sarsTaxPin: initial?.sarsTaxPin ?? '',
    insolventOrDebtReview: initial?.insolventOrDebtReview ?? false,
    address: {
      addressLine1: initial?.addressLine1 ?? '',
      addressLine2: initial?.addressLine2 ?? '',
      city: initial?.city ?? '',
      province: initial?.province ?? '',
      country: initial?.country ?? 'South Africa',
    } satisfies AddressValue,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof Step1Data, string>>>({})

  function buildFlat(): Step1Data {
    return {
      businessName: form.businessName,
      registrationNo: form.registrationNo,
      industry: form.industry,
      addressLine1: form.address.addressLine1,
      addressLine2: form.address.addressLine2,
      city: form.address.city,
      province: form.address.province,
      country: form.address.country,
      gender: form.gender as Step1Data['gender'],
      spatialType: form.spatialType as Step1Data['spatialType'],
      // Keep the legacy is_rural flag in sync with the spatial classification.
      isRural: form.spatialType === 'Rural',
      isDisabled: form.isDisabled,
      isHdp: form.isHdp,
      isBlackWomenOwned: form.isBlackWomenOwned,
      saCitizenshipPercentage: Number(form.saCitizenshipPercentage || 0),
      isDirectorOperational: form.isDirectorOperational,
      cipcRegistered: form.cipcRegistered,
      sarsTaxPin: form.sarsTaxPin,
      insolventOrDebtReview: form.insolventOrDebtReview
    }
  }

  // Debounced autosave on any edit (skips the initial hydrate render).
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onAutosave(buildFlat())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  function handleNext() {
    const result = step1Schema.safeParse(buildFlat())
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof Step1Data, string>> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Step1Data
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    onNext(result.data)
  }

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))
  }

  return (
    <div className="wizard-body">
      <h2>Business & Compliance Profile</h2>
      <p>Tell us about your business and ensure you meet our eligibility criteria.</p>

      <div className="stack">
        <h3 style={{ fontSize: '1rem', marginTop: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Basic Details</h3>
        <div className="form-two-col">
          <div className="form-field">
            <label htmlFor="businessName">Business name</label>
            <input
              id="businessName"
              value={form.businessName}
              onChange={set('businessName')}
              placeholder="Acme Enterprises (Pty) Ltd"
            />
            <FieldError message={errors.businessName} />
          </div>
          <div className="form-field">
            <label htmlFor="industry">Industry</label>
            <select id="industry" value={form.industry} onChange={set('industry')}>
              <option value="">Select your industry…</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <FieldError message={errors.industry} />
          </div>
        </div>

        <AddressFields
          value={form.address}
          onChange={(addr) => setForm((p) => ({ ...p, address: addr }))}
          errors={{
            addressLine1: errors.addressLine1,
            city: errors.city,
            province: errors.province,
            country: errors.country,
          }}
        />

        <h3 style={{ fontSize: '1rem', marginTop: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Demographics</h3>
        <div className="form-two-col">
          <div className="form-field">
            <label htmlFor="gender">Primary Director Gender</label>
            <select id="gender" value={form.gender} onChange={set('gender')}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
            <FieldError message={errors.gender} />
          </div>
          <div className="form-field">
            <label htmlFor="saCitizenshipPercentage">% SA National Ownership</label>
            <input type="number" min="0" max="100" id="saCitizenshipPercentage" value={form.saCitizenshipPercentage} onChange={set('saCitizenshipPercentage')} placeholder="100" />
            <FieldError message={errors.saCitizenshipPercentage} />
          </div>
          <div className="form-field">
            <label htmlFor="spatialType">Where does the business operate?</label>
            <select id="spatialType" value={form.spatialType} onChange={set('spatialType')}>
              <option value="">Select location type…</option>
              <option value="Rural">Rural</option>
              <option value="Township">Township</option>
              <option value="City">City / Urban</option>
            </select>
            <FieldError message={errors.spatialType} />
          </div>
        </div>

        <div className="form-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <label className="terms-check"><input type="checkbox" checked={form.isBlackWomenOwned} onChange={set('isBlackWomenOwned')} /> {'>'}50.1% Black Women Owned</label>
          <label className="terms-check"><input type="checkbox" checked={form.isHdp} onChange={set('isHdp')} /> Historically Disadvantaged Person (HDP)</label>
          <label className="terms-check"><input type="checkbox" checked={form.isDisabled} onChange={set('isDisabled')} /> Disabled Persons / Ownership</label>
        </div>

        <h3 style={{ fontSize: '1rem', marginTop: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Compliance & Registration</h3>
        <div className="form-two-col">
          <div className="form-field">
            <label htmlFor="registrationNo">CIPC Registration Number</label>
            <input
              id="registrationNo"
              value={form.registrationNo}
              onChange={set('registrationNo')}
              placeholder="2021/123456/07"
            />
            <FieldError message={errors.registrationNo} />
          </div>
          <div className="form-field">
            <label htmlFor="sarsTaxPin">SARS Tax Pin</label>
            <input
              id="sarsTaxPin"
              value={form.sarsTaxPin}
              onChange={set('sarsTaxPin')}
              placeholder="1234567890"
            />
            <FieldError message={errors.sarsTaxPin} />
          </div>
        </div>

        <div className="form-field" style={{ display: 'grid', gap: '0.5rem' }}>
          <label className="terms-check"><input type="checkbox" checked={form.cipcRegistered} onChange={set('cipcRegistered')} /> Registered with CIPC</label>
          <label className="terms-check"><input type="checkbox" checked={form.isDirectorOperational} onChange={set('isDirectorOperational')} /> Directors are 100% Operational in the business</label>
          <label className="terms-check"><input type="checkbox" checked={form.insolventOrDebtReview} onChange={set('insolventOrDebtReview')} /> Directors are un-rehabilitated insolvents or under debt review</label>
        </div>
      </div>

      <div className="wizard-nav">
        <SaveDraftButton onClick={() => onSaveDraft(buildFlat())} saving={savingDraft} />
        <button type="button" className="btn btn-primary" onClick={handleNext}>
          Continue →
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Step 2 — Financial Info
// ----------------------------------------------------------------
function Step2({
  initial,
  onNext,
  onBack,
  onSaveDraft,
  onAutosave,
  savingDraft,
}: {
  initial: Step2Data | null
  onNext: (d: Step2Data) => void
  onBack: () => void
  onSaveDraft: (d: Step2Data) => void
  onAutosave: (d: Step2Data) => void
  savingDraft: boolean
}) {
  const [form, setForm] = useState({
    monthlyRevenue: initial?.monthlyRevenue?.toString() ?? '',
    yearsInOperation: initial?.yearsInOperation?.toString() ?? '',
    numberOfEmployees: initial?.numberOfEmployees?.toString() ?? '',
    bankName: initial?.bankName ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof Step2Data, string>>>({})

  function buildSnapshot(): Step2Data {
    return {
      monthlyRevenue: Number(form.monthlyRevenue) || 0,
      yearsInOperation: Number(form.yearsInOperation) || 0,
      numberOfEmployees: Number(form.numberOfEmployees) || 0,
      bankName: form.bankName,
    }
  }

  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onAutosave(buildSnapshot())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  function handleNext() {
    const result = step2Schema.safeParse(form)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof Step2Data, string>> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Step2Data
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    onNext(result.data)
  }

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  return (
    <div className="wizard-body">
      <h2>Financial Information</h2>
      <p>Help us understand the financial health of your business.</p>

      <div className="stack">
        <div className="form-two-col">
          <div className="form-field">
            <label htmlFor="monthlyRevenue">Average monthly revenue (R)</label>
            <input id="monthlyRevenue" type="number" min={0} value={form.monthlyRevenue} onChange={set('monthlyRevenue')} placeholder="150000" />
            <FieldError message={errors.monthlyRevenue} />
          </div>
          <div className="form-field">
            <label htmlFor="yearsInOperation">Years in operation</label>
            <input id="yearsInOperation" type="number" min={0} value={form.yearsInOperation} onChange={set('yearsInOperation')} placeholder="3" />
            <FieldError message={errors.yearsInOperation} />
          </div>
        </div>

        <div className="form-two-col">
          <div className="form-field">
            <label htmlFor="numberOfEmployees">Number of employees</label>
            <input id="numberOfEmployees" type="number" min={1} value={form.numberOfEmployees} onChange={set('numberOfEmployees')} placeholder="12" />
            <FieldError message={errors.numberOfEmployees} />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="bankName">Business bank</label>
          <select id="bankName" value={form.bankName} onChange={set('bankName')}>
            <option value="">Select your bank…</option>
            {SA_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <FieldError message={errors.bankName} />
        </div>
      </div>

      <div className="wizard-nav">
        <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button>
        <SaveDraftButton onClick={() => onSaveDraft(buildSnapshot())} saving={savingDraft} />
        <button type="button" className="btn btn-primary" onClick={handleNext}>Continue →</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Step 3 — Loan Details
// ----------------------------------------------------------------
function Step3({
  initial,
  onNext,
  onBack,
  onSaveDraft,
  onAutosave,
  savingDraft,
}: {
  initial: Step3Data | null
  onNext: (d: Step3Data) => void
  onBack: () => void
  onSaveDraft: (d: Step3Data) => void
  onAutosave: (d: Step3Data) => void
  savingDraft: boolean
}) {
  const { setCalculator } = useCalculator()
  const [purpose, setPurpose] = useState(initial?.purpose ?? '')
  const [loanPurposeCategory, setLoanPurposeCategory] = useState(initial?.loanPurposeCategory ?? '')
  const [errors, setErrors] = useState<Partial<Record<keyof Step3Data, string>>>({})

  // Keep in sync with calculator context — slider changes go through context
  const { amount, term } = useCalculator()

  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onAutosave({ requestedAmount: amount, termMonths: term, purpose, loanPurposeCategory })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, loanPurposeCategory, amount, term])

  function handleAmountChange(v: number) { setCalculator(v, term) }
  function handleTermChange(v: number) { setCalculator(amount, v) }

  function handleNext() {
    const result = step3Schema.safeParse({ requestedAmount: amount, termMonths: term, purpose, loanPurposeCategory })
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof Step3Data, string>> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Step3Data
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    onNext(result.data)
  }

  return (
    <div className="wizard-body">
      <h2>Loan Details</h2>
      <p>Adjust the sliders to set your preferred loan amount and repayment term. Lending rate: {LENDING_RATE_LABEL}.</p>

      <LoanCalculator
        compact
        showApplyButton={false}
        onAmountChange={handleAmountChange}
        onTermChange={handleTermChange}
      />

      <div className="stack" style={{ marginTop: '1.5rem' }}>
        <div className="form-field">
          <label htmlFor="loanPurposeCategory">Loan purpose category</label>
          <select id="loanPurposeCategory" value={loanPurposeCategory} onChange={(e) => setLoanPurposeCategory(e.target.value)}>
            <option value="">Select a category…</option>
            {LOAN_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <FieldError message={errors.loanPurposeCategory} />
        </div>

        <div className="form-field">
          <label htmlFor="purpose">Tell us more about how you'll use the funds</label>
          <textarea
            id="purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={3}
            placeholder="e.g. Purchase two new delivery vehicles to expand our logistics capacity…"
            style={{ resize: 'vertical', borderRadius: '12px', width: '100%' }}
          />
          <FieldError message={errors.purpose} />
        </div>
      </div>

      <div className="wizard-nav">
        <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button>
        <SaveDraftButton
          onClick={() => onSaveDraft({ requestedAmount: amount, termMonths: term, purpose, loanPurposeCategory })}
          saving={savingDraft}
        />
        <button type="button" className="btn btn-primary" onClick={handleNext}>Continue →</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Step 4 — Documents
// ----------------------------------------------------------------
function Step4({
  documents,
  uploading,
  onUpload,
  onRemove,
  onView,
  onNext,
  onBack,
  onSaveDraft,
  savingDraft,
}: {
  documents: ApplicationDocument[]
  uploading: boolean
  onUpload: (docType: string, file: File) => void
  onRemove: (doc: ApplicationDocument) => void
  onView: (doc: ApplicationDocument) => void
  onNext: () => void
  onBack: () => void
  onSaveDraft: () => void
  savingDraft: boolean
}) {
  const [error, setError] = useState<string | null>(null)

  function handleNext() {
    if (missingDocTypes(documents).length) {
      setError('Please upload all required documents before continuing.')
      return
    }
    setError(null)
    onNext()
  }

  return (
    <div className="wizard-body">
      <h2>Documents</h2>
      <p>
        Upload all required documents. Supporting procurement documents (quotations, RFQ, purchase order, trade
        reference) are optional but help speed up review. Accepted formats: PDF, JPG, PNG. Files are saved to your
        draft as you add them.
      </p>

      <div className="document-upload-grid">
        {DOC_SLOTS.map((slot) => {
          const existing = documents.filter((d) => d.docType === slot.type)
          return (
            <div key={slot.type} className="doc-slot">
              <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {slot.label}
                {slot.optional ? <span className="muted-text" style={{ fontWeight: 400 }}> (optional)</span> : null}
              </label>
              {existing.map((doc) => (
                <div key={doc.id} className="doc-uploaded-row">
                  <span className="doc-uploaded-name">✓ {docFileName(doc.storagePath)}</span>
                  <span className="doc-uploaded-actions">
                    <button type="button" className="link-btn" onClick={() => onView(doc)}>View</button>
                    <button type="button" className="link-btn" onClick={() => onRemove(doc)} disabled={uploading}>Remove</button>
                  </span>
                </div>
              ))}
              {(slot.multiple || existing.length === 0) && (
                <FileDropzone
                  label={existing.length ? 'Add another file' : ''}
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple={slot.multiple}
                  files={[]}
                  onFilesChange={(files) => files.forEach((f) => onUpload(slot.type, f))}
                  hint={slot.hint}
                />
              )}
            </div>
          )
        })}
      </div>

      {error ? <p className="text-error" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p> : null}
      {uploading ? <p className="muted-text" style={{ fontSize: '0.85rem' }}>Uploading…</p> : null}

      <div className="wizard-nav">
        <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button>
        <SaveDraftButton onClick={onSaveDraft} saving={savingDraft} />
        <button type="button" className="btn btn-primary" onClick={handleNext}>Review Application →</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Step 5 — Review & Submit
// ----------------------------------------------------------------
function Step5({
  data,
  documents,
  submitting,
  submitError,
  onBack,
  onOpenConsent,
}: {
  data: WizardFormState
  documents: ApplicationDocument[]
  submitting: boolean
  submitError: string | null
  onBack: () => void
  onOpenConsent: () => void
}) {
  const { step1, step2, step3 } = data
  const amount = step3?.requestedAmount ?? 0
  const term = step3?.termMonths ?? 0
  const monthly = calculateMonthlyInstalment(amount, term)
  const total = calculateTotalRepayment(amount, term)
  const fees = calculateTotalInterest(amount, term)
  const missingDocuments = missingDocTypes(documents)

  return (
    <div className="wizard-body">
      <h2>Review Your Application</h2>
      <p>Please review all details carefully before submitting.</p>

      <div className="review-grid">
        {step1 && (
          <div className="review-section">
            <h3>Business Profile</h3>
            <dl className="review-dl">
              <div className="review-row"><dt>Business name</dt><dd>{step1.businessName}</dd></div>
              <div className="review-row"><dt>Reg. number</dt><dd>{step1.registrationNo}</dd></div>
              <div className="review-row"><dt>Industry</dt><dd>{step1.industry}</dd></div>
              <div className="review-row"><dt>Province</dt><dd>{step1.province}</dd></div>
              <div className="review-row"><dt>Location type</dt><dd>{step1.spatialType}</dd></div>
            </dl>
          </div>
        )}

        {step2 && (
          <div className="review-section">
            <h3>Financial Info</h3>
            <dl className="review-dl">
              <div className="review-row"><dt>Monthly revenue</dt><dd>{formatRand(step2.monthlyRevenue)}</dd></div>
              <div className="review-row"><dt>Years operating</dt><dd>{step2.yearsInOperation}</dd></div>
              <div className="review-row"><dt>Employees</dt><dd>{step2.numberOfEmployees}</dd></div>
              <div className="review-row"><dt>Bank</dt><dd>{step2.bankName}</dd></div>
            </dl>
          </div>
        )}

        {step3 && (
          <div className="review-section">
            <h3>Loan Details</h3>
            <dl className="review-dl">
              <div className="review-row"><dt>Amount</dt><dd>{formatRand(amount)}</dd></div>
              <div className="review-row"><dt>Term</dt><dd>{term} months</dd></div>
              <div className="review-row"><dt>Category</dt><dd>{step3.loanPurposeCategory}</dd></div>
            </dl>
          </div>
        )}

        <div className="review-section">
          <h3>Documents</h3>
          <dl className="review-dl">
            {DOC_SLOTS.map((slot) => {
              const files = documents.filter((d) => d.docType === slot.type)
              const label = slot.label.replace(' *', '')
              return (
                <div key={slot.type} className="review-row">
                  <dt>{label}</dt>
                  <dd>
                    {files.length === 0
                      ? slot.optional ? 'Not provided' : 'Missing'
                      : slot.multiple
                        ? `${files.length} file${files.length !== 1 ? 's' : ''}`
                        : docFileName(files[0].storagePath)}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      </div>

      <div className="fee-breakdown">
        <h3>Indicative Cost Breakdown</h3>
        <dl className="review-dl">
          <div className="review-row"><dt>Indicative first instalment</dt><dd style={{ color: 'var(--brand)', fontWeight: 700 }}>{formatRand(monthly)}</dd></div>
          <div className="review-row"><dt>Indicative total repayment</dt><dd>{formatRand(total)}</dd></div>
          <div className="review-row"><dt>Estimated total interest</dt><dd>{formatRand(fees)}</dd></div>
          <div className="review-row"><dt>Lending rate</dt><dd>{DEFAULT_RATE_LABEL}</dd></div>
        </dl>
      </div>

      <p className="consent-notice">
        Before your application is saved and sent, you will be asked to review and acknowledge PRDF's
        data privacy (POPIA) consent, policy acknowledgements, and Terms &amp; Conditions.
      </p>
      {submitError && <p className="text-error" role="alert" style={{ marginTop: '0.5rem' }}>{submitError}</p>}
      {missingDocuments.length > 0 && (
        <p className="text-error" role="alert" style={{ marginTop: '0.5rem' }}>
          Upload all required documents before submitting.
        </p>
      )}

      <div className="wizard-nav">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={submitting}>← Back</button>
        <button
          type="button"
          className={`btn btn-primary${submitting ? ' btn-loading' : ''}`}
          onClick={onOpenConsent}
          disabled={submitting || missingDocuments.length > 0}
        >
          {submitting ? '' : 'Submit Application'}
        </button>
      </div>
    </div>
  )
}
