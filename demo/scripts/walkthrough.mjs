import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const VIDEO = path.join(OUT, 'video', 'walkthrough')
const FIX = path.join(OUT, 'fixtures')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const EMAIL = 'thabo@brightfields.co.za'
const PASSWORD = 'DemoPassw0rd!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fx = (n) => path.join(FIX, n)

// Smoothly scroll the window to a target Y over a duration.
async function smoothScrollTo(page, y, ms = 1400) {
  await page.evaluate(async ({ y, ms }) => {
    const start = window.scrollY
    const dist = y - start
    const t0 = performance.now()
    await new Promise((res) => {
      function step(now) {
        const p = Math.min(1, (now - t0) / ms)
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
        window.scrollTo(0, start + dist * ease)
        if (p < 1) requestAnimationFrame(step)
        else res()
      }
      requestAnimationFrame(step)
    })
  }, { y, ms })
}

async function typeInto(page, selector, text, delay = 55) {
  await page.locator(selector).click()
  await page.locator(selector).fill('')
  await page.locator(selector).pressSequentially(text, { delay })
}

async function run() {
  const browser = await chromium.launch({ slowMo: 250 })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } },
  })
  const page = await context.newPage()

  // ---------- 1. Landing ----------
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await wait(1800)
  // scroll down through the marketing sections
  const height = await page.evaluate(() => document.body.scrollHeight)
  for (const frac of [0.18, 0.36, 0.54, 0.72, 0.9]) {
    await smoothScrollTo(page, height * frac, 1500)
    await wait(1100)
  }
  await smoothScrollTo(page, 0, 1400)
  await wait(1000)

  // Loan calculator — nudge the amount up
  const slider = page.locator('input[type="range"]').first()
  if (await slider.count()) {
    await slider.focus()
    for (let i = 0; i < 12; i++) { await page.keyboard.press('ArrowUp'); await wait(90) }
    await wait(1400)
  }

  // ---------- 2. Eligibility ----------
  await page.goto(BASE + '/eligibility', { waitUntil: 'networkidle' })
  await wait(1400)
  const boxes = page.locator('.elig-check-item__input')
  const n = await boxes.count()
  for (let i = 0; i < n; i++) { await boxes.nth(i).check({ force: true }); await wait(160) }
  await wait(900)
  await page.getByRole('button', { name: /Check My Eligibility/i }).click()
  await page.waitForURL('**/eligibility/result', { timeout: 8000 }).catch(() => {})
  await wait(2200)

  // ---------- 3. Login ----------
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await wait(1200)
  await typeInto(page, 'input[type="email"]', EMAIL)
  await typeInto(page, 'input[type="password"]', PASSWORD, 40)
  await wait(600)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await wait(3500)

  // ---------- 4. Home / Status / Documents ----------
  await page.goto(BASE + '/home', { waitUntil: 'networkidle' })
  await wait(2600)
  const nav = (label) => page.locator('nav a, aside a, .sidebar a, a').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first()
  for (const label of ['Status', 'Documents']) {
    const link = nav(label)
    if (await link.count()) { await link.click().catch(() => {}); await wait(2600) }
  }

  // ---------- 5. Apply wizard ----------
  await page.goto(BASE + '/apply', { waitUntil: 'networkidle' })
  await wait(2000)
  await typeInto(page, '#businessName', 'Brightfields Trading (Pty) Ltd', 30)
  await page.selectOption('#industry', { index: 1 })
  await typeInto(page, '#addressLine1', '12 Commissioner Street', 25)
  await typeInto(page, '#city', 'Johannesburg', 25)
  await page.selectOption('#province', { index: 1 })
  await page.selectOption('#gender', 'Female')
  await typeInto(page, '#saCitizenshipPercentage', '100', 60)
  await page.selectOption('#spatialType', 'Township')
  await typeInto(page, '#registrationNo', '2021/123456/07', 25)
  await typeInto(page, '#sarsTaxPin', '1234567890', 30)
  for (const label of ['>50.1% Black Women Owned', 'Registered with CIPC', 'Directors are 100% Operational in the business']) {
    const cb = page.locator('label.terms-check', { hasText: label }).locator('input[type="checkbox"]')
    if (await cb.count()) await cb.first().check({ force: true })
  }
  await wait(1200)
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1600)

  await typeInto(page, '#monthlyRevenue', '185000', 30)
  await typeInto(page, '#yearsInOperation', '4', 60)
  await typeInto(page, '#numberOfEmployees', '11', 60)
  await page.selectOption('#bankName', { index: 1 })
  await wait(1200)
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1600)

  await page.selectOption('#loanPurposeCategory', { index: 1 })
  await typeInto(page, '#purpose', 'Purchase two refrigerated delivery vehicles to expand fresh-produce distribution across Gauteng.', 12)
  await wait(1200)
  await page.getByRole('button', { name: /Continue/i }).click()
  await wait(1600)

  const files = page.locator('input[type="file"]')
  await files.nth(0).setInputFiles(fx('id.pdf'))
  await files.nth(1).setInputFiles(fx('proof.pdf'))
  await files.nth(2).setInputFiles(fx('cipc.pdf'))
  await files.nth(3).setInputFiles(fx('tax.pdf'))
  await files.nth(4).setInputFiles([fx('bank1.pdf'), fx('bank2.pdf'), fx('bank3.pdf')])
  await files.nth(5).setInputFiles(fx('financials.pdf'))
  await wait(1600)
  await page.getByRole('button', { name: /Review Application/i }).click()
  await wait(1800)

  // Show review + consent modal (do not submit — consent table not provisioned)
  await page.getByRole('button', { name: /Submit Application|Submit/i }).last().click()
  await page.locator('.consent-card').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await wait(1200)
  const yes = page.locator('.consent-radio--yes input[type="radio"]')
  const ny = await yes.count()
  for (let i = 0; i < ny; i++) { await yes.nth(i).check({ force: true }); await wait(120) }
  await wait(1800)

  await context.close()
  await browser.close()
  console.log('Walkthrough recorded to', VIDEO)
}
run().catch((e) => { console.error(e); process.exit(1) })
