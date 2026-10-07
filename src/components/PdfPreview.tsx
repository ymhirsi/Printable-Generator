import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import PdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { QueueEntry } from '../lib/techniques'
import type { MasterData } from '../lib/data/types'
import { generateSolmidoPDFDoc } from '../lib/pdf'

// pdf.js renders off the main thread; bundle its worker via Vite's ?url import.
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfjsWorkerUrl

// US Letter aspect ratio (612pt × 792pt) — used to keep empty/loading frames
// at true page proportions even before a document exists.
const LETTER_RATIO = 612 / 792
// Cap the rendered page width so the canvas stays sharp without becoming huge
// on very wide layouts; below this it simply fits the column.
const MAX_PAGE_W = 720

type Props = {
  queue: QueueEntry[]
  data: MasterData
  onBlobChange?: (blob: Blob | null) => void
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

export default function PdfPreview({ queue, data, onBlobChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const genRef = useRef(0)
  const onBlobRef = useRef(onBlobChange)
  useEffect(() => { onBlobRef.current = onBlobChange }, [onBlobChange])

  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [frameWidth, setFrameWidth] = useState(0)

  // Measure the available column width so the page renders fit-to-width and crisp.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const apply = (w: number) => setFrameWidth(Math.round(Math.min(w, MAX_PAGE_W)))
    const ro = new ResizeObserver(entries => apply(entries[0]?.contentRect.width ?? 0))
    ro.observe(el)
    apply(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Regenerate the real PDF (same code path as the download) whenever the queue
  // changes, then hand its bytes to pdf.js. Debounced so rapid reorder/add/remove
  // edits don't thrash. Generation tokens guard against out-of-order async finishes
  // and React StrictMode's double-invoked effects.
  useEffect(() => {
    const myGen = ++genRef.current

    if (queue.length === 0) {
      const prev = docRef.current
      docRef.current = null
      prev?.destroy()
      setNumPages(0)
      setPageNum(1)
      setStatus('idle')
      setError(null)
      onBlobRef.current?.(null)
      return
    }

    setStatus('loading')
    const timer = setTimeout(async () => {
      try {
        const doc = await generateSolmidoPDFDoc(queue, data)
        if (myGen !== genRef.current) return
        onBlobRef.current?.(doc.output('blob'))

        const bytes = doc.output('arraybuffer') as ArrayBuffer
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
        if (myGen !== genRef.current) { pdf.destroy(); return }

        const prev = docRef.current
        docRef.current = pdf
        prev?.destroy()
        setNumPages(pdf.numPages)
        setPageNum(p => Math.min(Math.max(1, p), pdf.numPages))
        setError(null)
        setStatus('ready')
      } catch (e) {
        if (myGen !== genRef.current) return
        console.error('PDF preview generation failed', e)
        setError((e as Error).message)
        setStatus('error')
        onBlobRef.current?.(null)
      }
    }, 180)

    return () => clearTimeout(timer)
  }, [queue, data])

  // Draw the current page to the canvas. Re-runs on page change, on resize (for
  // a crisp re-raster), and when a freshly generated document becomes ready.
  const renderPage = useCallback(async () => {
    const pdf = docRef.current
    const canvas = canvasRef.current
    if (!pdf || !canvas || frameWidth === 0) return

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel() } catch { /* already settled */ }
      renderTaskRef.current = null
    }

    try {
      const page = await pdf.getPage(pageNum)
      const base = page.getViewport({ scale: 1 })
      const cssWidth = frameWidth
      const scale = cssWidth / base.width
      const dpr = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: scale * dpr })
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${base.height * scale}px`

      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise
      renderTaskRef.current = null
    } catch (e) {
      if ((e as { name?: string })?.name === 'RenderingCancelledException') return
      console.error('PDF page render failed', e)
    }
  }, [pageNum, frameWidth])

  useEffect(() => {
    if (status === 'ready') renderPage()
  }, [renderPage, status, numPages])

  // Tear down on unmount.
  useEffect(() => () => {
    genRef.current++
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel() } catch { /* noop */ }
      renderTaskRef.current = null
    }
    docRef.current?.destroy()
    docRef.current = null
  }, [])

  const canPrev = pageNum > 1
  const canNext = pageNum < numPages
  const goPrev = () => canPrev && setPageNum(p => p - 1)
  const goNext = () => canNext && setPageNum(p => p + 1)

  const showCanvas = status === 'ready' || (status === 'loading' && numPages > 0)

  return (
    <div>
      {/* Page navigation bar */}
      <div className="flex items-center justify-between mb-2 min-h-[32px]">
        <span className="text-xs text-muted tabular-nums">
          US&nbsp;Letter
          {numPages > 0 && <> · Page {pageNum} of {numPages}</>}
          {status === 'loading' && numPages > 0 && <> · Updating…</>}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={goPrev}
            disabled={!canPrev}
            className={navBtn}
            aria-label="Previous page"
          >‹ Prev</button>
          <button
            onClick={goNext}
            disabled={!canNext}
            className={navBtn}
            aria-label="Next page"
          >Next ›</button>
        </div>
      </div>

      {/* Page frame — always at US Letter proportions */}
      <div
        ref={frameRef}
        className="relative mx-auto"
        style={{ width: '100%', maxWidth: MAX_PAGE_W }}
      >
        {showCanvas ? (
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="block mx-auto bg-white shadow-[0_1px_4px_rgba(26,35,50,0.18)] ring-1 ring-rule"
            />
            {status === 'loading' && (
              <div className="absolute inset-0 flex items-start justify-center pointer-events-none">
                <span className="mt-3 rounded-full bg-ink/80 text-paper text-[11px] px-2.5 py-1">
                  Updating preview…
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            className="mx-auto flex items-center justify-center text-center bg-white ring-1 ring-rule rounded-sm"
            style={{ aspectRatio: String(LETTER_RATIO), width: '100%' }}
          >
            {status === 'loading' ? (
              <span className="text-sm text-muted">Rendering preview…</span>
            ) : status === 'error' ? (
              <span className="text-sm text-red-700 px-6">Preview failed: {error}</span>
            ) : (
              <span className="text-sm text-muted px-8 leading-relaxed">
                Add a technique to the queue to preview the printable PDF exactly
                as it will be generated.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const navBtn =
  'border border-rule rounded-md px-2.5 py-1 text-xs font-medium text-ink bg-white ' +
  'hover:bg-paper disabled:opacity-40 disabled:hover:bg-white transition-colors'
