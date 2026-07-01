import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..')
const SHOTS = path.join(OUT, 'screenshots')
const VIDEO = path.join(OUT, 'video')
const BASE = process.env.BASE_URL || 'http://localhost:5174'

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

  // 1. Landing
  console.log('Landing')
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await wait(1200)
  await shot(page, '01-landing-hero')

  // Loan calculator interaction — drag the amount slider
  const amountSlider = page.locator('input[type="range"]').first()
  if (await amountSlider.count()) {
    await amountSlider.focus()
    for (let i = 0; i < 15; i++) { await page.keyboard.press('ArrowUp'); await wait(40) }
    await wait(600)
    await shot(page, '02-landing-calculator')
  }

  // Scroll through landing sections for the video
  const sections = ['#about', '#eligibility', '#how-it-works', '#support', '#documents']
  for (const s of sections) {
    const el = page.locator(s)
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded()
      await wait(900)
    }
  }
  await shot(page, '03-landing-full')
  await page.evaluate(() => window.scrollTo({ top: 0 }))
  await wait(600)

  // 2. Eligibility check
  console.log('Eligibility')
  await page.goto(BASE + '/eligibility', { waitUntil: 'networkidle' })
  await wait(1000)
  await shot(page, '04-eligibility-empty')

  // Tick all checkboxes progressively
  const boxes = page.locator('.elig-check-item__input')
  const count = await boxes.count()
  for (let i = 0; i < count; i++) {
    await boxes.nth(i).check({ force: true })
    await wait(120)
  }
  await wait(500)
  await shot(page, '05-eligibility-filled')

  // Submit -> result
  await page.getByRole('button', { name: /Check My Eligibility/i }).click()
  await page.waitForURL('**/eligibility/result', { timeout: 8000 }).catch(() => {})
  await wait(1200)
  await shot(page, '06-eligibility-result')

  // 3. Register
  console.log('Register')
  await page.goto(BASE + '/register', { waitUntil: 'networkidle' })
  await wait(900)
  await page.locator('input[autocomplete="given-name"]').fill('Thabo')
  await page.locator('input[autocomplete="family-name"]').fill('Mponya')
  await page.locator('input[autocomplete="tel"]').fill('+27 81 234 5678')
  await page.locator('input[type="email"]').fill('thabo@brightfields.co.za')
  await page.locator('input[type="password"]').fill('DemoPassw0rd!')
  await wait(500)
  await shot(page, '07-register')

  // 4. Login
  console.log('Login')
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await wait(900)
  await page.locator('input[type="email"]').fill('thabo@brightfields.co.za')
  await page.locator('input[type="password"]').fill('DemoPassw0rd!')
  await wait(500)
  await shot(page, '08-login')

  await context.close()
  await browser.close()
  console.log('Public journey done.')
}

run().catch((e) => { console.error(e); process.exit(1) })
