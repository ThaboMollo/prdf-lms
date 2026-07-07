import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'admin')
const SHOTS = path.join(OUT, 'screenshots')
const BASE = process.env.ADMIN_URL || 'http://localhost:5175'
const EMAIL = 'admin@prdf.co.za'
const PASSWORD = 'DemoAdmin1!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })

// login
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(EMAIL)
await page.locator('input[type="password"]').fill(PASSWORD)
await page.getByRole('button', { name: /Sign In/i }).click()
await wait(4000)
await shot(page, '00-login-landing')
console.log('after login URL:', page.url())

for (const [route, name] of [
  ['/dashboard', '01-dashboard'],
  ['/applications', '02-applications'],
  ['/portfolio', '03-portfolio'],
  ['/reports', '04-reports'],
  ['/user-access', '05-user-access'],
]) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {})
  await wait(3500)
  await shot(page, name)
  console.log(name, '->', page.url())
}
console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : '(none)')
await context.close()
await browser.close()
