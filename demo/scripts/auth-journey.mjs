import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const SHOTS = path.join(OUT, 'screenshots')
const VIDEO = path.join(OUT, 'video')
const FIX = path.join(OUT, 'fixtures')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const EMAIL = 'thabo@brightfields.co.za'
const PASSWORD = 'DemoPassw0rd!'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fx = (n) => path.join(FIX, n)

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
  console.log('  shot:', name)
}

async function run() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } },
  })
  const page = await context.newPage()

  // ---- Login ----
  console.log('Login')
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL('**/apply', { timeout: 15000 }).catch(() => {})
  await wait(2500)
  await shot(page, '09-apply-step1-empty')

  // ---- Step 1: Business & Compliance Profile ----
  console.log('Step 1')
  await page.fill('#businessName', 'Brightfields Trading (Pty) Ltd')
  await page.selectOption('#industry', { index: 1 })
  await page.fill('#addressLine1', '12 Commissioner Street')
  await page.fill('#city', 'Johannesburg')
  await page.selectOption('#province', { index: 1 })
  await page.selectOption('#gender', 'Female')
  await page.fill('#saCitizenshipPercentage', '100')
  await page.selectOption('#spatialType', 'Township')
  await page.fill('#registrationNo', '2021/123456/07')
  await page.fill('#sarsTaxPin', '1234567890')
  // compliance/demographic checkboxes
  for (const label of ['>50.1% Black Women Owned', 'Registered with CIPC', 'Directors are 100% Operational in the business']) {
    const cb = page.locator('label.terms-check', { hasText: label }).locator('input[type="checkbox"]')
    if (await cb.count()) await cb.first().check({ force: true })
  }
  await wait(400)
  await shot(page, '10-apply-step1-filled')
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1200)

  // ---- Step 2: Financials ----
  console.log('Step 2')
  await page.fill('#monthlyRevenue', '185000')
  await page.fill('#yearsInOperation', '4')
  await page.fill('#numberOfEmployees', '11')
  await page.selectOption('#bankName', { index: 1 })
  await wait(400)
  await shot(page, '11-apply-step2-financials')
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1200)

  // ---- Step 3: Loan Details ----
  console.log('Step 3')
  await page.selectOption('#loanPurposeCategory', { index: 1 })
  await page.fill('#purpose', 'Purchase two refrigerated delivery vehicles to expand our fresh-produce distribution across Gauteng.')
  await wait(400)
  await shot(page, '12-apply-step3-loan')
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1200)

  // ---- Step 4: Documents ----
  console.log('Step 4')
  const fileInputs = page.locator('input[type="file"]')
  const nInputs = await fileInputs.count()
  console.log('  file inputs:', nInputs)
  // order: id, proof, cipc, tax, bankStatements(multiple), financials
  await fileInputs.nth(0).setInputFiles(fx('id.pdf'))
  await fileInputs.nth(1).setInputFiles(fx('proof.pdf'))
  await fileInputs.nth(2).setInputFiles(fx('cipc.pdf'))
  await fileInputs.nth(3).setInputFiles(fx('tax.pdf'))
  await fileInputs.nth(4).setInputFiles([fx('bank1.pdf'), fx('bank2.pdf'), fx('bank3.pdf')])
  await fileInputs.nth(5).setInputFiles(fx('financials.pdf'))
  await wait(800)
  await shot(page, '13-apply-step4-documents')
  await page.getByRole('button', { name: /Review Application/i }).click()
  await wait(1200)

  // ---- Step 5: Review & Submit ----
  console.log('Step 5')
  const terms = page.locator('input[type="checkbox"]').last()
  await terms.check({ force: true }).catch(() => {})
  await wait(400)
  await shot(page, '14-apply-step5-review')

  // Submit -> consent modal
  const submitBtn = page.getByRole('button', { name: /Submit Application|Submit/i }).last()
  await submitBtn.click()
  await page.locator('.consent-card').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await wait(800)
  await shot(page, '15-apply-consent-modal')

  // Answer YES to every consent item, then Proceed
  const yesRadios = page.locator('.consent-radio--yes input[type="radio"]')
  const nYes = await yesRadios.count()
  console.log('  consent items:', nYes)
  for (let i = 0; i < nYes; i++) {
    await yesRadios.nth(i).check({ force: true })
    await wait(60)
  }
  await wait(400)
  await shot(page, '16-apply-consent-filled')
  await page.getByRole('button', { name: /^Proceed$/i }).click()
  await wait(8000)
  await shot(page, '17-apply-submit-result')
  console.log('  after submit URL:', page.url())

  // ---- Authenticated pages ----
  for (const [route, name] of [
    ['/home', '18-home'],
    ['/status', '19-status'],
    ['/documents', '20-documents'],
    ['/loans', '21-loans'],
  ]) {
    console.log('Nav', route)
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {})
    await wait(2500)
    await shot(page, name)
    console.log('  landed:', page.url())
  }

  await context.close()
  await browser.close()
  console.log('Auth journey done.')
}

run().catch((e) => { console.error(e); process.exit(1) })
