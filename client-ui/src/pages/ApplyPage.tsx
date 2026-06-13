import { useMemo, useReducer, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import type { MeResponse } from '../lib/api'
import { useCalculator } from '../contexts/CalculatorContext'
import { WizardProgress } from '../components/shared/WizardProgress'
import { FileDropzone } from '../components/shared/FileDropzone'
import { FieldError } from '../components/shared/FieldError'
import { LoanCalculator } from '../components/shared/LoanCalculator'
import { AddressFields, type AddressValue } from '../components/shared/AddressFields'
import { WizardCostCard } from '../components/shared/WizardCostCard'
import { formatRand, calculateMonthlyInstalment, calculateTotalFees, calculateTotalRepayment } from '../lib/loanCalc'
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  type Step1Data,
  type Step2Data,
  type Step3Data,
  type Step4Data,
  type WizardFormState,
} from '../features/applications/validation'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createDocumentsUseCases } from '../logic/usecases/documents'

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
  | { type: 'SET_STEP4'; payload: Step4Data }
  | { type: 'GOTO_STEP'; step: number }

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
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
    case 'SET_STEP4':
      return { ...state, data: { ...state.data, step4: action.payload } }
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
  const { amount, term } = useCalculator()

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
  const fees = calculateTotalFees(amount, term)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleFinalSubmit(termsAccepted: boolean) {
    const { step1, step2, step3, step4 } = state.data

    const step5Result = step5Schema.safeParse({ termsAccepted })
    if (!step5Result.success) return

    if (!step1 || !step2 || !step3 || !step4) {
      setSubmitError('Please complete all steps before submitting.')
      return
    }

    const step4Result = step4Schema.safeParse(step4)
    if (!step4Result.success) {
      setSubmitError('Please upload all required documents before submitting.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const draft = await applicationsUseCases.createDraft({
        requestedAmount: step3.requestedAmount,
        termMonths: step3.termMonths,
        purpose: `${step3.loanPurposeCategory}: ${step3.purpose}`,
        businessName: step1.businessName,
        registrationNo: step1.registrationNo,
        address: [step1.addressLine1, step1.addressLine2, step1.city, step1.province, step1.country]
          .filter(Boolean)
          .join(', '),
        industry: step1.industry,
        gender: step1.gender,
        isDisabled: step1.isDisabled,
        isHdp: step1.isHdp,
        isRural: step1.isRural,
        isBlackWomenOwned: step1.isBlackWomenOwned,
        saCitizenshipPercentage: step1.saCitizenshipPercentage,
        isDirectorOperational: step1.isDirectorOperational,
        cipcRegistered: step1.cipcRegistered,
        sarsTaxPin: step1.sarsTaxPin,
        insolventOrDebtReview: step1.insolventOrDebtReview
      })

      const appId = draft.id

      // Upload documents
      await documentsUseCases.uploadDocumentFlow(appId, 'IDDocument', step4Result.data.idDocument)
      await documentsUseCases.uploadDocumentFlow(appId, 'ProofOfAddress', step4Result.data.proofOfAddress)
      await documentsUseCases.uploadDocumentFlow(appId, 'BusinessRegistration', step4Result.data.cipcCert)
      await documentsUseCases.uploadDocumentFlow(appId, 'TaxClearance', step4Result.data.taxClearance)

      for (const file of step4Result.data.bankStatements) {
        await documentsUseCases.uploadDocumentFlow(appId, 'BankStatement', file)
      }

      await documentsUseCases.uploadDocumentFlow(appId, 'Financials', step4Result.data.financials)

      await applicationsUseCases.submitApplication(appId)

      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['home-applications'] })
      queryClient.invalidateQueries({ queryKey: ['status-applications'] })

      navigate('/status')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="wizard-shell">
      <div className="wizard-header">
        <h1>Apply for Funding</h1>
        <p>Step {state.currentStep} of {STEPS.length} - {STEPS[state.currentStep - 1]}</p>
        <WizardProgress steps={STEPS} currentStep={state.currentStep} />
      </div>

      <div className="wizard-content">
        <div className="wizard-form-col">
          {state.currentStep === 1 && (
            <Step1
              initial={state.data.step1}
              onNext={(data) => {
                dispatch({ type: 'SET_STEP1', payload: data })
                dispatch({ type: 'NEXT' })
              }}
            />
          )}
          {state.currentStep === 2 && (
            <Step2
              initial={state.data.step2}
              onNext={(data) => {
                dispatch({ type: 'SET_STEP2', payload: data })
                dispatch({ type: 'NEXT' })
              }}
              onBack={() => dispatch({ type: 'PREV' })}
            />
          )}
          {state.currentStep === 3 && (
            <Step3
              initial={state.data.step3}
              onNext={(data) => {
                dispatch({ type: 'SET_STEP3', payload: data })
                dispatch({ type: 'NEXT' })
              }}
              onBack={() => dispatch({ type: 'PREV' })}
            />
          )}
          {state.currentStep === 4 && (
            <Step4
              initial={state.data.step4}
              onNext={(data) => {
                dispatch({ type: 'SET_STEP4', payload: data })
                dispatch({ type: 'NEXT' })
              }}
              onBack={() => dispatch({ type: 'PREV' })}
            />
          )}
          {state.currentStep === 5 && (
            <Step5
              data={state.data}
              submitting={submitting}
              submitError={submitError}
              onBack={() => dispatch({ type: 'PREV' })}
              onSubmit={handleFinalSubmit}
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
    </div>
  )
}

// ----------------------------------------------------------------
// Step 1 — Business Profile
// ----------------------------------------------------------------
function Step1({ initial, onNext }: { initial: Step1Data | null; onNext: (d: Step1Data) => void }) {
  const [form, setForm] = useState({
    businessName: initial?.businessName ?? '',
    registrationNo: initial?.registrationNo ?? '',
    industry: initial?.industry ?? '',
    gender: initial?.gender ?? 'Prefer not to say',
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

  function handleNext() {
    const flat = {
      businessName: form.businessName,
      registrationNo: form.registrationNo,
      industry: form.industry,
      addressLine1: form.address.addressLine1,
      addressLine2: form.address.addressLine2,
      city: form.address.city,
      province: form.address.province,
      country: form.address.country,
      gender: form.gender,
      isDisabled: form.isDisabled,
      isHdp: form.isHdp,
      isRural: form.isRural,
      isBlackWomenOwned: form.isBlackWomenOwned,
      saCitizenshipPercentage: Number(form.saCitizenshipPercentage || 0),
      isDirectorOperational: form.isDirectorOperational,
      cipcRegistered: form.cipcRegistered,
      sarsTaxPin: form.sarsTaxPin,
      insolventOrDebtReview: form.insolventOrDebtReview
    }
    const result = step1Schema.safeParse(flat)
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
        </div>

        <div className="form-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <label className="terms-check"><input type="checkbox" checked={form.isBlackWomenOwned} onChange={set('isBlackWomenOwned')} /> {'>'}50.1% Black Women Owned</label>
          <label className="terms-check"><input type="checkbox" checked={form.isHdp} onChange={set('isHdp')} /> Historically Disadvantaged Person (HDP)</label>
          <label className="terms-check"><input type="checkbox" checked={form.isDisabled} onChange={set('isDisabled')} /> Disabled Persons / Ownership</label>
          <label className="terms-check"><input type="checkbox" checked={form.isRural} onChange={set('isRural')} /> Rural Operations / Community</label>
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
        <span />
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
}: {
  initial: Step2Data | null
  onNext: (d: Step2Data) => void
  onBack: () => void
}) {
  const [form, setForm] = useState({
    monthlyRevenue: initial?.monthlyRevenue?.toString() ?? '',
    yearsInOperation: initial?.yearsInOperation?.toString() ?? '',
    numberOfEmployees: initial?.numberOfEmployees?.toString() ?? '',
    bankName: initial?.bankName ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof Step2Data, string>>>({})

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
}: {
  initial: Step3Data | null
  onNext: (d: Step3Data) => void
  onBack: () => void
}) {
  const { setCalculator } = useCalculator()
  const [purpose, setPurpose] = useState(initial?.purpose ?? '')
  const [loanPurposeCategory, setLoanPurposeCategory] = useState(initial?.loanPurposeCategory ?? '')
  const [errors, setErrors] = useState<Partial<Record<keyof Step3Data, string>>>({})

  // Keep in sync with calculator context — slider changes go through context
  const { amount, term } = useCalculator()

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
      <p>Adjust the sliders to set your preferred loan amount and repayment term.</p>

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
        <button type="button" className="btn btn-primary" onClick={handleNext}>Continue →</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Step 4 — Documents
// ----------------------------------------------------------------
function Step4({
  initial,
  onNext,
  onBack,
}: {
  initial: Step4Data | null
  onNext: (d: Step4Data) => void
  onBack: () => void
}) {
  const [idDocument, setIdDocument] = useState<File | null>(initial?.idDocument ?? null)
  const [proofOfAddress, setProofOfAddress] = useState<File | null>(initial?.proofOfAddress ?? null)
  const [cipcCert, setCipcCert] = useState<File | null>(initial?.cipcCert ?? null)
  const [taxClearance, setTaxClearance] = useState<File | null>(initial?.taxClearance ?? null)
  const [bankStatements, setBankStatements] = useState<File[]>(initial?.bankStatements ?? [])
  const [financials, setFinancials] = useState<File | null>(initial?.financials ?? null)
  const [errors, setErrors] = useState<Partial<Record<keyof Step4Data, string>>>({})

  function handleNext() {
    const result = step4Schema.safeParse({
      idDocument,
      proofOfAddress,
      cipcCert,
      taxClearance,
      bankStatements,
      financials,
    })
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof Step4Data, string>> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Step4Data
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
      <h2>Documents</h2>
      <p>Upload all required documents. Accepted formats: PDF, JPG, PNG.</p>

      <div className="document-upload-grid">
        <FileDropzone
          label="ID Document *"
          accept=".pdf,.jpg,.jpeg,.png"
          files={idDocument ? [idDocument] : []}
          onFilesChange={(files) => setIdDocument(files[0] ?? null)}
          error={errors.idDocument}
          hint="Certified copy of the director or applicant identity document"
        />

        <FileDropzone
          label="Proof of Address *"
          accept=".pdf,.jpg,.jpeg,.png"
          files={proofOfAddress ? [proofOfAddress] : []}
          onFilesChange={(files) => setProofOfAddress(files[0] ?? null)}
          error={errors.proofOfAddress}
          hint="Recent proof of business or director address"
        />

        <FileDropzone
          label="Company Registration (CIPC) *"
          accept=".pdf,.jpg,.jpeg,.png"
          files={cipcCert ? [cipcCert] : []}
          onFilesChange={(files) => setCipcCert(files[0] ?? null)}
          error={errors.cipcCert}
          hint="CIPC company registration certificate"
        />

        <FileDropzone
          label="Tax Clearance *"
          accept=".pdf,.jpg,.jpeg,.png"
          files={taxClearance ? [taxClearance] : []}
          onFilesChange={(files) => setTaxClearance(files[0] ?? null)}
          error={errors.taxClearance}
          hint="SARS tax clearance or tax compliance status document"
        />

        <FileDropzone
          label="Bank Statements (last 3 months) *"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          files={bankStatements}
          onFilesChange={setBankStatements}
          error={errors.bankStatements}
          hint="Upload 3 months of business bank statements"
        />

        <FileDropzone
          label="Financial Statements *"
          accept=".pdf,.jpg,.jpeg,.png"
          files={financials ? [financials] : []}
          onFilesChange={(files) => setFinancials(files[0] ?? null)}
          error={errors.financials}
          hint="Latest annual financials or management accounts"
        />
      </div>

      <div className="wizard-nav">
        <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button>
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
  submitting,
  submitError,
  onBack,
  onSubmit,
}: {
  data: WizardFormState
  submitting: boolean
  submitError: string | null
  onBack: () => void
  onSubmit: (termsAccepted: boolean) => void
}) {
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsError, setTermsError] = useState<string | null>(null)

  const { step1, step2, step3, step4 } = data
  const amount = step3?.requestedAmount ?? 0
  const term = step3?.termMonths ?? 0
  const monthly = calculateMonthlyInstalment(amount, term)
  const total = calculateTotalRepayment(amount, term)
  const fees = calculateTotalFees(amount, term)

  function handleSubmit() {
    if (!termsAccepted) {
      setTermsError('You must accept the terms and conditions to proceed.')
      return
    }
    setTermsError(null)
    onSubmit(termsAccepted)
  }

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

        {step4 && (
          <div className="review-section">
            <h3>Documents</h3>
            <dl className="review-dl">
              <div className="review-row"><dt>ID Document</dt><dd>{step4.idDocument?.name ?? '-'}</dd></div>
              <div className="review-row"><dt>Proof of Address</dt><dd>{step4.proofOfAddress?.name ?? '-'}</dd></div>
              <div className="review-row"><dt>Company Registration</dt><dd>{step4.cipcCert?.name ?? '-'}</dd></div>
              <div className="review-row"><dt>Tax Clearance</dt><dd>{step4.taxClearance?.name ?? '-'}</dd></div>
              <div className="review-row"><dt>Bank stmts</dt><dd>{step4.bankStatements.length} file{step4.bankStatements.length !== 1 ? 's' : ''}</dd></div>
              <div className="review-row"><dt>Financials</dt><dd>{step4.financials?.name ?? '-'}</dd></div>
            </dl>
          </div>
        )}
      </div>

      <div className="fee-breakdown">
        <h3>Cost Breakdown</h3>
        <dl className="review-dl">
          <div className="review-row"><dt>Monthly instalment</dt><dd style={{ color: 'var(--brand)', fontWeight: 700 }}>{formatRand(monthly)}</dd></div>
          <div className="review-row"><dt>Total repayment</dt><dd>{formatRand(total)}</dd></div>
          <div className="review-row"><dt>Total fees</dt><dd>{formatRand(fees)}</dd></div>
        </dl>
      </div>

      <label className="terms-check">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
        />
        I confirm that all information provided is accurate and I agree to the PRDF terms and conditions.
      </label>
      {termsError && <p className="field-error" role="alert">{termsError}</p>}
      {submitError && <p className="text-error" role="alert" style={{ marginTop: '0.5rem' }}>{submitError}</p>}

      <div className="wizard-nav">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={submitting}>← Back</button>
        <button
          type="button"
          className={`btn btn-primary${submitting ? ' btn-loading' : ''}`}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? '' : 'Submit Application'}
        </button>
      </div>
    </div>
  )
}
