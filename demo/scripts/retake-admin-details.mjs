import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(__dirname, '..', 'admin', 'screenshots')
const ADMIN = process.env.ADMIN_URL || 'http://localhost:5175'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()

  await page.goto(ADMIN + '/login', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill('admin@prdf.co.za')
  await page.locator('input[type="password"]').fill('DemoAdmin1!')
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {})
  await wait(3000)

  await page.goto(ADMIN + '/applications', { waitUntil: 'networkidle' })
  await wait(2500)

  // open the showcase case: full document set, realistic purpose
  const row = page.locator('table tbody tr', { hasText: /refrigerated delivery vehicles/i }).first()
  await row.locator('button.link-btn').click()
  await wait(2500)

  const detail = page.locator('section.grid-two')
  const clickTab = async (name) => {
    const t = page.locator('button.tab', { hasText: new RegExp(`^${name}`, 'i') }).first()
    await t.scrollIntoViewIfNeeded()
    await t.click()
  }
  const setStatus = async (target) => {
    await clickTab('Details')
    await wait(1200)
    const sel = page.locator('label:has-text("Change status") select')
    await sel.scrollIntoViewIfNeeded()
    await sel.selectOption(target)
    await wait(600)
    await page.getByRole('button', { name: /Update Status/i }).click()
    await wait(2500)
  }
  // size the window so the sticky topbar plus the whole case-file workspace are
  // in frame, with the workspace aligned just below the topbar
  const captureDetail = async (name) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await wait(400)
    const headH = await page.evaluate(() => {
      const el = document.querySelector('header, .topbar')
      return el ? Math.ceil(el.getBoundingClientRect().height) : 72
    })
    const box = await detail.boundingBox()
    // standard widescreen: gives the two-column case grid room to lay out fully
    const width = 1920
    const height = Math.max(900, Math.min(2400, Math.ceil(box.height) + headH + 80))
    await page.setViewportSize({ width, height })
    await wait(500)
    await page.evaluate((offset) => {
      // undo any horizontal scroll left behind by scrollIntoView on the tabs
      document.querySelectorAll('*').forEach((el) => { if (el.scrollLeft) el.scrollLeft = 0 })
      const el = document.querySelector('section.grid-two')
      const y = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo(0, Math.max(0, y))
    }, headH + 16)
    await wait(600)
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
  }

  // if an earlier capture run left this case Under Review, reset it so the
  // shots show the natural pre-review state and a real Submitted transition
  const badge = detail.locator('.badge, [class*="status"]').first()
  const badgeText = (await badge.textContent().catch(() => '')) || ''
  if (/UnderReview|Under Review/i.test(badgeText)) {
    // legal transition chain back to Submitted: UnderReview -> InfoRequested -> Submitted
    await setStatus('InfoRequested')
    await setStatus('Submitted')
  }

  await clickTab('Details'); await wait(1200)
  await captureDetail('06-app-detail-details')
  await clickTab('Documents'); await wait(1800); await captureDetail('07-app-detail-documents')
  await clickTab('History'); await wait(1800); await captureDetail('08-app-detail-history')

  await setStatus('UnderReview')
  await clickTab('History'); await wait(1500)
  await captureDetail('09-app-status-updated')

  await context.close()
  await browser.close()
  console.log('Admin detail shots retaken into', SHOTS)
}
run().catch((e) => { console.error(e); process.exit(1) })
