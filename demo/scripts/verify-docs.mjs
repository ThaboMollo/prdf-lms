import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(__dirname, '..', 'screenshots')
const FIX = path.resolve(__dirname, '..', 'fixtures')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const EMAIL = 'thabo@brightfields.co.za'
const PASSWORD = 'DemoPassw0rd!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fx = (n) => path.join(FIX, n)
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `docs-${n}.png`), fullPage: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('supabase')) errs.push(`http ${r.status()} ${r.request().method()} ${r.url().split('?')[0].split('/').slice(-1)}`) })

const uploadedRowCount = () => page.locator('.doc-uploaded-row').count()

// login
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(EMAIL)
await page.locator('input[type="password"]').fill(PASSWORD)
await page.getByRole('button', { name: /Sign In/i }).click()
await wait(3500)

// fresh apply -> fill steps 1-3
await page.goto(BASE + '/apply', { waitUntil: 'networkidle' })
await wait(2500)
await page.fill('#businessName', 'Docs Persist Co (Pty) Ltd')
await page.selectOption('#industry', { index: 1 })
await page.fill('#addressLine1', '5 Persist Road')
await page.fill('#city', 'Durban')
await page.selectOption('#province', { index: 1 })
await page.selectOption('#gender', 'Female')
await page.fill('#saCitizenshipPercentage', '100')
await page.selectOption('#spatialType', 'City')
await page.fill('#registrationNo', '2020/111222/07')
await page.fill('#sarsTaxPin', '1122334455')
await page.getByRole('button', { name: /Continue/i }).click(); await wait(1200)
await page.fill('#monthlyRevenue', '210000')
await page.fill('#yearsInOperation', '5')
await page.fill('#numberOfEmployees', '8')
await page.selectOption('#bankName', { index: 2 })
await page.getByRole('button', { name: /Continue/i }).click(); await wait(1200)
await page.selectOption('#loanPurposeCategory', { index: 1 })
await page.fill('#purpose', 'Persisted-documents verification run for the apply wizard.')
await page.getByRole('button', { name: /Continue/i }).click(); await wait(1500)

// Step 4: upload each document (upload-on-add). Target inputs by slot, since a
// slot's dropzone disappears once a single file is uploaded to it.
console.log('file inputs on step 4:', await page.locator('input[type="file"]').count())
async function uploadSlot(labelText, files) {
  const input = page.locator('.doc-slot', { hasText: labelText }).locator('input[type="file"]').first()
  await input.setInputFiles(files)
  await wait(1600)
}
await uploadSlot('ID Document', fx('id.pdf'))
await uploadSlot('Proof of Address', fx('proof.pdf'))
await uploadSlot('Company Registration', fx('cipc.pdf'))
await uploadSlot('Tax Clearance', fx('tax.pdf'))
await uploadSlot('Bank Statements', [fx('bank1.pdf'), fx('bank2.pdf')])
await uploadSlot('Financial Statements', fx('financials.pdf'))
await shot(page, '01-step4-uploaded')
console.log('uploaded rows after add:', await uploadedRowCount())

// Save & finish later, then resume
await page.getByRole('button', { name: /Save & finish later/i }).click()
await page.waitForURL('**/status**', { timeout: 15000 }).catch(() => {})
await wait(2000)
await page.getByRole('link', { name: /Resume your draft/i }).first().click()
await wait(3500)
console.log('resumed URL:', page.url())
// resume should land on step 4 (documents) or 5; ensure we can see persisted docs
const resumedRows = await uploadedRowCount()
console.log('uploaded rows after resume:', resumedRows)
await shot(page, '02-resumed-docs')

// Test remove: remove one doc, expect count to drop (needs phase10 RLS)
const firstRemove = page.getByRole('button', { name: /^Remove$/i }).first()
if (await firstRemove.count()) {
  const before = await uploadedRowCount()
  await firstRemove.click(); await wait(2000)
  const after = await uploadedRowCount()
  console.log(`remove: ${before} -> ${after}`)
  // re-add it so the set is complete for submit
  await page.locator('input[type="file"]').first().setInputFiles(fx('id.pdf')); await wait(1500)
}

// Continue to review + submit (no re-upload should occur)
const reviewBtn = page.getByRole('button', { name: /Review Application/i })
if (await reviewBtn.count()) { await reviewBtn.click(); await wait(1500) }
await shot(page, '03-review')
await page.getByRole('button', { name: /Submit Application|Submit/i }).last().click()
await page.locator('.consent-card').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
const yes = page.locator('.consent-radio--yes input[type="radio"]')
const ny = await yes.count()
for (let i = 0; i < ny; i++) { await yes.nth(i).check({ force: true }); await wait(40) }
await page.getByRole('button', { name: /^Proceed$/i }).click()
let outcome = 'unknown'
try { await page.waitForURL('**/status', { timeout: 20000 }); outcome = 'SUCCESS -> /status' }
catch { outcome = 'NO REDIRECT ' + page.url() }
await wait(1500)
console.log('SUBMIT OUTCOME:', outcome)
console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : '(none)')
await context.close()
await browser.close()
