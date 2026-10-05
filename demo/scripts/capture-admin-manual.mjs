/**
 * Figure capture for docs/admin-manual.html.
 *
 * Runs two browser contexts at once — admin@prdf.test in one, client@prdf.test
 * in the other — so a figure pair can show an admin action and its consequence
 * on the applicant's screen from the same moment in time. That pairing is the
 * whole point of sections 21 and 22 of the manual, and it cannot be faked by
 * capturing the two sides on different days against different data.
 *
 * The figure set before this script was taken by hand (1512x812, 1440x757 and
 * 1367x896 all appear in the same document), which is also why the PDF drifted
 * away from the product. Everything here is one viewport at one scale factor.
 *
 * SAFETY: the Supabase project behind this also holds real applications. Every
 * application this script writes to is checked against auth.users.email first
 * and the run aborts unless it belongs to an @prdf.test account. Read-only
 * pages are unrestricted; writes are not. Do not remove assertDemoOnly.
 *
 * Usage:
 *   node scripts/capture-admin-manual.mjs              # every stage
 *   node scripts/capture-admin-manual.mjs console      # one stage
 *   node scripts/capture-admin-manual.mjs console docs # several
 *
 * Stages: signin, console, lifecycle, money, requests, mirror, clientviews, loanphase
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import dotenv from '../../backend-node/node_modules/dotenv/lib/main.js'
import pg from '../../backend-node/node_modules/pg/lib/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.join(ROOT, 'docs', 'screenshots', 'admin-manual')

dotenv.config({ path: path.join(ROOT, 'backend-node', '.env') })

const ADMIN = process.env.ADMIN_URL || 'http://localhost:5175'
const CLIENT = process.env.CLIENT_URL || 'http://localhost:5174'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@prdf.test'
const CLIENT_EMAIL = process.env.CLIENT_EMAIL || 'client@prdf.test'
const PASSWORD = process.env.DEMO_PASSWORD || 'Prdf-Test-2026!'

// superadmin@prdf.test carries a TOTP factor and stops at the two-factor
// challenge, so capture signs in as Admin. The screens below are identical for
// both; the SuperAdmin-only differences are described in text, not shown.
const VIEWPORT = { width: 1440, height: 900 }
// 1.25x of a 1440 viewport is 1800px wide, which is about 250 DPI across the
// printed A4 text column — sharp in print and on screen. Capturing at 2x
// instead produced a 14 MB figure set and a 13.8 MB PDF for no visible gain.
const SCALE = 1.25
const QUALITY = 62

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// The cases this run drives, by stage. Assigned rather than discovered so the
// same application always illustrates the same figure across recaptures.
// ---------------------------------------------------------------------------
const APPS = {
  screening:     '12a9c446', // Blue Harvest Aquaculture — also the document-request hero
  dueDiligence:  '01f468c0', // Kagiso Agri Supplies
  evaluation:    'a1c1713f', // Marine Logistics SA
  advancing:     'df8654fe', // Naledi Construction — walked to Approved then Contracting
  boardApproved: '6f01c3c2', // Bongani Trading Enterprise
  disbursed:     '0ddc6cd0', // Blue Harvest — funded, carries the repayment schedule
}

/**
 * Abort unless every application this run will write to belongs to a test
 * account. The project holds live applications on real gmail.com addresses;
 * advancing one of those to Contracting or booking a repayment against it
 * would be a production incident, not a documentation bug.
 */
async function assertDemoOnly(prefixes) {
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  const resolved = {}
  try {
    for (const prefix of prefixes) {
      const { rows } = await client.query(
        `select la.id, u.email
           from public.loan_applications la
           join public.clients cl on cl.id = la.client_id
           left join auth.users u on u.id = cl.user_id
          where la.id::text like $1`,
        [prefix + '%'],
      )
      if (rows.length !== 1) {
        throw new Error(`Application prefix ${prefix} matched ${rows.length} rows; expected exactly 1`)
      }
      const { id, email } = rows[0]
      if (!email || !email.endsWith('@prdf.test')) {
        throw new Error(
          `REFUSING TO RUN: application ${prefix} belongs to ${email || 'an account with no email'}, ` +
          `which is not an @prdf.test test account.`,
        )
      }
      resolved[prefix] = id
    }
  } finally {
    await client.end()
  }
  return resolved
}

/**
 * Clear document requests on a case before the run raises a fresh one.
 *
 * Re-running the capture would otherwise stack requests: the unique index only
 * prevents a second open request per *checklist* type, and 'Other' is
 * deliberately exempt because two differently-named documents are a legitimate
 * pair. Correct for the product, wrong for a figure that should show one ask.
 *
 * Takes a resolved id that assertDemoOnly has already vouched for.
 */
async function resetRequests(applicationId) {
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const { rowCount } = await client.query(
      `delete from public.document_requests
        where application_id = $1
          and application_id in (
            select la.id from public.loan_applications la
            join public.clients cl on cl.id = la.client_id
            join auth.users u on u.id = cl.user_id
           where u.email like '%@prdf.test'
          )`,
      [applicationId],
    )
    if (rowCount) console.log(`  (cleared ${rowCount} existing request(s) on this case)`)
  } finally {
    await client.end()
  }
}

// ---------------------------------------------------------------------------
// Capture helpers
// ---------------------------------------------------------------------------
/**
 * Block until .global-loader has been absent continuously, not merely absent
 * once.
 *
 * Waiting for a single "detached" moment is not enough: the Documents tab
 * fires a fresh signed-URL query (about three seconds against Supabase
 * storage) each time a document is selected, and GlobalLoader remounts the
 * instant any query has data === undefined. A wait that happens to land in the
 * gap between two queries returns, and the overlay is back over the page
 * before the shutter. Three consecutive clear polls means it has actually
 * settled.
 */
async function waitForStillness(page, { quietMs = 1200, timeoutMs = 30000 } = {}) {
  const step = 400
  const needed = Math.ceil(quietMs / step)
  const deadline = Date.now() + timeoutMs
  let clear = 0
  while (Date.now() < deadline) {
    const busy = await page.locator('.global-loader').count().catch(() => 0)
    clear = busy ? 0 : clear + 1
    if (clear >= needed) return true
    await wait(step)
  }
  console.warn(`    (overlay never settled within ${timeoutMs}ms — shooting anyway)`)
  return false
}

function makeShooter(page, label) {
  return async function shot(name, opts = {}) {
    if (opts.full) await page.evaluate(() => window.scrollTo(0, 0))
    if (opts.allowOverlay !== true) await waitForStillness(page)
    await wait(opts.settle ?? 700)
    await page.screenshot({
      path: path.join(OUT, `${name}.jpg`),
      type: 'jpeg',
      quality: QUALITY,
      fullPage: Boolean(opts.full),
    })
    console.log(`  [${label}] ${name}.jpg`)
  }
}

async function signIn(context, baseUrl, email) {
  const page = await context.newPage()
  await page.goto(baseUrl + '/login', { waitUntil: 'networkidle' })
  await wait(900)
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(PASSWORD)
  await page.getByRole('button', { name: /sign ?in/i }).first().click()
  await wait(4000)
  if (/\/login/.test(page.url())) throw new Error(`${email} did not get past /login`)
  if (/two-factor|authenticator/i.test(await page.locator('body').innerText())) {
    throw new Error(`${email} is enrolled in MFA and cannot be driven headlessly`)
  }
  return page
}

/**
 * Wait until the screen has stopped moving.
 *
 * Several tabs render a "Loading …" placeholder behind a dimming overlay while
 * their query is in flight, and the document preview fetches a signed URL
 * before the PDF paints. A screenshot taken during that shows a spinner over a
 * greyed page instead of the screen the figure is supposed to document — which
 * is how the first run produced an unusable figure 6.
 */
async function quiet(page, extra = 900) {
  await page.waitForLoadState('networkidle').catch(() => {})
  // packages/ui-kit/components/GlobalLoader.tsx mounts .global-loader whenever
  // any React Query has data === undefined, so this one element covers every
  // in-flight first load on the page.
  await page
    .locator('.global-loader')
    .waitFor({ state: 'detached', timeout: 25000 })
    .catch(() => {})
  await page
    .getByText(/loading (preview|documents)/i)
    .first()
    .waitFor({ state: 'detached', timeout: 25000 })
    .catch(() => {})
  await wait(extra)
}

/** Put the case-file heading just under the sticky topbar. */
async function focusCase(page) {
  const tab = page.locator('button.tab').first()
  if (await tab.count()) {
    await tab.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -140))
  }
  await wait(500)
}

async function openCase(page, appId) {
  await page.goto(`${ADMIN}/case/${appId}`, { waitUntil: 'networkidle' })
  await quiet(page, 1400)
}

/** The loan booked against an application, so figures can open it directly
 *  instead of clicking whatever happens to be first in My Loans — which is
 *  another client's undisbursed loan with no schedule and no history. */
async function loanIdFor(applicationId) {
  const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    const { rows } = await c.query(
      'select id from public.loans where application_id = $1 order by created_at limit 1',
      [applicationId],
    )
    return rows[0]?.id ?? null
  } finally {
    await c.end()
  }
}

/** Read a case's real status. The page cannot be scraped for it — the
 *  lifecycle rail prints all eleven stage names, so any text match hits. */
async function readStatus(applicationId) {
  const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    const { rows } = await c.query('select status from public.loan_applications where id = $1', [applicationId])
    return rows[0]?.status ?? null
  } finally {
    await c.end()
  }
}

/**
 * Move a case to `target` and confirm it landed.
 *
 * The status control is a <select> *inside* its <label>, not a sibling of it,
 * so `label ~ select` silently matches nothing. An earlier version swallowed
 * that with .catch() and captured two figures showing the wrong stage. This
 * one reads the status back out of the database and throws if it did not move.
 */
async function setStatus(page, appId, target, note) {
  const before = await readStatus(appId)
  if (before === target) {
    console.log(`  (${appId.slice(0, 8)} already at ${target})`)
    return
  }

  await openCase(page, appId)
  const select = page.locator('label:has-text("Change status") select').first()
  await select.waitFor({ timeout: 10000 })
  const options = (await select.locator('option').allTextContents()).filter(Boolean)
  if (!options.includes(target)) {
    throw new Error(
      `Cannot move ${appId.slice(0, 8)} from ${before} to ${target}; offered: ${options.join(', ')}`,
    )
  }
  await select.selectOption(target)
  if (note) await page.locator('input[placeholder="Optional note"]').first().fill(note)
  await page.getByRole('button', { name: /^Update status$/i }).click()
  await quiet(page, 4000)

  const after = await readStatus(appId)
  if (after !== target) throw new Error(`${appId.slice(0, 8)}: ${before} -> ${target} did not take (still ${after})`)
  console.log(`  ${appId.slice(0, 8)}: ${before} -> ${after}`)
}

async function clickTab(page, name) {
  const tab = page.locator('button.tab', { hasText: new RegExp(`^\\s*${name}`, 'i') }).first()
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
  await quiet(page, 1200)
}

export { APPS, assertDemoOnly, makeShooter, signIn, focusCase, openCase, clickTab, quiet, waitForStillness, wait }
export { ADMIN, CLIENT, ADMIN_EMAIL, CLIENT_EMAIL, VIEWPORT, SCALE, OUT }

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
const stages = {}

/** 1-5, 20-27: the screens that need no case walked anywhere. */
stages.console = async ({ admin, shotA }) => {
  await admin.goto(ADMIN + '/dashboard', { waitUntil: 'networkidle' })
  await wait(2600)
  await shotA('02-dashboard')

  await admin.goto(ADMIN + '/pipeline', { waitUntil: 'networkidle' })
  await wait(2400)
  await shotA('03-pipeline')

  // Pipeline rows are buttons in a list, not table rows — clicking one opens
  // the preview drawer over the list, which is what figure 4 shows.
  const row = admin.locator('button.queue-row').first()
  await row.waitFor({ timeout: 10000 })
  await row.click()
  await wait(2200)
  await shotA('04-case-preview')
  await admin.keyboard.press('Escape')
  await wait(700)

  await admin.goto(ADMIN + '/loans', { waitUntil: 'networkidle' })
  await wait(2200)
  await shotA('23-loans')

  await admin.goto(ADMIN + '/portfolio', { waitUntil: 'networkidle' })
  await wait(2400)
  await shotA('24-portfolio')

  await admin.goto(ADMIN + '/reports', { waitUntil: 'networkidle' })
  await wait(4500)
  await shotA('25-reports', { full: true })

  await admin.goto(ADMIN + '/user-access', { waitUntil: 'networkidle' })
  await wait(2400)
  // The User Access list is the one screen in the console that shows real
  // people's names, email addresses and account ids. The figure name has
  // always said "masked"; until 2026-10-01 nothing actually masked it, and a
  // PDF went out carrying 11 live addresses. Mask in the page before the
  // screenshot is taken, so the unredacted pixels never reach disk, and trim
  // to four rows (PRDF review: "only 4 will suffice").
  await admin.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'))
    rows.forEach((row, i) => {
      if (i >= 4) { row.remove(); return }
      const cells = row.querySelectorAll('td')
      if (cells[0]) cells[0].textContent = '[name withheld]'
      if (cells[1]) cells[1].textContent = '[email withheld]'
    })
  })
  await wait(400)
  await shotA('26-user-access-masked', { full: true })

  await admin.goto(ADMIN + '/profile', { waitUntil: 'networkidle' })
  await wait(2000)
  await shotA('27-my-profile')
}

/** 5-13, 19-22: the case file and its tabs, plus the lifecycle rail by stage. */
stages.lifecycle = async ({ admin, shotA, ids }) => {
  await openCase(admin, ids[APPS.screening])
  await focusCase(admin)
  await shotA('05-case-overview')
  await shotA('09-stage-screening')

  await clickTab(admin, 'Documents')
  await focusCase(admin)
  await shotA('06-documents-verify')

  await clickTab(admin, 'History')
  await focusCase(admin)
  await shotA('19-history-audit-trail')

  await clickTab(admin, 'Tasks')
  await focusCase(admin)
  await shotA('20-tasks')

  await clickTab(admin, 'Notes')
  await focusCase(admin)
  await shotA('21-notes')

  await clickTab(admin, 'Advisory')
  await focusCase(admin)
  await shotA('22-advisory-nfs')

  await clickTab(admin, 'Pricing')
  await focusCase(admin)
  await shotA('12-pricing-ungraded')

  await openCase(admin, ids[APPS.dueDiligence])
  await focusCase(admin)
  await shotA('10-stage-due-diligence')

  await openCase(admin, ids[APPS.evaluation])
  await focusCase(admin)
  await shotA('11-stage-evaluation')
  await clickTab(admin, 'Pricing')
  await focusCase(admin)
  await shotA('13-pricing-graded-quote')

  await openCase(admin, ids[APPS.boardApproved])
  await focusCase(admin)
  await shotA('15-stage-board-approved')
  await shotA('08-assign-and-advance')
}

/** 17-18: the Money tab on a funded loan. */
stages.money = async ({ admin, shotA, ids }) => {
  await openCase(admin, ids[APPS.boardApproved])
  await clickTab(admin, 'Money')
  await focusCase(admin)
  await shotA('17-money-before-disbursement')

  await openCase(admin, ids[APPS.disbursed])
  await clickTab(admin, 'Money')
  await focusCase(admin)
  await shotA('18-money-disbursed-bullet')
}

/** 1: the sign-in screen, which has to come from a context with no session. */
stages.signin = async ({ browser }) => {
  const fresh = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  const page = await fresh.newPage()
  const shot = makeShooter(page, 'anon')
  await page.goto(ADMIN + '/login', { waitUntil: 'networkidle' })
  await wait(1600)
  await shot('01-sign-in')
  await fresh.close()
}


// ---------------------------------------------------------------------------
// Sections 9.4, 21 and 22 — the paired figures.
//
// These mutate demo data, which is what makes the pairing real. Where a state
// can be restored it is (Screening -> InfoRequested -> Screening); where a
// transition is one-way the application is left in its new state and the
// comment says so, because LOAN_STATUS_TRANSITIONS has no path back.
// ---------------------------------------------------------------------------

/** 9.4: raising a document request, and the case once it is outstanding. */
stages.requests = async ({ admin, shotA, ids }) => {
  await resetRequests(ids[APPS.screening])
  await openCase(admin, ids[APPS.screening])
  await clickTab(admin, 'Documents')

  await admin.getByRole('button', { name: /^Request document$/i }).click()
  await admin.locator('#doc-request-docType').waitFor({ timeout: 10000 })
  await admin.locator('#doc-request-docType').selectOption('Other')
  await wait(400)
  await admin.locator('#doc-request-customName').fill('Signed lease agreement')
  await admin.locator('#doc-request-details').fill(
    'From your municipality, dated within the last 3 months.',
  )
  await admin.locator('#doc-request-fileType').selectOption('pdf')
  await wait(500)
  await shotA('28-request-document-modal')

  await admin.getByRole('button', { name: /^Send request$/i }).click()
  await quiet(admin, 2000)
  await focusCase(admin)
  await shotA('29-request-pending')
}

/** 21.1-21.2: the applicant's side of a request, and of verify / reject. */
stages.mirror = async ({ admin, shotA, client, shotC, ids }) => {
  const app = ids[APPS.screening]

  // --- 21.1 the ask, as the applicant sees it
  await client.goto(CLIENT + '/status', { waitUntil: 'networkidle' })
  await quiet(client, 1500)
  const ask = client.locator('.doc-request-item__summary').first()
  if (await ask.count()) {
    await ask.click()          // open the upload box so the figure shows it
    await wait(900)
    await ask.scrollIntoViewIfNeeded()
    await client.evaluate(() => window.scrollBy(0, -160))
  }
  await shotC('31-client-status-requested')

  // --- the applicant answers it
  const drop = client.locator('input[type="file"]').first()
  if (await drop.count()) {
    await drop.setInputFiles(path.join(ROOT, 'demo', 'fixtures', 'sample.pdf'))
    await wait(1200)
    const send = client.getByRole('button', { name: /^Upload document$/i }).first()
    if (await send.count()) {
      await send.click()
      await quiet(client, 4000)
    }
  }

  // --- 21.1 (second figure) the request, now satisfied, on your side
  await openCase(admin, app)
  await clickTab(admin, 'Documents')
  await focusCase(admin)
  await shotA('30-request-fulfilled')

  // --- 21.2 verify one document and reject another, so the applicant's
  // Documents page carries both badges at once. One figure showing the two
  // side by side says more than two figures of the same page.
  const chips = admin.locator('.doc-chips [role="option"], .doc-chips button')
  const chipCount = await chips.count()

  if (chipCount) {
    await chips.nth(0).click()
    await quiet(admin, 1500)
    const verify = admin.getByRole('button', { name: /^Verify$/i }).first()
    if (await verify.count()) { await verify.click(); await quiet(admin, 2500) }
  }
  if (chipCount > 1) {
    await chips.nth(1).click()
    await quiet(admin, 1500)
    const reject = admin.getByRole('button', { name: /^Reject$/i }).first()
    if (await reject.count()) { await reject.click(); await quiet(admin, 2500) }
  }

  // The portal's Documents page keeps its own application picker and does not
  // default to the case being worked on, so it has to be pointed at it.
  await client.goto(CLIENT + '/documents', { waitUntil: 'networkidle' })
  await quiet(client, 1800)
  const picker = client.locator('select').first()
  if (await picker.count()) {
    await picker.selectOption({ value: app }).catch(() => {})
    await quiet(client, 2000)
  }
  await shotC('32-client-doc-badges')

  // 21.4's approved figure belongs to the `approve` stage, which is the only
  // one that can put a case into Approved (both gates have to be satisfied).
}

/**
 * 10 / 21.4: an application at Approved, on both sides.
 *
 * No case sat at Approved, and none of the seeded ones could be moved there
 * without a one-way transition: LOAN_STATUS_TRANSITIONS allows Evaluation ->
 * Approved but nothing back. This stage therefore spends the Evaluation case
 * assigned to APPS.advancing and leaves it at Approved permanently. A later
 * recapture needs a different case here, or a reseed.
 */
stages.approve = async ({ admin, shotA, client, shotC, ids }) => {
  const app = ids[APPS.advancing]

  // Approval has two gates, both documented in this manual and both real:
  // every required document must be Verified (9.2), and the case must carry a
  // saved risk grade (11.2). A capture run has to satisfy them the same way a
  // reviewer would.
  await openCase(admin, app)
  await clickTab(admin, 'Documents')
  const chips = admin.locator('.doc-chips [role="option"]')
  // quiet() clears the overlay but the tab's own content mounts after it, so
  // counting straight away reports zero chips and silently verifies nothing.
  await chips.first().waitFor({ timeout: 20000 })
  const total = await chips.count()
  let verified = 0
  for (let i = 0; i < total; i++) {
    await chips.nth(i).click()
    await quiet(admin, 1200)
    const verify = admin.getByRole('button', { name: /^Verify$/i }).first()
    if (await verify.count()) {
      await verify.click()
      await quiet(admin, 2200)
      verified++
    }
  }
  console.log(`  verified ${verified}/${total} documents`)

  await clickTab(admin, 'Pricing')
  const gradeSelect = admin.locator('label:has-text("Risk grade") select').first()
  if (await gradeSelect.count()) {
    await gradeSelect.selectOption({ index: 1 }).catch(() => {})
    await wait(500)
    const saveGrade = admin.getByRole('button', { name: /^Save (risk )?grade$/i }).first()
    if (await saveGrade.count() && await saveGrade.isEnabled()) {
      await saveGrade.click()
      await quiet(admin, 2500)
      console.log('  risk grade saved')
    }
  }

  await setStatus(admin, app, 'Approved', 'Approved at committee — proceeding to Board.')

  await openCase(admin, app)
  await focusCase(admin)
  await shotA('14-stage-approved')

  await client.goto(CLIENT + '/status', { waitUntil: 'networkidle' })
  await quiet(client, 2000)
  await shotC('35-client-status-approved', { full: true })
}

/** Put the hero case back to Screening after 21.3 borrowed it for InfoRequested. */
stages.restore = async ({ admin, ids }) => {
  await setStatus(admin, ids[APPS.screening], 'Screening', 'Returned to screening.')
}

/**
 * 21.3: the "Action required" block, which only Info Requested produces.
 *
 * The applicant's status page lists every application they have, so a plain
 * screenshot catches whichever card happens to be at the top — that is how an
 * earlier run produced a figure of a Disbursed application under a caption
 * about Info Requested. This one scrolls to the block by its text.
 *
 * Screening -> InfoRequested -> Screening is a legal round trip, so the case
 * is put back afterwards.
 */
stages.inforequested = async ({ admin, client, shotC, ids }) => {
  const app = ids[APPS.screening]

  await openCase(admin, app)
  await admin.locator('input[placeholder="What is missing?"]').first()
    .fill('Please send the August bank statement — the copy we have is unreadable.')
  await admin.getByRole('button', { name: /^Request more info$/i }).click()
  await quiet(admin, 3500)
  if ((await readStatus(app)) !== 'InfoRequested') throw new Error('Case did not move to InfoRequested')

  await client.goto(CLIENT + '/status', { waitUntil: 'networkidle' })
  await quiet(client, 2000)
  const block = client.getByText(/Action required/i).first()
  await block.waitFor({ timeout: 15000 })
  await block.scrollIntoViewIfNeeded()
  await client.evaluate(() => window.scrollBy(0, -150))
  await wait(800)
  await shotC('34-client-status-inforequested')

  await setStatus(admin, app, 'Screening', 'Returned to screening.')
}

/**
 * 7 and 16: a verified document, and a case at Contracting.
 *
 * Runs after `approve`, which is what leaves a case with every document
 * verified. Contracting needs the Board Approved case moved on, which is
 * one-way — figure 15 has to be captured before this stage, not after.
 */
stages.remaining = async ({ admin, shotA, ids }) => {
  await openCase(admin, ids[APPS.advancing])
  await clickTab(admin, 'Documents')
  const chips = admin.locator('.doc-chips [role="option"]')
  await chips.first().waitFor({ timeout: 20000 })
  await chips.first().click()
  await quiet(admin, 1500)
  await focusCase(admin)
  await shotA('07-document-verified')

  await setStatus(admin, ids[APPS.boardApproved], 'Contracting', 'Board approved — drawing the agreement.')
  await openCase(admin, ids[APPS.boardApproved])
  await focusCase(admin)
  await shotA('16-stage-contracting')
}

/** 20: the applicant's applications list and read-only review. */
stages.clientviews = async ({ client, shotC }) => {
  await client.goto(CLIENT + '/applications', { waitUntil: 'networkidle' })
  await quiet(client, 1800)
  await shotC('36-client-applications-list')

  const first = client.locator('table tbody tr, .list-clean li').first()
  if (await first.count()) {
    const link = first.locator('a, button').first()
    if (await link.count()) { await link.click(); await quiet(client, 2500) }
  }
  await shotC('37-client-application-readonly', { full: true })
}

/** 22: the loan phase — funded home, My Loans, the account, and a repayment. */
stages.loanphase = async ({ admin, shotA, client, shotC, ids }) => {
  await client.goto(CLIENT + '/home', { waitUntil: 'networkidle' })
  await quiet(client, 2000)
  await shotC('38-client-home-funded')

  await client.goto(CLIENT + '/loans', { waitUntil: 'networkidle' })
  await quiet(client, 1800)
  await shotC('39-client-my-loans')

  const loanId = await loanIdFor(ids[APPS.disbursed])
  if (!loanId) throw new Error('No loan booked against the disbursed case — cannot capture 22.3 or 22.4')
  await client.goto(`${CLIENT}/loans/${loanId}`, { waitUntil: 'networkidle' })
  await quiet(client, 2200)
  await shotC('40-client-loan-account', { full: true })

  // Record a receipt on the funded case, then show the applicant's side of it.
  await openCase(admin, ids[APPS.disbursed])
  await clickTab(admin, 'Money')
  await focusCase(admin)
  const amount = admin.locator('#repayment-amount')
  if (await amount.count()) {
    await amount.fill('5000')
    await admin.locator('#repayment-paymentReference').fill('DO-DEMO-0001')
    await wait(500)
    await shotA('41-admin-record-repayment')
    await admin.getByRole('button', { name: /^Record$/i }).first().click()
    await quiet(admin, 5000)
  } else {
    await shotA('41-admin-record-repayment')
  }

  await client.goto(`${CLIENT}/loans/${loanId}`, { waitUntil: 'networkidle' })
  await quiet(client, 2500)
  await shotC('42-client-loan-after-payment', { full: true })
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'))

async function run() {
  fs.mkdirSync(OUT, { recursive: true })
  const ids = await assertDemoOnly(Object.values(APPS))
  console.log('Demo-only guard passed for', Object.keys(ids).length, 'applications')

  // Playwright's bundled Chromium ships no PDF viewer, so the Documents tab's
  // inline preview never paints and its query never settles. Real Chrome has
  // one.
  const browser = await chromium.launch({ channel: 'chrome' })
  const adminCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  const admin = await signIn(adminCtx, ADMIN, ADMIN_EMAIL)
  const shotA = makeShooter(admin, 'admin')
  console.log('Signed in as', ADMIN_EMAIL)

  const names = wanted.length
    ? wanted
    : ['signin', 'console', 'lifecycle', 'money', 'requests', 'mirror', 'inforequested', 'approve', 'remaining', 'clientviews', 'loanphase']

  // The applicant's session is only worth opening for the stages that need it.
  const needsClient = names.some((n) => ['mirror', 'inforequested', 'approve', 'remaining', 'clientviews', 'loanphase'].includes(n))
  let client = null
  let shotC = null
  if (needsClient) {
    const clientCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
    client = await signIn(clientCtx, CLIENT, CLIENT_EMAIL)
    shotC = makeShooter(client, 'client')
    console.log('Signed in as', CLIENT_EMAIL)
  }

  for (const name of names) {
    if (!stages[name]) throw new Error(`Unknown stage "${name}". Known: ${Object.keys(stages).join(', ')}`)
    console.log(`\n== stage: ${name} ==`)
    await stages[name]({ admin, adminCtx, shotA, client, shotC, ids, browser })
  }

  await browser.close()
  console.log('\nFigures written to', OUT)
}

run().catch((e) => {
  console.error('\nCAPTURE FAILED:', e.message)
  process.exit(1)
})
