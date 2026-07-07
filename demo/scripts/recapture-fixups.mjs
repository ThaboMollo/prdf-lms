import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const CLIENT_SHOTS = path.join(OUT, 'screenshots')
const ADMIN_SHOTS = path.join(OUT, 'admin', 'screenshots')
const CLIENT = process.env.BASE_URL || 'http://localhost:5174'
const ADMIN = process.env.ADMIN_URL || 'http://localhost:5175'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function login(page, base, email, password) {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await wait(3500)
}

async function run() {
  const browser = await chromium.launch()

  /* ---- client: 09-apply-step1-empty, with draft resume suppressed ---- */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await login(page, CLIENT, 'thabo@brightfields.co.za', 'DemoPassw0rd!')
    // pretend there is no open draft so the wizard starts blank
    await page.route(/status=eq\.Draft/i, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        : route.continue()
    )
    await page.goto(CLIENT + '/apply', { waitUntil: 'networkidle' })
    await wait(2500)
    await page.evaluate(() => window.scrollTo(0, 0))
    await wait(400)
    await page.screenshot({ path: path.join(CLIENT_SHOTS, '09-apply-step1-empty.png'), fullPage: true })
    await context.close()
    console.log('client 09-apply-step1-empty recaptured')
  }

  /* ---- admin: full-window captures of the case-file workspace ---- */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await login(page, ADMIN, 'admin@prdf.co.za', 'DemoAdmin1!')

    await page.goto(ADMIN + '/applications', { waitUntil: 'networkidle' })
    await wait(2500)

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

    const detail = page.locator('section.grid-two')
    const clickTab = async (name) => {
      const t = page.locator('button.tab', { hasText: new RegExp(`^${name}`, 'i') }).first()
      await t.scrollIntoViewIfNeeded()
      await t.click()
    }
    // size the window so the whole case-file workspace fits below the sticky
    // topbar, then align the workspace just under it: a natural full-window view
    const captureDetail = async (name) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await wait(400)
      const box = await detail.boundingBox()
      const height = Math.max(900, Math.min(2400, Math.ceil(box.height) + 150))
      await page.setViewportSize({ width: 1440, height })
      await wait(500)
      await page.evaluate(() => {
        const el = document.querySelector('section.grid-two')
        const y = el.getBoundingClientRect().top + window.scrollY - 100
        window.scrollTo(0, Math.max(0, y))
      })
      await wait(600)
      await page.screenshot({ path: path.join(ADMIN_SHOTS, `${name}.png`) })
    }

    await captureDetail('06-app-detail-details')
    await clickTab('Documents'); await wait(1800); await captureDetail('07-app-detail-documents')
    await clickTab('History'); await wait(1800); await captureDetail('08-app-detail-history')
    await clickTab('Details'); await wait(1200)

    const statusSelect = page.locator('label:has-text("Change status") select')
    await statusSelect.scrollIntoViewIfNeeded()
    await statusSelect.selectOption('UnderReview')
    await wait(600)
    await page.getByRole('button', { name: /Update Status/i }).click()
    await wait(2500)
    await clickTab('History'); await wait(1500)
    await captureDetail('09-app-status-updated')

    await context.close()
    console.log('admin 06-09 recaptured as full-window workspace views')
  }

  await browser.close()
}
run().catch((e) => { console.error(e); process.exit(1) })
