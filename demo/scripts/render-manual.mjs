import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const htmlPath = path.join(root, 'docs', 'user-manual', 'user-manual.html');
const pdfPath = path.join(root, 'docs', 'PRDF-LMS-User-Manual.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `
    <div style="width:100%;font-size:8px;color:#6b7280;padding:0 12mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif;">
      <span>PRDF Loan Management System — User Manual</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`,
  margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
});
await browser.close();
console.log('PDF written to ' + pdfPath);
