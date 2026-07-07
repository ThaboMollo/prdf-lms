import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const FIX = path.join(OUT, 'fixtures')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fx = (n) => path.join(FIX, n)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()

await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill('thabo@brightfields.co.za')
await page.locator('input[type="password"]').fill('DemoPassw0rd!')
await page.getByRole('button', { name: /Sign In/i }).click()
await wait(3000)

await page.goto(BASE + '/apply', { waitUntil: 'networkidle' })
await wait(1500)
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
await page.getByRole('button', { name: /Continue/i }).click(); await wait(700)
await page.fill('#monthlyRevenue', '185000')
await page.fill('#yearsInOperation', '4')
await page.fill('#numberOfEmployees', '11')
await page.selectOption('#bankName', { index: 1 })
await page.getByRole('button', { name: /Continue/i }).click(); await wait(700)
await page.selectOption('#loanPurposeCategory', { index: 1 })
await page.fill('#purpose', 'Purchase two refrigerated delivery vehicles to expand distribution.')
await page.getByRole('button', { name: /Continue/i }).click(); await wait(700)
const files = page.locator('input[type="file"]')
await files.nth(0).setInputFiles(fx('id.pdf'))
await files.nth(1).setInputFiles(fx('proof.pdf'))
await files.nth(2).setInputFiles(fx('cipc.pdf'))
await files.nth(3).setInputFiles(fx('tax.pdf'))
await files.nth(4).setInputFiles([fx('bank1.pdf'), fx('bank2.pdf'), fx('bank3.pdf')])
await files.nth(5).setInputFiles(fx('financials.pdf'))
await wait(400)
await page.getByRole('button', { name: /Review Application/i }).click(); await wait(900)
await page.getByRole('button', { name: /Submit Application|Submit/i }).last().click()
await page.locator('.consent-card').waitFor({ state: 'visible', timeout: 8000 })
await wait(600)

// Report whether the modal fits within the viewport and the body scrolls.
const info = await page.evaluate(() => {
  const card = document.querySelector('.consent-card')
  const body = document.querySelector('.consent-body')
  const r = card.getBoundingClientRect()
  return {
    viewportH: window.innerHeight,
    cardTop: Math.round(r.top),
    cardBottom: Math.round(r.bottom),
    cardHeight: Math.round(r.height),
    fitsInViewport: r.top >= 0 && r.bottom <= window.innerHeight,
    bodyScrollable: body.scrollHeight > body.clientHeight + 1,
    footerVisible: !!document.querySelector('.consent-footer')?.getBoundingClientRect().bottom <= window.innerHeight,
  }
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: path.join(OUT, 'screenshots', 'consent-modal-fixed-top.png') }) // viewport only
// scroll the body to bottom and capture the footer/buttons
await page.evaluate(() => { const b = document.querySelector('.consent-body'); b.scrollTop = b.scrollHeight })
await wait(500)
await page.screenshot({ path: path.join(OUT, 'screenshots', 'consent-modal-fixed-bottom.png') })
await context.close()
await browser.close()
