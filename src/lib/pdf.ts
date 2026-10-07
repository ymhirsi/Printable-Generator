import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type { QueueEntry } from './techniques'
import { renderTechnique } from './techniques'
import { renderTechniqueSystems, type RenderOutput } from './notation'
import type { MasterData } from './data/types'
import { isSeventhChordId, seventhChordKeyDef } from './data/seventhChords'

// US Letter portrait, in pt (72pt = 1 inch).
const PAGE_W = 612
const PAGE_H = 792
// Horizontal margins set the content width and therefore the music's horizontal
// scale — KEEP at 0.75" so the notes are sized exactly as before. The vertical
// margins are independent and trimmed to 0.5": this only changes whitespace, not
// the music, and reclaims the room needed to seat four systems on a page.
const MARGIN_H = 54
const MARGIN_V = 36
// The running header (title + date + rule) only needs ~16pt of ink and the footer
// page number prints down in the bottom margin, so the previous 50/30pt reserves
// were mostly empty. Trimmed to what the ink actually occupies, which widens the
// usable content band by ~44pt — enough to fit a fourth system.
const HEADER_H = 24
const FOOTER_H = 12
const CONTENT_W = PAGE_W - MARGIN_H * 2   // 504 — unchanged, so music scale is unchanged

// The vertical band that technique content lives in, between the header and footer.
const BAND_TOP    = MARGIN_V + HEADER_H
const BAND_BOTTOM = PAGE_H - MARGIN_V - FOOTER_H
const BAND        = BAND_BOTTOM - BAND_TOP

// Scales target: at most four systems share a page. A 2/3/4-octave scale is two
// systems, so this seats two whole techniques per page; a 1-octave scale is one
// system. The height check below is the real limiter — the cap just keeps dense
// pages from ever exceeding the intended four.
const SYSTEMS_PER_PAGE = 4

// Minimum (baseline) spacing. Any leftover vertical room on a page is distributed
// evenly ON TOP of these so the systems "breathe" rather than packing to the top.
const TITLE_H       = 13   // title text slot height
const TITLE_GAP     = 4    // title baseline → its first system
const SYS_GAP       = 8    // between systems WITHIN one technique (kept tight, fixed)
const MIN_BLOCK_GAP = 12   // baseline gap BETWEEN techniques (slack is added to this)

// A technique laid out as a title plus its already-rendered systems.
type Block = { title: string; systems: RenderOutput[] }

function blockMinHeight(b: Block): number {
  const sysSum = b.systems.reduce((a, s) => a + s.height, 0)
  const innerGaps = Math.max(0, b.systems.length - 1) * SYS_GAP
  return TITLE_H + TITLE_GAP + sysSum + innerGaps
}

function pageMinHeight(blocks: Block[]): number {
  const sum = blocks.reduce((a, b) => a + blockMinHeight(b), 0)
  return sum + Math.max(0, blocks.length - 1) * MIN_BLOCK_GAP
}

function pageSystemCount(blocks: Block[]): number {
  return blocks.reduce((a, b) => a + b.systems.length, 0)
}

// Greedily pack whole techniques onto pages: a new technique joins the current
// page only if it keeps the page within the four-system cap AND fits the band at
// minimum spacing. A technique's systems are never split across a page boundary,
// which also guarantees a title never orphans from its first system.
function paginate(blocks: Block[]): Block[][] {
  const pages: Block[][] = []
  let cur: Block[] = []
  for (const block of blocks) {
    if (cur.length > 0) {
      const tooManySystems = pageSystemCount(cur) + block.systems.length > SYSTEMS_PER_PAGE
      const tooTall = pageMinHeight([...cur, block]) > BAND
      if (tooManySystems || tooTall) {
        pages.push(cur)
        cur = []
      }
    }
    cur.push(block)
  }
  if (cur.length > 0) pages.push(cur)
  return pages
}

export async function generateSolmidoPDF(
  queue: QueueEntry[],
  data: MasterData,
): Promise<Blob> {
  return (await generateSolmidoPDFDoc(queue, data)).output('blob')
}

/**
 * Render the full queue to a US Letter jsPDF document and hand back the live
 * `jsPDF` instance. The on-screen preview and the downloadable file are both
 * produced from this single code path, so the preview is a true page-for-page
 * render of the real PDF rather than a separate representation.
 */
export async function generateSolmidoPDFDoc(
  queue: QueueEntry[],
  data: MasterData,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })

  // Offscreen host for VexFlow → SVG.
  const host = document.createElement('div')
  host.style.position = 'absolute'
  host.style.left = '-99999px'
  host.style.top = '-99999px'
  host.style.width = `${CONTENT_W}px`
  document.body.appendChild(host)

  try {
    // 1) Render every technique to its systems up front so pagination can reason
    //    about real heights.
    const blocks: Block[] = []
    for (const entry of queue) {
      // 7th-chord arpeggios are chromatic chord shapes, not keys — the render path
      // only consults the keyDef for its key signature, so a synthetic chord keyDef
      // (which resolves to no signature) lets them share the exact same path.
      const key = isSeventhChordId(entry.keyId)
        ? seventhChordKeyDef(entry.keyId)
        : data.keys.find(k => k.id === entry.keyId)!
      const rt = renderTechnique(entry, data)
      const systems = renderTechniqueSystems(host, rt, key, { width: CONTENT_W })
      blocks.push({ title: rt.title, systems })
    }

    // 2) Assign whole techniques to pages (≤4 systems, fits the band).
    const pages = paginate(blocks)

    // 3) Lay out each page, distributing the leftover vertical room evenly so the
    //    systems breathe instead of crowding the top of the page.
    for (let p = 0; p < pages.length; p++) {
      if (p > 0) doc.addPage()
      drawHeader(doc)

      const page = pages[p]
      const nB = page.length
      const slack = Math.max(0, BAND - pageMinHeight(page))
      // Even share for each of the (nB + 1) "outer" gaps: one above the first
      // technique, one between each pair, and one below the last. Within-technique
      // system gaps stay fixed (SYS_GAP) so a technique's own systems stay visually
      // grouped while techniques get pushed apart.
      const outer = slack / (nB + 1)

      let y = BAND_TOP + outer
      for (let bi = 0; bi < nB; bi++) {
        const block = page[bi]

        // Safety guard for a single technique taller than a whole page (not
        // possible for scales; protects future multi-system techniques): break to
        // a fresh page rather than draw past the bottom margin.
        if (bi > 0 && y + blockMinHeight(block) > BAND_BOTTOM + 0.5) {
          doc.addPage()
          drawHeader(doc)
          y = BAND_TOP
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(26, 35, 50)
        doc.text(block.title, MARGIN_H, y + 10)
        y += TITLE_H + TITLE_GAP

        for (let si = 0; si < block.systems.length; si++) {
          const sys = block.systems[si]
          await svg2pdf(sys.svg, doc, {
            x: MARGIN_H,
            y,
            width: sys.width,
            height: sys.height,
          })
          y += sys.height
          if (si < block.systems.length - 1) y += SYS_GAP
        }

        if (bi < nB - 1) y += MIN_BLOCK_GAP + outer
      }
    }

    // Footers are stamped last so the final page count is known.
    const total = doc.getNumberOfPages()
    for (let i = 1; i <= total; i++) {
      doc.setPage(i)
      drawFooter(doc, i)
    }
  } finally {
    document.body.removeChild(host)
  }

  return doc
}

function drawHeader(doc: jsPDF) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(26, 35, 50)
  doc.text('Solmido — Piano Technique', MARGIN_H, MARGIN_V + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(107, 111, 120)
  const dateStr = new Date().toISOString().slice(0, 10)
  doc.text(dateStr, PAGE_W - MARGIN_H, MARGIN_V + 4, { align: 'right' })
  doc.setDrawColor(230, 227, 218)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_H, MARGIN_V + 16, PAGE_W - MARGIN_H, MARGIN_V + 16)
}

function drawFooter(doc: jsPDF, pageNum: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(107, 111, 120)
  doc.text(String(pageNum), PAGE_W / 2, PAGE_H - MARGIN_V + 14, { align: 'center' })
}

export function filenameForToday(): string {
  return `solmido-piano-${new Date().toISOString().slice(0, 10)}.pdf`
}
