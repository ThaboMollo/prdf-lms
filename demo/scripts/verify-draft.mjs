import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(__dirname, '..', 'screenshots')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const EMAIL = 'thabo@brightfields.co.za'
const PASSWORD = 'DemoPassw0rd!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `draft-${name}.png`), fullPage: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('supabase')) errs.push(`http ${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`) })

// login
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(EMAIL)
await page.locator('input[type="password"]').fill(PASSWORD)
await page.getByRole('button', { name: /Sign In/i }).click()
await wait(3500)

// fresh apply (clear any ?draft); fill step 1
await page.goto(BASE + '/apply', { waitUntil: 'networkidle' })
await wait(2500)
await page.fill('#businessName', 'Draft Test Traders (Pty) Ltd')
await page.selectOption('#industry', { index: 2 })
await page.fill('#addressLine1', '99 Draft Avenue')
await page.fill('#city', 'Pretoria')
await page.selectOption('#province', { index: 1 })
await page.selectOption('#gender', 'Female')
await page.fill('#saCitizenshipPercentage', '100')
await page.selectOption('#spatialType', 'City')
await page.fill('#registrationNo', '2022/999888/07')
await page.fill('#sarsTaxPin', '9988776655')
await page.getByRole('button', { name: /Continue/i }).click()
await wait(1500)
// step 2
await page.fill('#monthlyRevenue', '333000')
await page.fill('#yearsInOperation', '6')
await page.fill('#numberOfEmployees', '9')
await page.selectOption('#bankName', { index: 3 })
await wait(600)
// Save & finish later from step 2
await page.getByRole('button', { name: /Save & finish later/i }).click()
await page.waitForURL('**/status**', { timeout: 15000 }).catch(() => {})
await wait(2500)
await shot(page, '01-saved-status')
console.log('after save URL:', page.url())

// Resume from status
const resume = page.getByRole('link', { name: /Resume your draft/i }).first()
const hasResume = await resume.count()
console.log('resume button present:', hasResume)
if (hasResume) {
  await resume.click()
  await wait(3500)
  await shot(page, '02-resumed')
  console.log('resumed URL:', page.url())
  // Resume lands on the saved step (step 2). Assert financials are rehydrated.
  const fin = await page.evaluate(() => {
    const v = (id) => document.getElementById(id)?.value ?? null
    return {
      monthlyRevenue: v('monthlyRevenue'),
      yearsInOperation: v('yearsInOperation'),
      numberOfEmployees: v('numberOfEmployees'),
      bankName: v('bankName'),
    }
  })
  console.log('restored step2 (on resume):', JSON.stringify(fin))
  // Go Back to step 1 and assert the business profile is rehydrated.
  const back = page.getByRole('button', { name: /Back/i }).first()
  if (await back.count()) {
    await back.click(); await wait(1200)
    const s1 = await page.evaluate(() => {
      const v = (id) => document.getElementById(id)?.value ?? null
      return { businessName: v('businessName'), registrationNo: v('registrationNo'), sarsTaxPin: v('sarsTaxPin') }
    })
    console.log('restored step1 (Back):', JSON.stringify(s1))
  }
}

console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : '(none)')
await context.close()
await browser.close()
