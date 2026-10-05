/**
 * Renders docs/client-manual.html to docs/PRDF-Client-Portal-User-Manual.pdf.
 *
 * There was no script for this before: the PDF was produced by hand and
 * committed once, so the HTML beside it could be edited with no way to reissue
 * the document. The PDF is a build artefact of the HTML, so it gets a build.
 *
 * Figure numbering is renumbered here rather than maintained by hand. Captions
 * in the HTML may be written as "Figure ##" and this pass rewrites every
 * caption in document order, so inserting a figure into an early section does
 * not mean renumbering the forty after it.
 *
 *   node scripts/render-client-manual.mjs           # renumber + render
 *   node scripts/render-client-manual.mjs --check   # renumber + verify only
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const htmlPath = path.join(ROOT, 'docs', 'client-manual.html')
const pdfPath = path.join(ROOT, 'docs', 'PRDF-Client-Portal-User-Manual.pdf')
const shotsDir = path.join(ROOT, 'docs', 'screenshots', 'client-manual')

// ---------------------------------------------------------------------------
// 1. Renumber figures in document order
// ---------------------------------------------------------------------------
let html = fs.readFileSync(htmlPath, 'utf8')

let n = 0
html = html.replace(/(<figcaption>\s*)Figure\s+(?:##|\d+)/g, (_m, lead) => `${lead}Figure ${++n}`)
console.log(`Renumbered ${n} figure captions`)

// Cross-references written as "Figure ##" outside a caption cannot be resolved
// automatically — they have to name a figure, and only a human knows which.
const dangling = (html.match(/Figure ##/g) || []).length
if (dangling) {
  console.warn(`WARNING: ${dangling} "Figure ##" placeholder(s) left outside captions — these need a real number`)
}

fs.writeFileSync(htmlPath, html, 'utf8')

// ---------------------------------------------------------------------------
// 2. Every referenced image must exist, or the PDF renders a broken-image box
//    that nobody notices until it is printed.
// ---------------------------------------------------------------------------
const referenced = [...html.matchAll(/src="screenshots\/client-manual\/([^"]+)"/g)].map((m) => m[1])
const missing = referenced.filter((f) => !fs.existsSync(path.join(shotsDir, f)))
if (missing.length) {
  console.error(`\n${missing.length} referenced figure(s) are missing from ${path.relative(ROOT, shotsDir)}:`)
  missing.forEach((f) => console.error('  ' + f))
  console.error('\nRun: node scripts/capture-client-manual.mjs')
  process.exit(1)
}
console.log(`All ${referenced.length} referenced figures present`)

const orphans = fs
  .readdirSync(shotsDir)
  .filter((f) => /\.(jpg|png)$/i.test(f) && !referenced.includes(f))
if (orphans.length) console.log(`(${orphans.length} image(s) in the folder are not referenced: ${orphans.join(', ')})`)

if (process.argv.includes('--check')) {
  console.log('\n--check: stopping before render')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 3. Render
// ---------------------------------------------------------------------------
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' })
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `
    <div style="width:100%;font-size:8px;color:#6b7280;padding:0 12mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif;">
      <span>PRDF Client Portal — User Manual</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`,
  margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
})
await browser.close()

const kb = Math.round(fs.statSync(pdfPath).size / 1024)
console.log(`\nPDF written to ${path.relative(ROOT, pdfPath)} (${kb} KB)`)
