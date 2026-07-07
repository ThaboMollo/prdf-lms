import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const FIX = path.join(OUT, 'fixtures')
const CLIENT_SHOTS = path.join(OUT, 'screenshots')
const ADMIN_SHOTS = path.join(OUT, 'admin', 'screenshots')
const CLIENT = process.env.BASE_URL || 'http://localhost:5174'
const ADMIN = process.env.ADMIN_URL || 'http://localhost:5175'

const CLIENT_EMAIL = 'thabo@brightfields.co.za'
const CLIENT_PASSWORD = 'DemoPassw0rd!'
const ADMIN_EMAIL = 'admin@prdf.co.za'
const ADMIN_PASSWORD = 'DemoAdmin1!'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fx = (n) => path.join(FIX, n)

// viewport shot: what a user actually sees; sticky headers stay in place
const shot = (page, dir, name) => page.screenshot({ path: path.join(dir, `${name}.png`) })
// full-page shot, always from the very top so sticky elements render in their
// natural position instead of baked mid-page
async function fullShot(page, dir, name) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await wait(500)
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
}

async function run() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const cs = (name) => shot(page, CLIENT_SHOTS, name)
  const cf = (name) => fullShot(page, CLIENT_SHOTS, name)
  const as_ = (name) => shot(page, ADMIN_SHOTS, name)
  const af = (name) => fullShot(page, ADMIN_SHOTS, name)

  /* ================= CLIENT PORTAL ================= */

  // ---- landing ----
  await page.goto(CLIENT + '/', { waitUntil: 'networkidle' })
  await wait(1500)
  await cs('01-landing-hero')

  const slider = page.locator('input[type="range"]').first()
  await slider.focus()
  for (let i = 0; i < 12; i++) { await page.keyboard.press('ArrowUp'); await wait(40) }
  await wait(800)
  await cs('02-landing-calculator')
  await cf('03-landing-full')

  // ---- eligibility ----
  await page.goto(CLIENT + '/eligibility', { waitUntil: 'networkidle' })
  await wait(1200)
  await cf('04-eligibility-empty')
  const boxes = page.locator('.elig-check-item__input')
  const nBoxes = await boxes.count()
  for (let i = 0; i < nBoxes; i++) await boxes.nth(i).check({ force: true })
  await wait(800)
  await cf('05-eligibility-filled')
  await page.getByRole('button', { name: /Check My Eligibility/i }).click()
  await page.waitForURL('**/eligibility/result', { timeout: 8000 }).catch(() => {})
  await wait(1500)
  await cf('06-eligibility-result')

  // ---- register (filled, not submitted) ----
  await page.goto(CLIENT + '/register', { waitUntil: 'networkidle' })
  await wait(1200)
  const regInputs = page.locator('form input')
  if (await regInputs.count() >= 5) {
    await regInputs.nth(0).fill('Thabo')
    await regInputs.nth(1).fill('Mponya')
    await regInputs.nth(2).fill('+27 81 234 5678')
    await regInputs.nth(3).fill(CLIENT_EMAIL)
    await regInputs.nth(4).fill(CLIENT_PASSWORD)
  }
  await wait(600)
  await cs('07-register')

  // ---- login ----
  await page.goto(CLIENT + '/login', { waitUntil: 'networkidle' })
  await wait(1200)
  await page.locator('input[type="email"]').fill(CLIENT_EMAIL)
  await page.locator('input[type="password"]').fill(CLIENT_PASSWORD)
  await wait(400)
  await cs('08-login')
  await page.getByRole('button', { name: /Sign In/i }).click()
  await wait(3500)

  // ---- home / status / documents / loans ----
  await page.goto(CLIENT + '/home', { waitUntil: 'networkidle' })
  await wait(2500)
  await cs('18-home')
  await page.goto(CLIENT + '/status', { waitUntil: 'networkidle' })
  await wait(2500)
  await cs('19-status')
  await page.goto(CLIENT + '/documents', { waitUntil: 'networkidle' })
  await wait(2500)
  await cs('20-documents')
  await page.goto(CLIENT + '/loans', { waitUntil: 'networkidle' })
  await wait(2500)
  await cs('21-loans')

  // ---- apply wizard (filled but never submitted) ----
  await page.goto(CLIENT + '/apply', { waitUntil: 'networkidle' })
  await wait(2000)
  await cf('09-apply-step1-empty')

  await page.locator('#businessName').fill('Brightfields Trading (Pty) Ltd')
  await page.selectOption('#industry', { index: 1 })
  await page.locator('#addressLine1').fill('12 Commissioner Street')
  await page.locator('#city').fill('Johannesburg')
  await page.selectOption('#province', { index: 1 })
  await page.selectOption('#gender', 'Female')
  await page.locator('#saCitizenshipPercentage').fill('100')
  await page.selectOption('#spatialType', 'Township')
  await page.locator('#registrationNo').fill('2021/123456/07')
  await page.locator('#sarsTaxPin').fill('1234567890')
  for (const label of ['>50.1% Black Women Owned', 'Registered with CIPC', 'Directors are 100% Operational in the business']) {
    const cb = page.locator('label.terms-check', { hasText: label }).locator('input[type="checkbox"]')
    if (await cb.count()) await cb.first().check({ force: true })
  }
  await wait(800)
  await cf('10-apply-step1-filled')
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1500)

  await page.locator('#monthlyRevenue').fill('185000')
  await page.locator('#yearsInOperation').fill('4')
  await page.locator('#numberOfEmployees').fill('11')
  await page.selectOption('#bankName', { index: 1 })
  await wait(800)
  await cs('11-apply-step2-financials')
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1500)

  await page.selectOption('#loanPurposeCategory', { index: 1 })
  await page.locator('#purpose').fill('Purchase two refrigerated delivery vehicles to expand fresh-produce distribution across Gauteng.')
  await wait(800)
  await cf('12-apply-step3-loan')
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1500)

  const files = page.locator('input[type="file"]')
  await files.nth(0).setInputFiles(fx('id.pdf'))
  await files.nth(1).setInputFiles(fx('proof.pdf'))
  await files.nth(2).setInputFiles(fx('cipc.pdf'))
  await files.nth(3).setInputFiles(fx('tax.pdf'))
  await files.nth(4).setInputFiles([fx('bank1.pdf'), fx('bank2.pdf'), fx('bank3.pdf')])
  await files.nth(5).setInputFiles(fx('financials.pdf'))
  await wait(1200)
  await cf('13-apply-step4-documents')
  await page.getByRole('button', { name: /Review Application/i }).click()
  await wait(1500)
  await cf('14-apply-step5-review')

  // consent modal: answer everything, then CLOSE (no submission)
  await page.getByRole('button', { name: /Submit Application|Submit/i }).last().click()
  await page.locator('.consent-card').waitFor({ state: 'visible', timeout: 8000 })
  await wait(1000)
  await cs('15-apply-consent-modal')
  const yes = page.locator('.consent-radio--yes input[type="radio"]')
  const nYes = await yes.count()
  for (let i = 0; i < nYes; i++) await yes.nth(i).check({ force: true })
  await wait(800)
  await cs('16-apply-consent-filled')
  await page.locator('button.btn-secondary', { hasText: 'Close' }).click()
  await wait(800)

  // ---- draft: resume the existing draft, save it again to show the toast ----
  await page.goto(CLIENT + '/status', { waitUntil: 'networkidle' })
  await wait(2000)
  const resume = page.getByRole('button', { name: /Resume your draft/i }).first()
  if (await resume.count()) {
    await resume.click()
    await wait(2500)
    await cs('draft-02-resumed')
    const saveLater = page.getByRole('button', { name: /Save & finish later/i })
    if (await saveLater.count()) {
      await saveLater.click()
      await page.waitForURL('**/status', { timeout: 10000 }).catch(() => {})
      await wait(1200) // capture while the "Draft saved" toast is still visible
      await cs('draft-01-saved-status')
    }
  } else {
    console.warn('No draft to resume — draft screenshots not recaptured')
  }

  /* ================= ADMIN CONSOLE ================= */

  await context.clearCookies()
  await page.goto(ADMIN + '/login', { waitUntil: 'networkidle' })
  await wait(1200)
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await wait(400)
  await as_('00-login-landing')
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {})
  await wait(3000)
  await as_('01-dashboard')

  // ---- applications workspace ----
  await page.goto(ADMIN + '/applications', { waitUntil: 'networkidle' })
  await wait(2500)
  await as_('02-applications')

  // open the first case that is plain Submitted so 09 shows a real transition
  const rows = page.locator('table tbody tr')
  const nRows = await rows.count()
  let opened = false
  for (let i = 0; i < nRows; i++) {
    const row = rows.nth(i)
    const txt = (await row.textContent()) || ''
    if (/Submitted/i.test(txt) && !/UnderReview/i.test(txt)) {
      await row.locator('button.link-btn').click()
      opened = true
      break
    }
  }
  if (!opened) await rows.first().locator('button.link-btn').click()
  await wait(2200)

  const clickTab = async (name) => {
    const t = page.locator('button.tab', { hasText: new RegExp(`^${name}`, 'i') }).first()
    await t.scrollIntoViewIfNeeded()
    await t.click()
  }
  // put the case-file heading just below the sticky topbar
  const focusDetail = async () => {
    await page.locator('button.tab').first().scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -120))
    await wait(600)
  }

  await focusDetail()
  await as_('06-app-detail-details')
  await clickTab('Documents'); await wait(1800); await focusDetail(); await as_('07-app-detail-documents')
  await clickTab('History'); await wait(1800); await focusDetail(); await as_('08-app-detail-history')
  await clickTab('Details'); await wait(1200)

  const statusSelect = page.locator('label:has-text("Change status") select')
  await statusSelect.scrollIntoViewIfNeeded()
  await statusSelect.selectOption('UnderReview')
  await wait(600)
  await page.getByRole('button', { name: /Update Status/i }).click()
  await wait(2500)
  await clickTab('History'); await wait(1500)
  await focusDetail()
  await as_('09-app-status-updated')

  // ---- portfolio / reports / user access ----
  await page.goto(ADMIN + '/portfolio', { waitUntil: 'networkidle' })
  await wait(2500)
  await as_('03-portfolio')

  await page.goto(ADMIN + '/reports', { waitUntil: 'networkidle' })
  await wait(4000)
  await af('04-reports')

  await page.goto(ADMIN + '/user-access', { waitUntil: 'networkidle' })
  await wait(2500)
  await af('05-user-access')

  await context.close()
  await browser.close()
  console.log('All screenshots recaptured (client:', CLIENT_SHOTS, '| admin:', ADMIN_SHOTS, ')')
}
run().catch((e) => { console.error(e); process.exit(1) })
