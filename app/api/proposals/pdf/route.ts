import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { PDFDocument, PDFName, PDFDict, PDFPage, PDFFont, StandardFonts, rgb, TextAlignment } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import { join } from 'path'

const PAGE_W = 1191
const PAGE_H = 842
const MARGIN = 48
const LABEL_W = 130
const CONTENT_LEFT = MARGIN + LABEL_W   // 178

// Gantt chart vertical bounds (pdf-lib y = 0 at bottom of page)
// These sit below the InDesign section heading and above the InDesign footer
const GANTT_TOP    = 660   // ~182pt from top — below "Design Timeline" heading
const GANTT_BOTTOM = 75    // above InDesign footer — raised so white rect doesn't cover it

const TEAL   = rgb(42 / 255, 124 / 255, 111 / 255)
const TEAL_D = rgb(26 / 255, 92  / 255, 80  / 255)
const GRAY   = rgb(0.55, 0.55, 0.55)
const WHITE  = rgb(1, 1, 1)

const STAGE_PCT   = [0, 3, 12, 20, 40, 25, 0]
const STAGE_SHORT = ['Initial Meeting', 'Brief', 'Concept Design', 'Developed Design', 'Technical Design', 'Construction']
const CDM_PCT     = 11.22

function gbp(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calcFees(form: any) {
  const stagePcts: number[] = form.stagePercentages ?? STAGE_PCT
  const totalFee = (form.constructionCost ?? 0) * (form.feePercent ?? 0) / 100
  const cdmFee = totalFee * CDM_PCT / 100
  const fullPct = stagePcts.slice(1).reduce((a: number, b: number) => a + b, 0) || 100
  const stageFees = stagePcts.map((p: number, i: number) => {
    if (i === 0 || !form.selectedStages?.[i]) return 0
    const override = form.stageFeeOverrides?.[i]
    if (override && override > 0) return override
    return totalFee * p / fullPct
  })
  return { totalFee, cdmFee, stageFees }
}

interface StageTimeline { stageIdx: number; startDate: Date; endDate: Date; weeks: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calcTimeline(form: any): StageTimeline[] {
  if (!form.startMonth || !form.totalWeeks || form.totalWeeks <= 0) return []
  const sel14 = [1, 2, 3, 4].filter(i => form.selectedStages?.[i])
  if (sel14.length === 0) return []
  const selTotal = sel14.reduce((a: number, i: number) => a + STAGE_PCT[i], 0)
  const [yr, mo] = form.startMonth.split('-').map(Number)
  let cur = new Date(yr, mo - 1, 1)
  const result: StageTimeline[] = []
  sel14.forEach((i: number, idx: number) => {
    const weeks = idx === sel14.length - 1
      ? Math.max(1, form.totalWeeks - result.reduce((a: number, r: StageTimeline) => a + r.weeks, 0))
      : Math.max(1, Math.round(form.totalWeeks * STAGE_PCT[i] / selTotal))
    const startDate = new Date(cur)
    const endDate   = new Date(cur.getTime() + weeks * 7 * 86400000)
    result.push({ stageIdx: i, startDate, endDate, weeks })
    cur = endDate
  })
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawGanttOverlay(page: PDFPage, font: PDFFont, italicFont: PDFFont, form: any) {
  const timelines = calcTimeline(form)
  if (timelines.length === 0) return

  const [startYr, startMo] = form.startMonth.split('-').map(Number)
  const totalMonths = Math.ceil(form.totalWeeks / 4.33)
  const months: string[] = []
  for (let i = 0; i <= totalMonths; i++) {
    const d = new Date(startYr, startMo - 1 + i, 1)
    months.push(d.toLocaleString('default', { month: 'short' }))
  }

  const rangeStart = new Date(startYr, startMo - 1, 1)
  const rangeEnd   = new Date(rangeStart.getTime() + (form.totalWeeks * 7 + 30) * 86400000)
  const totalMs    = rangeEnd.getTime() - rangeStart.getTime()
  const contentW   = PAGE_W - MARGIN - CONTENT_LEFT  // 965
  const toX = (d: Date) =>
    CONTENT_LEFT + Math.max(0, Math.min(1, (d.getTime() - rangeStart.getTime()) / totalMs)) * contentW

  // White-out the chart area so we draw cleanly over the static InDesign bars
  page.drawRectangle({
    x: MARGIN - 5,
    y: GANTT_BOTTOM,
    width: PAGE_W - 2 * MARGIN + 10,
    height: GANTT_TOP - GANTT_BOTTOM,
    color: WHITE,
  })

  // ── Year label ─────────────────────────────────────────────────────────────
  const yearLabel = String(startYr)
  const yearW = font.widthOfTextAtSize(yearLabel, 14)
  const yearY = GANTT_TOP - 22
  page.drawText(yearLabel, { x: PAGE_W / 2 - yearW / 2, y: yearY, font, size: 14, color: GRAY })

  // ── Month headers ──────────────────────────────────────────────────────────
  const monthRowY = yearY - 22
  const monthColW = contentW / months.length
  months.forEach((m, i) => {
    const mw = font.widthOfTextAtSize(m, 8)
    page.drawText(m, {
      x: CONTENT_LEFT + i * monthColW + monthColW / 2 - mw / 2,
      y: monthRowY,
      font, size: 8, color: GRAY,
    })
  })

  // ── Stage rows ─────────────────────────────────────────────────────────────
  const BAR_H   = 20
  const ROW_GAP = 28   // increased to give room for pins above bars
  const CIR_R   = 10
  const PIN_R   = 8
  let curY = monthRowY - 28
  let meetingN = 1

  // ── Month gridlines (subtle vertical separators) ──────────────────────────
  const gridTop    = monthRowY - 8
  const gridBottom = GANTT_BOTTOM + 20
  for (let i = 1; i < months.length; i++) {
    const gridX = CONTENT_LEFT + i * monthColW
    page.drawLine({
      start: { x: gridX, y: gridTop },
      end:   { x: gridX, y: gridBottom },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.88),
    })
  }

  timelines.forEach(tl => {
    const barLeft = toX(tl.startDate)
    const barW    = Math.max(8, toX(tl.endDate) - barLeft)

    // Circle + stage number
    page.drawCircle({ x: MARGIN + CIR_R, y: curY, size: CIR_R, color: TEAL })
    const idxStr = String(tl.stageIdx)
    const idxW   = font.widthOfTextAtSize(idxStr, 8)
    page.drawText(idxStr, { x: MARGIN + CIR_R - idxW / 2, y: curY - 3, font, size: 8, color: WHITE })

    // Stage name
    page.drawText(STAGE_SHORT[tl.stageIdx], {
      x: MARGIN + CIR_R * 2 + 4, y: curY - 3, font, size: 8, color: GRAY,
    })

    // Bar
    page.drawRectangle({ x: barLeft, y: curY - BAR_H / 2, width: barW, height: BAR_H, color: TEAL })

    // Meeting pins — white circle with dark border, above the bar, with downward arrow
    const meetings = form.meetingsPerStage?.[tl.stageIdx] || 0
    const pinY = curY + BAR_H / 2 + 3 + PIN_R  // 3pt gap above bar top
    for (let m = 0; m < meetings; m++) {
      const pinX = barLeft + barW * (m + 1) / (meetings + 1)
      page.drawCircle({ x: pinX, y: pinY, size: PIN_R + 0.75, color: rgb(0.25, 0.25, 0.25) })  // border
      page.drawCircle({ x: pinX, y: pinY, size: PIN_R, color: WHITE })                           // fill
      const nStr = String(meetingN++)
      const nW   = font.widthOfTextAtSize(nStr, 7)
      page.drawText(nStr, { x: pinX - nW / 2, y: pinY - 3, font, size: 7, color: rgb(0.2, 0.2, 0.2) })
      // Small downward-pointing triangle below circle (M left,top L right,top L tip,bottom Z)
      page.drawSvgPath('M -3.5 0 L 3.5 0 L 0 4 Z', { x: pinX, y: pinY - PIN_R - 2, color: rgb(0.35, 0.35, 0.35) })
    }

    curY -= BAR_H + ROW_GAP
  })

  // ── Legend & disclaimer ────────────────────────────────────────────────────
  const legendY = curY - 10
  page.drawCircle({ x: MARGIN + 8, y: legendY + 8, size: 8.75, color: rgb(0.25, 0.25, 0.25) })
  page.drawCircle({ x: MARGIN + 8, y: legendY + 8, size: 8, color: WHITE })
  page.drawText('1', { x: MARGIN + 5, y: legendY + 5, font, size: 7, color: rgb(0.2, 0.2, 0.2) })
  page.drawSvgPath('M -3.5 0 L 3.5 0 L 0 4 Z', { x: MARGIN + 8, y: legendY - 2, color: rgb(0.35, 0.35, 0.35) })
  page.drawText('Client Meeting', { x: MARGIN + 22, y: legendY + 5, font, size: 9, color: GRAY })
  page.drawText('Please note the timeline is indicative.', {
    x: MARGIN, y: legendY - 24, font: italicFont, size: 9, color: rgb(0.7, 0.7, 0.7),
  })

}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

function drawIntroQuoteOverlay(page: PDFPage, font: PDFFont, quoteText: string) {
  const QUOTE_FONT_SIZE = 36
  const LINE_HEIGHT     = QUOTE_FONT_SIZE * 1.55

  // Exact InDesign frame coordinates converted to pdf-lib (y from bottom)
  // InDesign: x=133.3, y=194.7, w=986.6, h=166.3
  const FRAME_X      = 133.3
  const FRAME_W      = 986.6
  const FRAME_H      = 166.3
  const FRAME_TOP_Y  = PAGE_H - 194.7          // 647.3 pt from bottom
  const FRAME_BOT_Y  = FRAME_TOP_Y - FRAME_H   // 481.0 pt from bottom

  // First baseline sits ~ascent below frame top (≈70% of font size for Brandon Grotesque)
  const FIRST_BASELINE_Y = FRAME_TOP_Y - QUOTE_FONT_SIZE * 0.75

  const lines = wrapText(quoteText, font, QUOTE_FONT_SIZE, FRAME_W)

  // White out the original InDesign quote
  page.drawRectangle({
    x: FRAME_X - 2,
    y: FRAME_BOT_Y - 2,
    width: FRAME_W + 4,
    height: FRAME_H + 4,
    color: WHITE,
  })

  // Redraw in teal italic Brandon Grotesque
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: FRAME_X,
      y: FIRST_BASELINE_Y - i * LINE_HEIGHT,
      font,
      size: QUOTE_FONT_SIZE,
      color: TEAL,
    })
  })
}

function findFieldPageIndex(pdfDoc: PDFDocument, pdfForm: ReturnType<PDFDocument['getForm']>, fieldName: string): number {
  try {
    const field  = pdfForm.getTextField(fieldName)
    const widget = field.acroField.getWidgets()[0]
    if (!widget) return -1
    const pRef = widget.P()
    if (!pRef) return -1
    return pdfDoc.getPages().findIndex(p => p.ref.objectNumber === pRef.objectNumber)
  } catch {
    return -1
  }
}

// Module-level font cache — loaded once on first request
let brandonBytesCache: Buffer | null = null
let brandonRegularBytesCache: Buffer | null = null
let brandonItalicBytesCache: Buffer | null = null

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await req.json()

    const templatePath = join(process.cwd(), 'public', 'proposal-template.pdf')
    const templateBytes = await readFile(templatePath)
    const pdfDoc = await PDFDocument.load(templateBytes)
    pdfDoc.registerFontkit(fontkit)
    const pdfForm = pdfDoc.getForm()

    // ── Detect page positions before any modifications ──────────────────────
    const stagePageMap: Partial<Record<number, number>> = {
      0: findFieldPageIndex(pdfDoc, pdfForm, 'stage_0_page'),
      1: findFieldPageIndex(pdfDoc, pdfForm, 'stage_1_page'),
      2: findFieldPageIndex(pdfDoc, pdfForm, 'stage_2_page'),
      3: findFieldPageIndex(pdfDoc, pdfForm, 'stage_3_page'),
      4: findFieldPageIndex(pdfDoc, pdfForm, 'stage_4_page'),
      5: findFieldPageIndex(pdfDoc, pdfForm, 'stage_5_page'),
    }
    const tlPageIdx   = findFieldPageIndex(pdfDoc, pdfForm, 'timeline_marker')
    const hasTimeline = tlPageIdx >= 0 && calcTimeline(form).length > 0

    // ── Embed fonts (cached at module level after first load) ────────────────
    if (!brandonBytesCache)        brandonBytesCache        = await readFile(join(process.cwd(), 'public', 'fonts', 'brandon-grotesque-light.ttf'))
    if (!brandonRegularBytesCache) brandonRegularBytesCache = await readFile(join(process.cwd(), 'public', 'fonts', 'brandon-grotesque-regular.ttf'))
    if (!brandonItalicBytesCache)  brandonItalicBytesCache  = await readFile(join(process.cwd(), 'public', 'fonts', 'brandon-grotesque-italic.ttf'))
    const brandonBytes        = brandonBytesCache
    const brandonRegularBytes = brandonRegularBytesCache
    const brandonItalicBytes  = brandonItalicBytesCache
    const fieldFont   = await pdfDoc.embedFont(brandonBytes)
    const quoteFont   = await pdfDoc.embedFont(brandonRegularBytes)
    const italicFont  = await pdfDoc.embedFont(brandonItalicBytes)

    // ── Strip InDesign blue field backgrounds ────────────────────────────────
    for (const field of pdfForm.getFields()) {
      for (const widget of field.acroField.getWidgets()) {
        const mk = widget.dict.get(PDFName.of('MK'))
        if (mk instanceof PDFDict) mk.delete(PDFName.of('BG'))
        widget.dict.delete(PDFName.of('AP'))
      }
    }

    // ── Fill fields ─────────────────────────────────────────────────────────
    const setField = (name: string, value: string) => {
      try { pdfForm.getTextField(name).setText(value) } catch { /* field absent */ }
    }

    const { stageFees, totalFee, cdmFee } = calcFees(form)
    const address = form.address || ''
    const dateStr = form.date
      ? new Date(form.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : ''

    setField('address', address)
    setField('date', dateStr)
    setField('footer_address', address)
    for (let i = 2; i <= 16; i++) setField(`footer_address ${i}`, address)

    if (stageFees[1] > 0) setField('stage_1_fee', gbp(stageFees[1]))
    if (stageFees[2] > 0) setField('stage_2_fee', gbp(stageFees[2]))
    if (stageFees[3] > 0) setField('stage_3_fee', gbp(stageFees[3]))
    if (stageFees[4] > 0) setField('stage_4_fee', gbp(stageFees[4]))
    if (stageFees[5] > 0) setField('stage_5_fee', gbp(stageFees[5]))
    setField('total_fee', gbp(totalFee))

    // Optional items — stage-specific extras + global optional services
    const extras = form.stageOptionals ?? {}
    const cdmAmount = extras.cdm || form.cdmFeeAmount || 0
    setField('option_item_1',      cdmAmount > 0             ? gbp(cdmAmount)                : 'TBC')
    setField('optional_item_2',    form.includeInterior      ? gbp(form.interiorFee  || 0)   : 'TBC')
    setField('optional_item_3',    form.includeLandscape     ? gbp(form.landscapeFee || 0)   : 'TBC')
    setField('artistic_render_fee', (extras.artisticRender || 0) > 0 ? gbp(extras.artisticRender) : 'TBC')
    setField('physical_model_fee',  (extras.physicalModel  || 0) > 0 ? gbp(extras.physicalModel)  : 'TBC')
    setField('tender_fee',          (extras.tender         || 0) > 0 ? gbp(extras.tender)         : 'TBC')
    setField('party_wall_fee',      (extras.partyWall      || 0) > 0 ? gbp(extras.partyWall)      : 'TBC')
    setField('specification_fee',   (extras.specification  || 0) > 0 ? gbp(extras.specification)  : 'TBC')

    // Total of all optional items
    const optionalsTotal =
      cdmAmount +
      (form.includeInterior  ? (form.interiorFee  || 0) : 0) +
      (form.includeLandscape ? (form.landscapeFee || 0) : 0) +
      (extras.artisticRender || 0) +
      (extras.physicalModel  || 0) +
      (extras.tender         || 0) +
      (extras.partyWall      || 0) +
      (extras.specification  || 0)
    if (optionalsTotal > 0) setField('artistic_render_fee 7', gbp(optionalsTotal))

    // Stage weeks — calculated proportionally from totalWeeks
    const timelines = calcTimeline(form)
    const weeksLabel = (stageIdx: number) => {
      const tl = timelines.find(t => t.stageIdx === stageIdx)
      return tl ? `${tl.weeks} ${tl.weeks === 1 ? 'Week' : 'Weeks'}` : ''
    }
    setField('stage_1_weeks',   weeksLabel(1))
    setField('stage_2_weeks ',  weeksLabel(2))  // trailing space matches InDesign field name
    setField('stage_3_weeks',   weeksLabel(3))
    setField('stage_4_weeks',   weeksLabel(4))

    // ── Set field text alignment ─────────────────────────────────────────────
    const setAlign = (name: string, alignment: TextAlignment) => {
      try { pdfForm.getTextField(name).setAlignment(alignment) } catch { /* absent */ }
    }

    // Cover page — left aligned
    setAlign('address', TextAlignment.Left)
    setAlign('date',    TextAlignment.Left)

    // RIBA stage fees and weeks — right aligned
    setAlign('stage_1_fee',   TextAlignment.Right)
    setAlign('stage_2_fee',   TextAlignment.Right)
    setAlign('stage_3_fee',   TextAlignment.Right)
    setAlign('stage_4_fee',   TextAlignment.Right)
    setAlign('stage_5_fee',   TextAlignment.Right)
    setAlign('stage_1_weeks',  TextAlignment.Right)
    setAlign('stage_2_weeks ', TextAlignment.Right)
    setAlign('stage_3_weeks',  TextAlignment.Right)
    setAlign('stage_4_weeks',      TextAlignment.Right)
    setAlign('option_item_1',      TextAlignment.Right)
    setAlign('optional_item_2',    TextAlignment.Right)
    setAlign('optional_item_3',    TextAlignment.Right)
    setAlign('artistic_render_fee', TextAlignment.Right)
    setAlign('physical_model_fee',  TextAlignment.Right)
    setAlign('tender_fee',          TextAlignment.Right)
    setAlign('party_wall_fee',      TextAlignment.Right)
    setAlign('specification_fee',      TextAlignment.Right)
    setAlign('artistic_render_fee 7',  TextAlignment.Right)
    setAlign('total_fee',              TextAlignment.Right)

    // ── Flatten ─────────────────────────────────────────────────────────────
    pdfForm.updateFieldAppearances(fieldFont)
    pdfForm.flatten()

    // ── Compute stage removals first so we know the final timeline page number ─
    const stageRemovals = (Object.entries(stagePageMap) as [string, number][])
      .filter(([si, pi]) => pi >= 0 && !form.selectedStages?.[Number(si)])
      .map(([, pi]) => pi)

    // ── Overlay intro quote on page 2 (always index 1) ──────────────────────
    if (form.introQuote) {
      drawIntroQuoteOverlay(pdfDoc.getPage(1), quoteFont, form.introQuote)
    }

    // ── Overlay dynamic Gantt on the existing InDesign timeline page ─────────
    if (hasTimeline) {
      const tlPage = pdfDoc.getPage(tlPageIdx)
      drawGanttOverlay(tlPage, fieldFont, italicFont, form)
    }

    const allRemovals = (!hasTimeline && tlPageIdx >= 0)
      ? [...stageRemovals, tlPageIdx]
      : stageRemovals

    allRemovals.sort((a, b) => b - a)
    for (const pi of allRemovals) pdfDoc.removePage(pi)

    // ── Save & return ────────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false })
    const safeAddr = (address || 'Proposal').replace(/[^a-zA-Z0-9\s]/g, '').trim()

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="MMA ${safeAddr}_Fee Proposal.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
