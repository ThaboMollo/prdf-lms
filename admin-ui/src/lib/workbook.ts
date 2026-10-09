/**
 * Report downloads, as Excel.
 *
 * These used to be hand-built CSV strings in two different places, with two
 * different download mechanisms and `"${value}"` quoting that corrupted any
 * cell containing a quote or a comma — a business name with a comma in it
 * silently shifted every column after it. They are workbooks now because PRDF
 * asked for Excel, and because a workbook can carry the two reports that were
 * never really tables (demographic and province breakdowns stacked two
 * categories into one flat file) as one sheet each instead.
 *
 * exceljs is loaded with a dynamic import inside the download handler. It is
 * ~900 KB, nobody on the Reports page has necessarily come to export anything,
 * and the page already renders every chart before a button is pressed.
 */

/** A value destined for one cell. Dates and numbers stay typed — see below. */
export type CellValue = string | number | Date | null | undefined

export type Sheet = {
  /** Worksheet tab name. Excel caps these at 31 chars and forbids a few punctuation marks. */
  name: string
  columns: { header: string; key: string; width?: number; format?: 'currency' | 'integer' | 'date' }[]
  rows: Record<string, CellValue>[]
  /** Rendered above the header row, for a figure that is not part of the table. */
  caption?: string
}

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Excel rejects a workbook outright if a sheet name contains one of these or
// runs past 31 characters, and reports the file as corrupt rather than naming
// the sheet — so names are sanitised here rather than trusted at the call site.
function safeSheetName(name: string): string {
  return name.replace(/[[\]*/\\?:]/g, ' ').slice(0, 31)
}

const NUMBER_FORMATS = {
  currency: '#,##0.00',
  integer: '#,##0',
  date: 'yyyy-mm-dd hh:mm',
} as const

/**
 * Build the workbook and hand it to the browser as a download.
 *
 * Amounts are written as real numbers with a display format rather than
 * pre-rounded strings (`.toFixed(2)`, as the CSV did), so a column of money
 * sums and sorts in Excel instead of sorting as text where "9" lands after
 * "1000".
 */
export async function downloadWorkbook(filename: string, sheets: Sheet[]): Promise<void> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PRDF LMS'
  wb.created = new Date()

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(safeSheetName(sheet.name))

    if (sheet.caption) {
      ws.addRow([sheet.caption])
      ws.getRow(1).font = { bold: true }
      ws.addRow([])
    }

    const headerRow = ws.addRow(sheet.columns.map((c) => c.header))
    headerRow.font = { bold: true }
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F7' } }
    })

    for (const row of sheet.rows) {
      ws.addRow(sheet.columns.map((c) => row[c.key] ?? null))
    }

    sheet.columns.forEach((col, i) => {
      const column = ws.getColumn(i + 1)
      column.width = col.width ?? Math.max(12, col.header.length + 2)
      if (col.format) column.numFmt = NUMBER_FORMATS[col.format]
    })

    ws.views = [{ state: 'frozen', ySplit: headerRow.number }]
  }

  const buffer = await wb.xlsx.writeBuffer()
  triggerDownload(new Blob([buffer], { type: MIME }), filename)
}

/**
 * The object URL is revoked after the click. The previous implementation never
 * did, so every export leaked its blob for the lifetime of the tab. Revoking
 * synchronously would race the download in Safari, hence the timeout.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
