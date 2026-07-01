import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const SHOTS = path.join(OUT, 'screenshots')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill('thabo@brightfields.co.za')
await page.locator('input[type="password"]').fill('DemoPassw0rd!')
await page.getByRole('button', { name: /Sign In/i }).click()
await wait(3500)

await page.goto(BASE + '/loans', { waitUntil: 'networkidle' })
await wait(3000)
await page.screenshot({ path: path.join(SHOTS, '22-loans-active.png'), fullPage: true })
console.log('shot 22-loans-active')

// open the loan detail
const card = page.locator('a[href^="/loans/"], .loan-card, [class*="loan"]').first()
if (await card.count()) {
  await card.click().catch(() => {})
  await wait(3000)
  await page.screenshot({ path: path.join(SHOTS, '23-loan-details.png'), fullPage: true })
  console.log('shot 23-loan-details at', page.url())
}
await context.close()
await browser.close()
