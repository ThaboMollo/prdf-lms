import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(__dirname, '..', 'admin', 'screenshots')
const ADMIN = process.env.ADMIN_URL || 'http://localhost:5175'
const EMAIL = 'admin@prdf.co.za'
const PASSWORD = 'DemoAdmin1!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
  const fullShot = async (name) => {
    await page.evaluate(() => window.scrollTo(0, 0))
    await wait(500)
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
  }

  await page.goto(ADMIN + '/login', { waitUntil: 'networkidle' })
  await wait(1200)
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await wait(400)
  await shot('00-login-landing')
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {})
  await wait(3000)
  await shot('01-dashboard')

  await page.goto(ADMIN + '/applications', { waitUntil: 'networkidle' })
  await wait(2500)
  await shot('02-applications')

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
  await shot('06-app-detail-details')
  await clickTab('Documents'); await wait(1800); await focusDetail(); await shot('07-app-detail-documents')
  await clickTab('History'); await wait(1800); await focusDetail(); await shot('08-app-detail-history')
  await clickTab('Details'); await wait(1200)

  const statusSelect = page.locator('label:has-text("Change status") select')
  await statusSelect.scrollIntoViewIfNeeded()
  await statusSelect.selectOption('UnderReview')
  await wait(600)
  await page.getByRole('button', { name: /Update Status/i }).click()
  await wait(2500)
  await clickTab('History'); await wait(1500)
  await focusDetail()
  await shot('09-app-status-updated')

  await page.goto(ADMIN + '/portfolio', { waitUntil: 'networkidle' })
  await wait(2500)
  await shot('03-portfolio')

  await page.goto(ADMIN + '/reports', { waitUntil: 'networkidle' })
  await wait(4000)
  await fullShot('04-reports')

  await page.goto(ADMIN + '/user-access', { waitUntil: 'networkidle' })
  await wait(2500)
  await fullShot('05-user-access')

  await context.close()
  await browser.close()
  console.log('Admin screenshots recaptured into', SHOTS)
}
run().catch((e) => { console.error(e); process.exit(1) })
