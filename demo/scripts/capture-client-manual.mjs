/**
 * Figure capture for docs/client-manual.html.
 *
 * render-client-manual.mjs has been telling people to run this script since it
 * was written; the file did not exist. The client figure set was taken by hand,
 * which is why it drifts from the product every time a label changes and why a
 * figure can only be refreshed by whoever still has the test account open.
 *
 * Mirrors demo/scripts/capture-admin-manual.mjs: one viewport, one scale, named
 * stages, and output filenames fixed to what the HTML already references so a
 * recapture never means editing src attributes.
 *
 * SAFETY: the Supabase project behind this also holds real applications. The
 * `wizard` stage writes a draft, so it refuses to run unless CLIENT_EMAIL is an
 * @prdf.test account. The `public` stage touches nothing and needs no sign-in.
 *
 * Usage:
 *   node scripts/capture-client-manual.mjs              # every stage
 *   node scripts/capture-client-manual.mjs public       # one stage
 *   node scripts/capture-client-manual.mjs public auth  # several
 *
 * Stages: public, auth, wizard, portal
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.join(ROOT, 'docs', 'screenshots', 'client-manual')

const CLIENT = process.env.CLIENT_URL || 'http://localhost:5174'
const CLIENT_EMAIL = process.env.CLIENT_EMAIL || 'client@prdf.test'
const PASSWORD = process.env.DEMO_PASSWORD || 'Prdf-Test-2026!'

// The existing figure set is 1389x868. Matching it keeps a recaptured figure
// visually identical in weight to the ones beside it that did not change —
// a document where every other figure is twice as sharp reads as a mistake.
const VIEWPORT = { width: 1389, height: 868 }
const SCALE = 1
const QUALITY = 72

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

fs.mkdirSync(OUT, { recursive: true })

function makeShooter(page) {
  return async function shot(name, opts = {}) {
    if (opts.full) await page.evaluate(() => window.scrollTo(0, 0))
    await wait(opts.settle ?? 900)
    await page.screenshot({
      path: path.join(OUT, `${name}.jpg`),
      type: 'jpeg',
      quality: QUALITY,
      fullPage: Boolean(opts.full),
    })
    console.log(`  ${name}.jpg`)
  }
}

async function signIn(context) {
  if (!CLIENT_EMAIL.endsWith('@prdf.test')) {
    throw new Error(
      `REFUSING TO RUN: CLIENT_EMAIL is "${CLIENT_EMAIL}", which is not an @prdf.test test account. ` +
        `This stage writes a draft application; it must not touch a real applicant.`,
    )
  }
  const page = await context.newPage()
  await page.goto(CLIENT + '/login', { waitUntil: 'networkidle' })
  await wait(900)
  await page.locator('input[type="email"]').first().fill(CLIENT_EMAIL)
  await page.locator('input[type="password"]').first().fill(PASSWORD)
  await page.getByRole('button', { name: /sign ?in/i }).first().click()
  await wait(4000)
  if (/\/login/.test(page.url())) throw new Error(`${CLIENT_EMAIL} did not get past /login`)
  return page
}

/**
 * The localStorage key supabase-js keeps its session under: `sb-<ref>-auth-token`,
 * where <ref> is the project subdomain. Derived from the same env var the app
 * builds its client from, so a project change cannot silently desync the two.
 */
function authStorageKey() {
  const url = process.env.VITE_SUPABASE_URL || readClientEnv('VITE_SUPABASE_URL')
  const ref = /https?:\/\/([^.]+)\./.exec(url || '')?.[1]
  if (!ref) throw new Error('Could not derive the Supabase project ref from VITE_SUPABASE_URL')
  return `sb-${ref}-auth-token`
}

function readClientEnv(name) {
  const envPath = path.join(ROOT, 'client-ui', '.env')
  if (!fs.existsSync(envPath)) return null
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith(name + '='))
  return line ? line.slice(name.length + 1).trim() : null
}

/**
 * Leave the signed-in client with no open draft.
 *
 * "Discard draft" goes through window.confirm, which blocks the page until it
 * is answered — so the handler is registered before the click, not after.
 */
async function discardAnyDraft(page) {
  await page.goto(CLIENT + '/apply', { waitUntil: 'networkidle' })
  // The button only appears once the wizard has fetched the existing draft and
  // re-rendered its header. A fixed sleep raced that and silently skipped the
  // discard, which is how two stray drafts were left behind — wait for the
  // element itself, and treat the timeout as "there was no draft".
  const discard = page.getByRole('button', { name: /Discard draft/i }).first()
  try {
    await discard.waitFor({ state: 'visible', timeout: 15_000 })
  } catch {
    console.log('  (no open draft to discard)')
    return false
  }
  page.once('dialog', (d) => d.accept())
  await discard.click()
  await wait(3000)
  // Confirm it actually went: a failed discard that reports success is worse
  // than one that reports failure, because the next run inherits the draft.
  const stillThere = await discard.isVisible().catch(() => false)
  if (stillThere) {
    console.warn('  (!) Discard draft did not take effect — remove the draft by hand')
    return false
  }
  console.log('  (discarded an open draft)')
  return true
}

const fx = (n) => path.join(ROOT, 'demo', 'fixtures', n)

const stages = {
  /**
   * Everything reachable without an account. No writes, no credentials — this
   * is the stage to run when all that changed is copy on a public page.
   */
  async public({ browser }) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
    const page = await ctx.newPage()
    const shot = makeShooter(page)

    await page.goto(CLIENT + '/', { waitUntil: 'networkidle' })
    await wait(1500)
    await shot('01-landing-and-calculator')

    await page.goto(CLIENT + '/eligibility', { waitUntil: 'networkidle' })
    await wait(1200)
    await shot('02-eligibility-checklist')

    await ctx.close()
  },

  /**
   * Registration and the password-reset flow. PRDF's reviewer asked for the
   * reset flow to be shown rather than described (v1.1, page 9) — §5.1 walks
   * through these three figures in order.
   */
  async auth({ browser }) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
    const page = await ctx.newPage()
    const shot = makeShooter(page)

    await page.goto(CLIENT + '/register', { waitUntil: 'networkidle' })
    await wait(1200)
    await shot('05-create-account')

    await page.goto(CLIENT + '/login', { waitUntil: 'networkidle' })
    await wait(1200)
    await shot('06-sign-in')

    // Step 1 of §5.1: the address is filled in, because the figure is showing
    // the reader what to do *before* clicking the link, not the empty page.
    await page.locator('input[type="email"]').first().fill('you@yourbusiness.co.za')
    await shot('06a-forgot-password', { settle: 500 })

    // Step 2: the confirmation. This sends a real reset email to whatever
    // address is in the box, which is why the address above is a placeholder
    // on a domain PRDF does not own rather than a live account.
    await page.getByRole('button', { name: /forgot your password/i }).first().click()
    await wait(2500)
    await shot('06b-reset-email-sent', { settle: 500 })

    // Step 3: the page the emailed link opens.
    //
    // Visiting /reset-password directly shows "Link no longer valid", which is
    // correct behaviour and the wrong figure. The real link carries a recovery
    // token in the URL fragment that auth-js exchanges for a short-lived
    // session before the page renders, and that token cannot be minted without
    // going through a mailbox.
    //
    // usePasswordRecovery only asks whether a session exists — it cannot tell a
    // recovery session from any other, by design (see its header). So a stub
    // session in the storage key auth-js reads puts the page in 'ready' and
    // renders the genuine form. Nothing is sent anywhere: the capture never
    // submits it, and the tokens below are not credentials.
    const stubPage = await ctx.newPage()
    await stubPage.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify({
        access_token: 'figure-capture-stub',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'figure-capture-stub',
        user: { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated', email: 'you@yourbusiness.co.za' },
      }))
    }, authStorageKey())
    await stubPage.goto(CLIENT + '/reset-password', { waitUntil: 'networkidle' })
    await wait(1800)
    const heading = (await stubPage.locator('h1').first().innerText().catch(() => '')).toLowerCase()
    if (heading.includes('no longer valid')) {
      throw new Error(
        'reset-password rendered the invalid-link state. The stub session was not picked up — ' +
        'check that VITE_SUPABASE_URL in client-ui/.env still matches the project ref this derives the storage key from.',
      )
    }
    await makeShooter(stubPage)('06c-reset-password')
    await stubPage.close()

    await ctx.close()
  },

  /**
   * The five wizard steps and the declaration.
   *
   * Writes a draft application, hence the @prdf.test guard in signIn(). The
   * draft is discarded at the end — the figures are the artefact, not the row.
   * Set KEEP_DRAFT=1 to leave it in place for the next recapture.
   */
  async wizard({ browser }) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
    const page = await signIn(ctx)
    const shot = makeShooter(page)

    // Typed rather than filled, at a visible rate: the header's "Saving…" and
    // "All changes saved" states are part of two figures, and they are driven
    // by a debounce that a single fill() never trips.
    const type = async (sel, text, delay = 25) => {
      await page.locator(sel).first().click()
      await page.locator(sel).first().fill('')
      await page.locator(sel).first().type(text, { delay })
    }

    // The portal allows one open draft per client and resumes it rather than
    // starting a new one. A half-finished draft from an earlier run would make
    // Figure 14 ("before uploading") show files and push the multi-file slots
    // past their expected count, so the stage always begins from nothing.
    await discardAnyDraft(page)

    await page.goto(CLIENT + '/apply', { waitUntil: 'networkidle' })
    await wait(2500)

    // --- Step 1: business and compliance profile ---
    await type('#businessName', 'Brightfields Trading (Pty) Ltd')
    await page.selectOption('#industry', { index: 1 })
    await type('#addressLine1', '12 Commissioner Street')
    await type('#city', 'Johannesburg')
    await page.selectOption('#province', { index: 1 })
    await page.selectOption('#gender', 'Female')
    await type('#saCitizenshipPercentage', '100', 50)
    await page.selectOption('#spatialType', 'Township')
    await type('#registrationNo', '2021/123456/07')
    await type('#sarsTaxPin', '1234567890')
    for (const label of ['>50.1% Black Women Owned', 'Registered with CIPC', 'Directors are 100% Operational in the business']) {
      const cb = page.locator('label.terms-check', { hasText: label }).locator('input[type="checkbox"]')
      if (await cb.count()) await cb.first().check({ force: true })
    }
    await wait(1400)
    await shot('07-step1-business-profile-top')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await shot('08-step1-compliance', { settle: 800 })
    await page.evaluate(() => window.scrollTo(0, 0))

    // --- Step 2: financials. The figure PRDF asked for — years AND months. ---
    await page.getByRole('button', { name: /Continue/i }).first().click()
    await wait(1800)
    await type('#monthlyRevenue', '185000')
    await type('#yearsInOperation', '4', 60)
    await type('#monthsInOperation', '6', 60)
    await type('#numberOfEmployees', '11', 60)
    await page.selectOption('#bankName', { index: 1 })
    await wait(1400)
    await shot('09-step2-financials')

    // --- Step 3: loan details. Typed to 50+ words so the counter reads green. ---
    await page.getByRole('button', { name: /Continue/i }).first().click()
    await wait(1800)
    await page.selectOption('#loanPurposeCategory', { index: 1 })
    await type(
      '#purpose',
      'We are funding a confirmed purchase order to supply forty tonnes of farmed abalone to an export buyer in ' +
      'Singapore. The money covers specialist feed for the grow-out period, grading and sorting labour at the ' +
      'packhouse, and cold-chain packaging for the shipment itself. We also need two refrigerated delivery ' +
      'vehicles to move the stock from our Gansbaai facility to the airport without breaking the cold chain, ' +
      'which is the single biggest risk to the order being accepted on arrival.',
      4,
    )
    await wait(1400)
    // Scrolled to the purpose box: the word counter is the point of this figure
    // and it sits below the fold at this viewport when the page is at the top.
    await page.locator('#purpose').scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, 120))
    await shot('10-step3-loan-details')

    // --- Step 4: documents, empty then filled. The 5 MB banner sits above both. ---
    await page.getByRole('button', { name: /Continue/i }).first().click()
    await wait(1800)
    await shot('11-step4-documents-empty')

    // Matched by slot label, not by index. Slot order comes from
    // document_requirements and is not guaranteed, and only the slots whose
    // requirement allows multiple files accept an array — indexing into the
    // inputs puts three bank statements into a single-file slot.
    const uploads = [
      ['ID Document', fx('id.pdf')],
      ['Proof of Address', fx('proof.pdf')],
      ['Company Registration', fx('cipc.pdf')],
      ['Tax Clearance', fx('tax.pdf')],
      ['Bank Statements', [fx('bank1.pdf'), fx('bank2.pdf'), fx('bank3.pdf')]],
      ['Financial Statements', fx('financials.pdf')],
      ['Vendor Quotations', [fx('quote1.pdf'), fx('quote2.pdf'), fx('quote3.pdf')]],
      ['Central Supplier Database', fx('csd.pdf')],
      ['Purchase Order', fx('po.pdf')],
      ['Trade Reference', fx('trade.pdf')],
    ]
    for (const [label, files] of uploads) {
      const slot = page.locator('.doc-slot', { hasText: label }).first()
      if (!(await slot.count())) continue
      const input = slot.locator('input[type="file"]').first()
      if (!(await input.count())) continue
      const multiple = await input.evaluate((el) => el.multiple)
      const payload = Array.isArray(files) ? (multiple ? files : files[0]) : files
      const present = Array.isArray(payload) ? payload : [payload]
      if (!present.every((f) => fs.existsSync(f))) {
        console.warn(`    (skipping ${label} — fixture missing)`)
        continue
      }
      await input.setInputFiles(payload)
      await wait(1800)
      console.log(`    uploaded ${label} (${present.length} file${present.length === 1 ? '' : 's'})`)
    }
    // Every upload goes to Supabase Storage through a signed URL, and the step
    // keeps "Review Application" disabled until the last one lands. Waiting on
    // the button's own enabled state rather than a fixed sleep — the uploads
    // take as long as the network takes.
    const toReview = page.getByRole('button', { name: /Review Application|Continue/i }).first()
    await toReview.waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll('button')].find((el) => /Review Application/i.test(el.textContent || ''))
        return Boolean(b) && !b.disabled
      },
      null,
      { timeout: 180_000, polling: 1000 },
    ).catch(async () => {
      const banner = await page.locator('.doc-progress-banner').innerText().catch(() => '(no banner)')
      const title = await page
        .getByRole('button', { name: /Review Application/i })
        .first()
        .getAttribute('title')
        .catch(() => null)
      throw new Error(
        `Step 4 never became ready. Banner: ${banner.replace(/\n/g, ' | ')} — button title: ${title}`,
      )
    })
    await shot('12-step4-documents-uploaded')

    // --- Step 5: review. Shows "4 years 6 months" and the renamed document. ---
    await toReview.click()
    await wait(1500)
    // Step 4 interposes an "All documents attached" confirmation before it
    // hands over to Review. Clicking through it rather than screenshotting it:
    // Figure 16 is the review screen, and the modal covers exactly the part of
    // it the caption talks about.
    const continueToReview = page.getByRole('button', { name: /Continue to review/i }).first()
    if (await continueToReview.count()) {
      await continueToReview.click()
      await wait(1200)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot('13-step5-review')

    // The declaration, opened but not answered. Submitting would advance a real
    // application; the figure only needs the modal as it first appears.
    await page.getByRole('button', { name: /Submit Application|^Submit$/i }).last().click()
    await page.locator('.consent-card').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    await wait(1600)
    await shot('14-consent-declaration')

    if (process.env.KEEP_DRAFT === '1') {
      console.log('  (KEEP_DRAFT=1 — leaving the draft in place)')
    } else {
      await page.keyboard.press('Escape')
      await wait(900)
      await discardAnyDraft(page)
    }

    await ctx.close()
  },

  /** Post-submission pages: dashboard, documents, status, loans. Read-only. */
  async portal({ browser }) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
    const page = await signIn(ctx)
    const shot = makeShooter(page)

    for (const [route, name, settle] of [
      ['/home', '15-home-dashboard', 1800],
      ['/documents', '16-documents-page', 2000],
      ['/status', '17-status-milestones', 2000],
      ['/loans', '19-my-loans', 1800],
    ]) {
      await page.goto(CLIENT + route, { waitUntil: 'networkidle' })
      await wait(settle)
      await shot(name)
    }

    await ctx.close()
  },
}

async function run() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const names = wanted.length ? wanted : ['public', 'auth', 'wizard', 'portal']
  for (const n of names) {
    if (!stages[n]) throw new Error(`Unknown stage "${n}". Known: ${Object.keys(stages).join(', ')}`)
  }

  // Real Chrome rather than bundled Chromium, matching capture-admin-manual:
  // Chromium ships no PDF viewer, so any inline document preview never paints
  // and its network never goes idle.
  const browser = await chromium.launch({ channel: 'chrome' })
  for (const name of names) {
    console.log(`\n== stage: ${name} ==`)
    await stages[name]({ browser })
  }
  await browser.close()
  console.log('\nFigures written to', path.relative(ROOT, OUT))
}

run().catch((e) => {
  console.error('\nCAPTURE FAILED:', e.message)
  process.exit(1)
})
