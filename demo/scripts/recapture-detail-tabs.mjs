import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(__dirname, '..', 'admin', 'screenshots')
const BASE = process.env.ADMIN_URL || 'http://localhost:5175'
const EMAIL = 'admin@prdf.co.za'
const PASSWORD = 'DemoAdmin1!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// viewport (not fullPage) screenshots: the sticky header stays at the top of the frame
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })

const clickTab = async (page, name) => {
  const t = page.locator('button.tab', { hasText: new RegExp(`^${name}`, 'i') }).first()
  await t.scrollIntoViewIfNeeded()
  await t.click()
}

// scroll so the detail workspace heading sits just under the sticky header
async function focusDetail(page) {
  const tab = page.locator('button.tab').first()
  await tab.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, -80))
  await wait(600)
}

async function run() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()

  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {})
  await wait(2500)

  await page.goto(BASE + '/applications', { waitUntil: 'networkidle' })
  await wait(2500)

  // open the first case whose status badge reads "Submitted" so the
  // status-change capture (09) shows a real Submitted -> UnderReview move
  const rows = page.locator('table tbody tr')
  const n = await rows.count()
  let opened = false
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i)
    const status = (await row.textContent()) || ''
    if (/Submitted/i.test(status) && !/UnderReview/i.test(status)) {
      await row.locator('button.link-btn').click()
      opened = true
      break
    }
  }
  if (!opened) {
    console.error('No Submitted case found — opening the first row instead')
    await rows.first().locator('button.link-btn').click()
  }
  await wait(2200)

  await focusDetail(page)
  await shot(page, '06-app-detail-details')

  await clickTab(page, 'Documents')
  await wait(2000)
  await focusDetail(page)
  await shot(page, '07-app-detail-documents')

  await clickTab(page, 'History')
  await wait(2000)
  await focusDetail(page)
  await shot(page, '08-app-detail-history')

  await clickTab(page, 'Details')
  await wait(1400)

  const statusSelect = page.locator('label:has-text("Change status") select')
  await statusSelect.scrollIntoViewIfNeeded()
  await statusSelect.selectOption('UnderReview')
  await wait(800)
  await page.getByRole('button', { name: /Update Status/i }).click()
  await wait(2500)
  await clickTab(page, 'History')
  await wait(1500)
  await focusDetail(page)
  await shot(page, '09-app-status-updated')

  await context.close()
  await browser.close()
  console.log('Recaptured 06-09 into', SHOTS)
}
run().catch((e) => { console.error(e); process.exit(1) })
