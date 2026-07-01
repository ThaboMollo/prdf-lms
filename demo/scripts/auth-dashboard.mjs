import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const SHOTS = path.join(OUT, 'screenshots')
const VIDEO = path.join(OUT, 'video')
const BASE = process.env.BASE_URL || 'http://localhost:5174'
const EMAIL = 'thabo@brightfields.co.za'
const PASSWORD = 'DemoPassw0rd!'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
  console.log('  shot:', name)
}

async function run() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } },
  })
  const page = await context.newPage()

  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await wait(3500)

  for (const [route, name] of [
    ['/home', '18-home'],
    ['/status', '19-status'],
    ['/documents', '20-documents'],
    ['/loans', '21-loans'],
  ]) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {})
    await wait(3000)
    await shot(page, name)
    console.log('  landed:', page.url())
  }

  await context.close()
  await browser.close()
}
run().catch((e) => { console.error(e); process.exit(1) })
