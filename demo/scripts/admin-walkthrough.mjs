import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'admin')
const SHOTS = path.join(OUT, 'screenshots')
const VIDEO = path.join(OUT, 'video', 'walkthrough')
const BASE = process.env.ADMIN_URL || 'http://localhost:5175'
const EMAIL = 'admin@prdf.co.za'
const PASSWORD = 'DemoAdmin1!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })

async function smoothScrollTo(page, y, ms = 1400) {
  await page.evaluate(async ({ y, ms }) => {
    const start = window.scrollY, dist = y - start, t0 = performance.now()
    await new Promise((res) => {
      function step(now) {
        const p = Math.min(1, (now - t0) / ms)
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
        window.scrollTo(0, start + dist * ease)
        if (p < 1) requestAnimationFrame(step); else res()
      }
      requestAnimationFrame(step)
    })
  }, { y, ms })
}
const clickTab = async (page, name) => {
  const t = page.locator('button.tab', { hasText: new RegExp(`^${name}`, 'i') }).first()
  if (await t.count()) { await t.scrollIntoViewIfNeeded(); await t.click() }
}

async function run() {
  const browser = await chromium.launch({ slowMo: 220 })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } },
  })
  const page = await context.newPage()

  // ---------- Login ----------
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await wait(1200)
  await page.locator('input[type="email"]').pressSequentially(EMAIL, { delay: 45 })
  await page.locator('input[type="password"]').pressSequentially(PASSWORD, { delay: 45 })
  await wait(500)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {})
  await wait(3000)

  // ---------- Dashboard ----------
  await smoothScrollTo(page, 300, 1000); await wait(1200)
  await smoothScrollTo(page, 0, 800); await wait(1000)

  // ---------- Applications: review workflow ----------
  await page.goto(BASE + '/applications', { waitUntil: 'networkidle' })
  await wait(2500)
  // filter to Submitted to show filtering
  await page.selectOption('select[aria-label="Filter by status"]', 'Submitted').catch(() => {})
  await wait(1800)
  await page.selectOption('select[aria-label="Filter by status"]', 'all').catch(() => {})
  await wait(1400)
  // open the first case
  const firstAction = page.locator('table tbody tr').first().locator('button.link-btn')
  if (await firstAction.count()) { await firstAction.click() }
  await wait(2200)
  // scroll to the detail workspace
  const tabsBar = page.locator('button.tab').first()
  if (await tabsBar.count()) { await tabsBar.scrollIntoViewIfNeeded() }
  await wait(1400)
  await shot(page, '06-app-detail-details')

  await clickTab(page, 'Documents'); await wait(2000); await shot(page, '07-app-detail-documents')
  await clickTab(page, 'History'); await wait(2000); await shot(page, '08-app-detail-history')
  await clickTab(page, 'Details'); await wait(1400)

  // change status Submitted -> UnderReview
  const statusSelect = page.locator('label:has-text("Change status") select')
  if (await statusSelect.count()) {
    await statusSelect.scrollIntoViewIfNeeded()
    await statusSelect.selectOption('UnderReview').catch(() => {})
    await wait(1200)
    const updateBtn = page.getByRole('button', { name: /Update Status/i })
    if (await updateBtn.count()) { await updateBtn.click(); await wait(2500) }
    await shot(page, '09-app-status-updated')
  }

  // ---------- Portfolio ----------
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle' })
  await wait(2600)

  // ---------- Reports & Analytics ----------
  await page.goto(BASE + '/reports', { waitUntil: 'networkidle' })
  await wait(2600)
  const h = await page.evaluate(() => document.body.scrollHeight)
  for (const frac of [0.2, 0.4, 0.6, 0.8, 1.0]) { await smoothScrollTo(page, h * frac, 1500); await wait(1200) }
  await smoothScrollTo(page, 0, 1200); await wait(1000)

  // ---------- User Access (RBAC) ----------
  await page.goto(BASE + '/user-access', { waitUntil: 'networkidle' })
  await wait(2600)
  const roleFilter = page.locator('select').nth(1)
  if (await roleFilter.count()) { await roleFilter.selectOption({ label: 'Admin' }).catch(() => {}); await wait(2000) }
  await smoothScrollTo(page, 400, 1200); await wait(1500)

  await context.close()
  await browser.close()
  console.log('Admin walkthrough recorded to', VIDEO)
}
run().catch((e) => { console.error(e); process.exit(1) })
