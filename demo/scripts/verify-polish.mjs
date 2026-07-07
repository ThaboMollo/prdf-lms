import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(__dirname, '..', 'screenshots')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const EMAIL = 'thabo@brightfields.co.za'
const PASSWORD = 'DemoPassw0rd!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `polish-${n}.png`), fullPage: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()
page.on('dialog', (d) => d.accept()) // accept the Discard confirm()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) })

async function login() {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await wait(3500)
}
await login()

// ---- A. Empty-draft guard: visit /apply, type nothing, leave. No draft should exist. ----
await page.goto(BASE + '/apply', { waitUntil: 'networkidle' })
await wait(3000)
await page.goto(BASE + '/status', { waitUntil: 'networkidle' })
await wait(1500)
console.log('A: empty-draft guard — visited /apply blank then left (DB checked in shell)')

// ---- B. Debounced autosave + saved indicator ----
await page.goto(BASE + '/apply', { waitUntil: 'networkidle' })
await wait(2500)
await page.fill('#businessName', 'Polish Test Traders (Pty) Ltd')
await page.selectOption('#industry', { index: 1 })
await page.fill('#registrationNo', '2023/555444/07')
// Do NOT click Continue — wait for the debounced autosave (~1.4s) to fire.
await wait(3000)
const indicator = await page.locator('.save-status').first().innerText().catch(() => '(none)')
const discardVisible = await page.getByRole('button', { name: /Discard draft/i }).count()
console.log('B: saved indicator text =', JSON.stringify(indicator))
console.log('B: discard button visible =', discardVisible)
await shot(page, '01-autosave-indicator')

// ---- C. Discard draft ----
await page.getByRole('button', { name: /Discard draft/i }).click()
await page.waitForURL('**/status', { timeout: 10000 }).catch(() => {})
await wait(2000)
console.log('C: after discard URL =', page.url())
const resumeAfter = await page.getByRole('link', { name: /Resume your draft/i }).count()
console.log('C: resume button after discard =', resumeAfter, '(expect 0)')
await shot(page, '02-after-discard')

console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : '(none)')
await context.close()
await browser.close()
