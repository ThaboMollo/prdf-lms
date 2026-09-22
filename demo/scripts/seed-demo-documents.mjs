// ===========================================================================
// PRDF LMS — attach dummy documents to the 5 scenario demo applications.
// ===========================================================================
// Companion to infra/supabase/seed/seed-test-applications.sql. Those five apps
// are seeded with deterministic UUIDs but no documents, so the admin Documents
// tab renders an empty checklist. This uploads a dummy PDF per required doc
// type to the `loan-documents` bucket and inserts the matching loan_documents
// rows, so every scenario app shows a full, previewable document set.
//
// Idempotent: deterministic storage paths (x-upsert) + deterministic row ids
// (merge-duplicates), so re-running converges. TEST DATA ONLY.
//
// Run:
//   set -a && . ./backend-node/.env && set +a
//   node demo/scripts/seed-demo-documents.mjs
// ===========================================================================
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.resolve(__dirname, '..', 'fixtures')

const SUPABASE_URL = process.env.SUPABASE_URL
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL) throw new Error('SUPABASE_URL env var is required')
if (!SRK) throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is required')

const BUCKET = 'loan-documents'
// client@prdf.test — the seeded portal user that owns the scenario businesses.
const UPLOADED_BY = 'e561b315-eaa5-efc7-676c-87ac31295b85'

const md5uuid = (s) => {
  const h = createHash('md5').update(s).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const APP_IDS = [1, 2, 3, 4, 5].map((n) => md5uuid(`prdf-test:app-${n}`))

// The 10 required doc types (mirrors phase13_required_documents.sql), each
// mapped to a fixture PDF to use as dummy content.
const DOC_TYPES = [
  { type: 'IDDocument', fixture: 'id.pdf' },
  { type: 'ProofOfAddress', fixture: 'proof.pdf' },
  { type: 'BusinessRegistration', fixture: 'cipc.pdf' },
  { type: 'TaxClearance', fixture: 'tax.pdf' },
  { type: 'BankStatement', fixture: 'bank1.pdf' },
  { type: 'Financials', fixture: 'financials.pdf' },
  { type: 'VendorQuotation', fixture: 'sample.pdf' },
  { type: 'RfqSupplierSpec', fixture: 'sample.pdf' },
  { type: 'PurchaseOrder', fixture: 'sample.pdf' },
  { type: 'TradeReference', fixture: 'sample.pdf' },
]

const H = { apikey: SRK, Authorization: `Bearer ${SRK}` }

async function uploadObject(storagePath, bytes) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: bytes,
  })
  if (!res.ok) throw new Error(`upload ${storagePath} -> ${res.status}: ${await res.text()}`)
}

async function upsertRow(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/loan_documents`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`row ${row.doc_type} -> ${res.status}: ${await res.text()}`)
}

const fixtureCache = new Map()
const loadFixture = async (name) => {
  if (!fixtureCache.has(name)) fixtureCache.set(name, await readFile(path.join(FIX, name)))
  return fixtureCache.get(name)
}

let uploaded = 0
for (const appId of APP_IDS) {
  for (const { type, fixture } of DOC_TYPES) {
    const storagePath = `applications/${appId}/seed-${type}.pdf`
    const bytes = await loadFixture(fixture)
    await uploadObject(storagePath, bytes)
    await upsertRow({
      id: md5uuid(`prdf-test:doc:${appId}:${type}`),
      application_id: appId,
      doc_type: type,
      storage_path: storagePath,
      status: 'Uploaded',
      uploaded_by: UPLOADED_BY,
    })
    uploaded += 1
  }
  console.log(`seeded documents for application ${appId}`)
}
console.log(`Done. Upserted ${uploaded} documents across ${APP_IDS.length} applications.`)
