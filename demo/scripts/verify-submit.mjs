import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const SHOTS = path.join(OUT, 'screenshots')
const FIX = path.join(OUT, 'fixtures')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const EMAIL = 'thabo@brightfields.co.za'
const PASSWORD = 'DemoPassw0rd!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fx = (n) => path.join(FIX, n)
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`) })

// login
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(EMAIL)
await page.locator('input[type="password"]').fill(PASSWORD)
await page.getByRole('button', { name: /Sign In/i }).click()
await wait(3500)

// wizard
await page.goto(BASE + '/apply', { waitUntil: 'networkidle' })
await wait(2000)
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
for (const label of ['>50.1% Black Women Owned', 'Registered with CIPC', 'Directors are 100% Operational in the business']) {
  const cb = page.locator('label.terms-check', { hasText: label }).locator('input[type="checkbox"]')
  if (await cb.count()) await cb.first().check({ force: true })
}
await page.getByRole('button', { name: /Continue/i }).click(); await wait(1000)

await page.fill('#monthlyRevenue', '185000')
await page.fill('#yearsInOperation', '4')
await page.fill('#numberOfEmployees', '11')
await page.selectOption('#bankName', { index: 1 })
await page.getByRole('button', { name: /Continue/i }).click(); await wait(1000)

await page.selectOption('#loanPurposeCategory', { index: 1 })
await page.fill('#purpose', 'Purchase two refrigerated delivery vehicles to expand fresh-produce distribution across Gauteng.')
await page.getByRole('button', { name: /Continue/i }).click(); await wait(1000)

const files = page.locator('input[type="file"]')
await files.nth(0).setInputFiles(fx('id.pdf'))
await files.nth(1).setInputFiles(fx('proof.pdf'))
await files.nth(2).setInputFiles(fx('cipc.pdf'))
await files.nth(3).setInputFiles(fx('tax.pdf'))
await files.nth(4).setInputFiles([fx('bank1.pdf'), fx('bank2.pdf'), fx('bank3.pdf')])
await files.nth(5).setInputFiles(fx('financials.pdf'))
await wait(600)
await page.getByRole('button', { name: /Review Application/i }).click(); await wait(1200)

// submit + consent
await page.getByRole('button', { name: /Submit Application|Submit/i }).last().click()
await page.locator('.consent-card').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
const yes = page.locator('.consent-radio--yes input[type="radio"]')
const ny = await yes.count()
for (let i = 0; i < ny; i++) { await yes.nth(i).check({ force: true }); await wait(60) }
await page.getByRole('button', { name: /^Proceed$/i }).click()

// wait for outcome: navigate to /status (success) or inline error
let outcome = 'unknown'
try {
  await page.waitForURL('**/status', { timeout: 20000 })
  outcome = 'SUCCESS -> /status'
} catch {
  const err = await page.locator('.text-error, [role="alert"], .consent-error').allInnerTexts().catch(() => [])
  outcome = 'NO REDIRECT. inline: ' + JSON.stringify(err)
}
await wait(2500)
await shot(page, '17-apply-submitted')
console.log('OUTCOME:', outcome)
console.log('URL:', page.url())
console.log('ERRORS:\n' + (errors.length ? errors.join('\n') : '(none)'))

await context.close()
await browser.close()
