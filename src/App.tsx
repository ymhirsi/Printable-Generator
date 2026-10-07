import { useEffect, useMemo, useState } from 'react'
import { saveAs } from 'file-saver'
import type { HandConfig, TechniqueId, ScaleVariant } from './lib/data/types'
import { IMPLEMENTED_TECHNIQUES } from './lib/data/types'
import { MASTER_DATA, KEY_GRID } from './lib/data/generated'
import {
  DOM7_CHORDS, DIM7_CHORDS, DOM7_CHORD_IDS, DIM7_CHORD_IDS,
  isSeventhChordId, seventhChordLabel, type SeventhInversion,
} from './lib/data/seventhChords'
import type { QueueEntry } from './lib/techniques'
import { generateSolmidoPDF, filenameForToday } from './lib/pdf'
import PdfPreview from './components/PdfPreview'

type EnharmonicChoice = { label: string; keyId: string }
type EnharmonicPrompt = {
  prompt: string
  choices: EnharmonicChoice[]
} | null

// The single "Arpeggio" picker entry expands into these three inversions, each
// mapped to its own techniqueId so it renders as its own titled score block.
const ARP_INVERSIONS = [
  { key: 'root',   label: 'Root Position', techniqueId: 'arp-root'       as TechniqueId, inversion: 0 as SeventhInversion },
  { key: 'first',  label: '1st Inversion', techniqueId: 'arp-first-inv'  as TechniqueId, inversion: 1 as SeventhInversion },
  { key: 'second', label: '2nd Inversion', techniqueId: 'arp-second-inv' as TechniqueId, inversion: 2 as SeventhInversion },
] as const
type InversionKey = typeof ARP_INVERSIONS[number]['key']
const SEVENTH_INVERSION_LABEL = ['Root Position', '1st Inversion', '2nd Inversion'] as const

export default function App() {
  const data = MASTER_DATA

  const visibleTechniques = useMemo(
    () => data.techniques.filter(t => IMPLEMENTED_TECHNIQUES.includes(t.id)),
    [data.techniques],
  )

  const [techniqueId, setTechniqueId] = useState<TechniqueId>('scale')
  const [keyId, setKeyId] = useState<string>('c-major')
  const [hand, setHand] = useState<HandConfig>('together')
  const [octaves, setOctaves] = useState<1 | 2 | 3 | 4>(2)
  const [tempo, setTempo] = useState<number>(data.defaults.tempo)
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [minorVariants, setMinorVariants] = useState<Record<ScaleVariant, boolean>>({
    natural: true, harmonic: false, melodic: false,
  })
  // Arpeggio inversions — multi-select follow-up, mirroring the minor-scale type
  // selector. Root Position is checked by default; each checked inversion becomes
  // its own queue entry (mapped to its own techniqueId).
  const [inversions, setInversions] = useState<Record<InversionKey, boolean>>({
    root: true, first: false, second: false,
  })
  const [enharmonicPrompt, setEnharmonicPrompt] = useState<EnharmonicPrompt>(null)
  // The exact bytes pdf.js renders in the preview — reused for download so the
  // saved file is byte-identical to what the user sees.
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)

  const technique = data.techniques.find(t => t.id === techniqueId)
  const selectedKey = data.keys.find(k => k.id === keyId)
  const isScaleMinor = techniqueId === 'scale' && selectedKey?.mode === 'minor'
  // The picker shows a single "Arpeggio" entry (techniqueId 'arp-root'); the
  // inversion selector below maps the chosen inversions to their own techniqueIds.
  const isArpeggio = techniqueId === 'arp-root'
  // 7th-chord arpeggios swap the key grid for a dedicated 12-chord grid. Dominant
  // 7ths carry an inversion selector (root/1st/2nd); diminished 7ths are root-only.
  const isDom7 = techniqueId === 'arp-dominant-7'
  const isDim7 = techniqueId === 'arp-diminished-7'
  const isSeventh = isDom7 || isDim7
  const showInversions = isArpeggio || isDom7
  const seventhChords = isDom7 ? DOM7_CHORDS : isDim7 ? DIM7_CHORDS : []
  const selectedLabel = isSeventh ? (seventhChordLabel(keyId) ?? keyId) : selectedKey?.name

  // Enforce per-technique constraints when technique changes.
  useEffect(() => {
    if (!technique) return
    if (!technique.handConfigsAllowed.includes(hand)) setHand(technique.handConfigsAllowed[0])
    if (!technique.octavesAllowed.includes(octaves)) setOctaves(technique.octavesAllowed[0])
  }, [technique]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selection valid across the key↔chord swap: switching to a 7th-chord
  // technique snaps to that family's first chord; switching back snaps to a real key.
  useEffect(() => {
    if (isDom7) {
      if (!DOM7_CHORD_IDS.includes(keyId)) setKeyId(DOM7_CHORD_IDS[0])
    } else if (isDim7) {
      if (!DIM7_CHORD_IDS.includes(keyId)) setKeyId(DIM7_CHORD_IDS[0])
    } else if (isSeventhChordId(keyId)) {
      setKeyId('c-major')
    }
    setEnharmonicPrompt(null)
  }, [techniqueId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyClick = (slotIdx: number, mode: 'major' | 'minor') => {
    const slot = KEY_GRID[slotIdx]
    const ids = mode === 'major' ? slot.majorIds : slot.minorIds
    const label = mode === 'major' ? slot.majorLabel : slot.minorLabel

    if (ids.length === 1) {
      setKeyId(ids[0])
      setEnharmonicPrompt(null)
      return
    }
    // Enharmonic case — only Gb/F# (majors) and Ebm/D#m (minors).
    const choices: EnharmonicChoice[] = ids.map(id => {
      const k = data.keys.find(x => x.id === id)!
      return { label: k.name, keyId: id }
    })
    const prompt =
      mode === 'major'
        ? `Spell as ${choices[0].label} or ${choices[1].label}?`
        : `Spell as ${choices[0].label} or ${choices[1].label}?`
    setEnharmonicPrompt({ prompt, choices })
  }

  const checkedVariantCount =
    (minorVariants.natural ? 1 : 0) +
    (minorVariants.harmonic ? 1 : 0) +
    (minorVariants.melodic ? 1 : 0)
  const checkedInversionCount = ARP_INVERSIONS.filter(i => inversions[i.key]).length
  const canAdd =
    (!isScaleMinor || checkedVariantCount >= 1) &&
    (!showInversions || checkedInversionCount >= 1)

  function addToQueue() {
    if (!canAdd) return
    if (isScaleMinor) {
      const entries: QueueEntry[] = (['natural', 'harmonic', 'melodic'] as const)
        .filter(v => minorVariants[v])
        .map(v => ({
          id: crypto.randomUUID(),
          techniqueId, keyId, hand, octaves, tempo, variant: v,
        }))
      setQueue(q => [...q, ...entries])
      return
    }
    if (isArpeggio) {
      const entries: QueueEntry[] = ARP_INVERSIONS
        .filter(i => inversions[i.key])
        .map(i => ({
          id: crypto.randomUUID(),
          techniqueId: i.techniqueId, keyId, hand, octaves, tempo,
        }))
      setQueue(q => [...q, ...entries])
      return
    }
    // Dominant 7th: one entry per checked inversion (root/1st/2nd), the inversion
    // carried on the entry rather than on the techniqueId.
    if (isDom7) {
      const entries: QueueEntry[] = ARP_INVERSIONS
        .filter(i => inversions[i.key])
        .map(i => ({
          id: crypto.randomUUID(),
          techniqueId: 'arp-dominant-7' as TechniqueId, keyId, hand, octaves, tempo,
          inversion: i.inversion,
        }))
      setQueue(q => [...q, ...entries])
      return
    }
    // Diminished 7th: symmetrical, root position only — a single entry.
    if (isDim7) {
      setQueue(q => [...q, {
        id: crypto.randomUUID(),
        techniqueId: 'arp-diminished-7' as TechniqueId, keyId, hand, octaves, tempo,
      }])
      return
    }
    const entry: QueueEntry = {
      id: crypto.randomUUID(), techniqueId, keyId, hand, octaves, tempo,
    }
    setQueue(q => [...q, entry])
  }

  const move = (idx: number, dir: -1 | 1) => setQueue(q => {
    const next = [...q]
    const t = idx + dir
    if (t < 0 || t >= next.length) return q
    ;[next[idx], next[t]] = [next[t], next[idx]]
    return next
  })
  const remove = (id: string) => setQueue(q => q.filter(e => e.id !== id))

  async function handleGeneratePDF() {
    if (queue.length === 0) return
    try {
      // The preview already rendered these exact bytes — save them directly so
      // the download matches the preview. Fall back to a fresh build if needed.
      const blob = previewBlob ?? (await generateSolmidoPDF(queue, data))
      saveAs(blob, filenameForToday())
    } catch (e) {
      console.error(e)
      alert('PDF generation failed: ' + (e as Error).message)
    }
  }

  const techniquesGrouped = useMemo(() => {
    const groups: Record<string, typeof visibleTechniques> = {}
    for (const t of visibleTechniques) (groups[t.category] ||= []).push(t)
    return groups
  }, [visibleTechniques])

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-rule">
        <div className="max-w-page mx-auto px-6 py-5 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Solmido — Piano Technique</h1>
          <span className="text-xs text-muted">Scales, arpeggios, cadences &amp; 7th-chord arpeggios</span>
        </div>
      </header>

      <main className="max-w-page mx-auto px-6 py-8 grid gap-8 grid-cols-1 lg:grid-cols-[640px_1fr_280px] w-full">
        {/* Config */}
        <section aria-label="Technique configuration" className="space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Configure</h2>

          <Field label="Technique">
            <select
              value={techniqueId}
              onChange={e => setTechniqueId(e.target.value as TechniqueId)}
              className={selectCls}
            >
              {Object.entries(techniquesGrouped).map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          {/* Chord grid (7th-chord arpeggios) — swaps in for the key grid. */}
          {isSeventh ? (
            <Field label={isDom7 ? 'Dominant 7th chord' : 'Diminished 7th chord'}>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {seventhChords.map(c => {
                  const isSelected = keyId === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setKeyId(c.id)}
                      className={`${keyBtn} ${isSelected ? keyBtnActive : ''}`}
                      aria-pressed={isSelected}
                    >{c.label}</button>
                  )
                })}
              </div>
              <p className="text-xs text-muted mt-2">Selected: {selectedLabel}</p>
            </Field>
          ) : (
          /* Key button grid */
          <Field label="Key">
            <div className="grid grid-cols-12 gap-x-2.5 mb-3.5">
              {KEY_GRID.map((slot, i) => {
                const isSelected = slot.majorIds.includes(keyId)
                return (
                  <button
                    key={`maj-${i}`}
                    onClick={() => handleKeyClick(i, 'major')}
                    className={`${keyBtn} ${isSelected ? keyBtnActive : ''}`}
                    aria-pressed={isSelected}
                  >{slot.majorLabel}</button>
                )
              })}
            </div>
            <div className="grid grid-cols-12 gap-x-2.5">
              {KEY_GRID.map((slot, i) => {
                const isSelected = slot.minorIds.includes(keyId)
                return (
                  <button
                    key={`min-${i}`}
                    onClick={() => handleKeyClick(i, 'minor')}
                    className={`${keyBtn} ${isSelected ? keyBtnActive : ''}`}
                    aria-pressed={isSelected}
                  >{slot.minorLabel}</button>
                )
              })}
            </div>
            {enharmonicPrompt && (
              <div className="mt-3 border border-rule rounded-md p-3 bg-white">
                <p className="text-xs text-ink mb-2">{enharmonicPrompt.prompt}</p>
                <div className="flex gap-2">
                  {enharmonicPrompt.choices.map(c => (
                    <button
                      key={c.keyId}
                      onClick={() => { setKeyId(c.keyId); setEnharmonicPrompt(null) }}
                      className="border border-rule rounded-md px-3 py-1.5 text-sm hover:bg-paper"
                    >{c.label}</button>
                  ))}
                  <button
                    onClick={() => setEnharmonicPrompt(null)}
                    className="text-xs text-muted ml-auto"
                  >Cancel</button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted mt-2">Selected: {selectedKey?.name}</p>
          </Field>
          )}

          {/* Scale variant follow-up (minor only) */}
          {isScaleMinor && (
            <Field label="Minor type (one or more)">
              <div className="flex flex-col gap-1">
                {(['natural', 'harmonic', 'melodic'] as const).map(v => (
                  <label key={v} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={minorVariants[v]}
                      onChange={e => setMinorVariants(m => ({ ...m, [v]: e.target.checked }))}
                      className="w-4 h-4 accent-ink"
                    />
                    <span>{capitalize(v)}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted mt-1">
                Each checked variant adds a separate queue entry.
              </p>
            </Field>
          )}

          {/* Arpeggio / Dominant-7th inversion follow-up. Diminished 7ths are
              symmetrical (root position only), so no selector is shown for them. */}
          {showInversions && (
            <Field label="Inversion (one or more)">
              <div className="flex flex-col gap-1">
                {ARP_INVERSIONS.map(i => (
                  <label key={i.key} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={inversions[i.key]}
                      onChange={e => setInversions(m => ({ ...m, [i.key]: e.target.checked }))}
                      className="w-4 h-4 accent-ink"
                    />
                    <span>{i.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted mt-1">
                Each checked inversion adds a separate queue entry.
              </p>
            </Field>
          )}

          <Field label="Hand configuration">
            <select value={hand} onChange={e => setHand(e.target.value as HandConfig)} className={selectCls}>
              {(['RH', 'LH', 'separate', 'together'] as HandConfig[]).map(h => (
                <option key={h} value={h} disabled={!technique?.handConfigsAllowed.includes(h)}>
                  {handLabel(h)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Octaves">
            <select
              value={octaves}
              onChange={e => setOctaves(parseInt(e.target.value, 10) as 1 | 2 | 3 | 4)}
              className={selectCls}
            >
              {([1, 2, 3, 4] as const).map(n => (
                <option key={n} value={n} disabled={!technique?.octavesAllowed.includes(n)}>{n}</option>
              ))}
            </select>
          </Field>

          <Field label={`Tempo (${data.defaults.bpmMin}–${data.defaults.bpmMax} BPM, snaps to analog values)`}>
            <input
              type="number"
              min={data.defaults.bpmMin}
              max={data.defaults.bpmMax}
              value={tempo}
              onChange={e => setTempo(parseInt(e.target.value, 10) || data.defaults.tempo)}
              onBlur={e => {
                const v = parseInt(e.target.value, 10)
                if (!Number.isFinite(v)) return
                const clamped = Math.max(data.defaults.bpmMin, Math.min(data.defaults.bpmMax, v))
                setTempo(snapToAnalogBpm(clamped))
              }}
              className={inputCls}
            />
          </Field>

          <button onClick={addToQueue} disabled={!canAdd} className={primaryBtn}>
            Add to queue{
              isScaleMinor && checkedVariantCount > 1 ? ` (${checkedVariantCount} variants)`
              : showInversions && checkedInversionCount > 1 ? ` (${checkedInversionCount} inversions)`
              : ''
            }
          </button>
        </section>

        {/* Preview — true page-for-page render of the real US Letter PDF. */}
        <section aria-label="PDF preview" className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">Preview</h2>
          <div className="border border-rule rounded-md bg-paper p-4">
            <PdfPreview queue={queue} data={data} onBlobChange={setPreviewBlob} />
          </div>
          {technique && (
            <p className="text-xs text-muted mt-3">{technique.description}</p>
          )}
        </section>

        {/* Queue */}
        <aside aria-label="Queue" className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">Queue</h2>
            {queue.length === 0 ? (
              <p className="text-sm text-muted">No techniques queued.</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((e, idx) => {
                  const k = data.keys.find(x => x.id === e.keyId)
                  const t = data.techniques.find(x => x.id === e.techniqueId)
                  const displayName = k?.name ?? seventhChordLabel(e.keyId) ?? e.keyId
                  const variantTag = e.variant ? ` · ${capitalize(e.variant)}` : ''
                  // Dominant 7ths share one technique name across inversions, so the
                  // inversion is tagged here (tonic-arpeggio inversions are already
                  // distinguished by their technique name).
                  const inversionTag = e.techniqueId === 'arp-dominant-7' && e.inversion != null
                    ? ` · ${SEVENTH_INVERSION_LABEL[e.inversion]}`
                    : ''
                  return (
                    <li key={e.id} className="border border-rule rounded-md px-3 py-2 bg-white text-sm">
                      <div className="font-medium text-ink leading-tight">
                        {displayName} — {t?.name}{variantTag}{inversionTag}
                      </div>
                      <div className="text-xs text-muted leading-tight">
                        {handLabel(e.hand)} · {e.octaves} oct · ♩ = {e.tempo}
                      </div>
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => move(idx, -1)} className={iconBtn} aria-label="Move up">↑</button>
                        <button onClick={() => move(idx, +1)} className={iconBtn} aria-label="Move down">↓</button>
                        <button onClick={() => remove(e.id)} className={iconBtn} aria-label="Remove">✕</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <button onClick={handleGeneratePDF} disabled={queue.length === 0} className={`${primaryBtn} mt-4 w-full`}>
              Generate PDF
            </button>
          </div>
        </aside>
      </main>
    </div>
  )
}

// Maelzel/analog metronome values — the classic mechanical-pendulum tick set.
// On blur the BPM input snaps the user's free-form integer to the nearest entry.
const ANALOG_BPM = [
  40, 42, 44, 46, 48, 50, 52, 54, 56, 58,
  60, 63, 66, 69, 72, 76, 80, 84, 88, 92,
  96, 100, 104, 108, 112, 116, 120, 126, 132, 138,
  144, 152, 160, 168, 176, 184, 192, 200, 208,
]
function snapToAnalogBpm(v: number): number {
  let closest = ANALOG_BPM[0]
  let best = Math.abs(v - closest)
  for (const x of ANALOG_BPM) {
    const d = Math.abs(v - x)
    if (d < best) { best = d; closest = x }
  }
  return closest
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function handLabel(h: HandConfig) {
  return h === 'RH' ? 'Right hand alone'
       : h === 'LH' ? 'Left hand alone'
       : h === 'separate' ? 'Hands separate'
       : 'Hands together'
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const selectCls = 'w-full border border-rule bg-white rounded-md px-3 py-2 text-sm text-ink focus:outline-none'
const inputCls = selectCls
const primaryBtn = 'inline-flex items-center justify-center bg-ink text-paper text-sm font-medium px-4 py-2 rounded-md hover:bg-black/85 active:bg-black/90 disabled:opacity-50 disabled:hover:bg-ink'
const keyBtn = 'min-w-[44px] min-h-[44px] inline-flex items-center justify-center border border-rule bg-white rounded-md text-sm font-medium text-ink hover:bg-paper transition-colors'
const keyBtnActive = '!bg-ink !text-paper !border-ink'
const iconBtn = 'border border-rule rounded-md w-8 h-8 text-sm leading-none hover:bg-paper'
