// Solmido — register engine.
//
// Decides, for one voice (one hand) of a technique, how to keep its notes near
// the staff using two independent, additive mechanisms:
//
//   1. A per-MEASURE base clef (treble/bass). Clef changes track the SUSTAINED
//      register and happen only at measure boundaries — the only place VexFlow can
//      change clef without inserting an in-voice ClefNote tickable (which would
//      desync the grand-staff RH/LH alignment). Decided from each measure's median
//      ledger demand, with hysteresis (a margin against the natural clef) and a
//      minimum-run length so a brief excursion never flips the clef.
//
//   2. Sub-measure OTTAVA runs (8va above / 8vb below). These cover BRIEF extremes
//      that poke beyond the base clef's comfortable ledger range — the top/bottom
//      few notes of a running scale. An ottava transposes the written pitch by one
//      octave (so it sits back on the staff) and draws a dashed bracket; it never
//      moves a notehead's x, so it can't disturb beat spacing or RH/LH alignment.
//      Runs are aligned to beat groups (= beam groups), use ledger-count hysteresis
//      (enter high, exit low) and a minimum dwell, and never cross a clef change.
//
// The split of labor — clef for sustained shifts, ottava for brief spikes — is
// what implements "prefer 8va/8vb over a clef change for brief excursions, reserve
// clef changes for longer, settled excursions." A long excursion shifts a run of
// measures' median past the boundary (clef change); a brief one doesn't (its
// single-measure clef preference is smoothed away) and is left to ottava.
//
// This module is PURE: no DOM, no VexFlow. It is unit-testable in isolation, and
// is consumed by notation.ts AFTER note layout is otherwise determined.

import type { Pitch } from './data/types'

// ============================================================================
// Tuning constants — pick sensible starting values, then verify against the
// rendered PDF across keys and octave counts and adjust here.
// ============================================================================

// A note is "out of comfortable range" for a clef once it needs MORE than this
// many ledger lines. ~3 is the Alfred/Hal-Leonard practical ceiling before a
// reader loses the line/space count at a glance.
export const LEDGER_LIMIT = 3

// ----- Clef selection (sustained register) -----
// Leave the voice's NATURAL clef only when the measure's MEDIAN note (robust to
// single passing notes) ALREADY needs more than the ledger limit in that clef —
// i.e. a sustained passage so far out that a single octave of ottava could not
// pull it back. This threshold is what reserves clef changes for excursions an
// 8va/8vb can't fix, leaving every shallower excursion to ottava. A 2-octave LH
// scale peaks at ~4 ledgers but its median stays at/under the limit, so it never
// changes clef; a 4-octave LH scale's middle measures sit a median ~5–6 ledgers
// up, so they do.
export const CLEF_ENTER_LEDGERS = LEDGER_LIMIT + 1   // 4
// And the other clef must save at least this many median ledger lines — plain
// hysteresis so a measure straddling the boundary doesn't switch on noise.
export const CLEF_SWITCH_SAVING = 2
// A clef change must be SUSTAINED: the new clef has to stay the better choice for
// this many consecutive measures (including the one where it starts). A lone
// high/low measure — most visibly the final descent of a scale in a low key —
// can't satisfy this, so it falls back to ottava instead of flipping the clef for
// one measure. (Inertia, below, still carries an established clef through a
// shorter dip mid-piece; this gate governs only the initial entry.)
export const CLEF_ENTER_RUN_MEASURES = 2
// Once a clef is in effect, hold it at least this many measures before switching
// again (minimum dwell). With clef inertia (stay until the register clearly drops
// back) this stops a descending run from flipping the clef back and forth across
// a turnaround.
export const CLEF_DWELL_MEASURES = 1

// ----- Ottava (brief excursions) -----
// Enter an ottava when a beat group's PEAK ledger demand (in the base clef)
// reaches this; leave it when the peak falls back to OTTAVA_EXIT_LEDGERS or less.
// ENTER strictly above LEDGER_LIMIT, EXIT well below it → a wide hysteresis band
// ([EXIT+1 .. ENTER-1]) that holds the bracket steady across a turnaround instead
// of toggling note-to-note.
export const OTTAVA_ENTER_LEDGERS = LEDGER_LIMIT + 1   // 4
export const OTTAVA_EXIT_LEDGERS  = LEDGER_LIMIT - 1   // 2
// An ottava bracket must span at least this many beat groups. 1 = a single beat
// group may carry an ottava (a sharp one-beat peak still gets a bracket rather
// than a pile of ledger lines); it only forbids zero-length brackets.
export const MIN_DWELL_BEATGROUPS = 1
// …and must cover at least this many notes. This drops a bracket over a lone note
// (e.g. a descending scale whose final held tonic just tips past the limit) —
// "a single passing note must not trigger" an ottava.
export const MIN_RUN_NOTES = 2

// ============================================================================
// Staff geometry (diatonic-step model)
// ============================================================================

// Diatonic-step index (DSI): a single integer counting staff positions (every
// line and every space is one step), so two pitches a third apart differ by 2.
// Accidentals are intentionally ignored — they never change ledger lines.
const STEP_INDEX: Record<Pitch['step'], number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }
export const dsi = (p: Pitch): number => p.octave * 7 + STEP_INDEX[p.step]

// Each clef's staff occupies DSI [bottomLine .. topLine] (5 lines, 4 spaces).
//   treble: bottom line E4 (DSI 30) … top line F5 (DSI 38)
//   bass:   bottom line G2 (DSI 18) … top line A3 (DSI 26)
const CLEF_STAFF: Record<'treble' | 'bass', { bottom: number; top: number }> = {
  treble: { bottom: 30, top: 38 },
  bass:   { bottom: 18, top: 26 },
}

// Ledger lines a DSI needs ABOVE the staff in a clef (0 if at/below the top line).
// Ledger lines sit two DSI apart starting two above the top line, so a note at DSI
// d above the top line t needs floor((d - t) / 2): d=t+1 (first space above)→0,
// d=t+2 (first ledger line)→1, d=t+3→1, d=t+4→2, …
export function ledgersAbove(d: number, clef: 'treble' | 'bass'): number {
  const t = CLEF_STAFF[clef].top
  return d > t ? Math.floor((d - t) / 2) : 0
}
// Ledger lines a DSI needs BELOW the staff in a clef (0 if at/above the bottom line).
export function ledgersBelow(d: number, clef: 'treble' | 'bass'): number {
  const b = CLEF_STAFF[clef].bottom
  return d < b ? Math.floor((b - d) / 2) : 0
}

// ============================================================================
// Inputs / outputs
// ============================================================================

export type Clef = 'treble' | 'bass'
export type OttavaDir = 'up' | 'down'   // 'up' = 8va (above), 'down' = 8vb (below)

// One ottava bracket: applies to notes [startIdx, endIdx) (end exclusive), as
// indices into the voice's flat note array.
export interface OttavaRun {
  startIdx: number
  endIdx: number
  dir: OttavaDir
}

export interface RegisterPlan {
  clefPerMeasure: Clef[]    // one entry per measure
  ottavaRuns: OttavaRun[]   // beat-group-aligned, never crossing a clef change
}

// A note reduced to what the engine needs: the highest and lowest DSI it spans
// (equal for a single pitch; a chord's outer voices for cadences/triads).
interface NoteExtent { hi: number; lo: number }

function extentOf(pitches: Pitch[]): NoteExtent {
  let hi = -Infinity, lo = Infinity
  for (const p of pitches) {
    const d = dsi(p)
    if (d > hi) hi = d
    if (d < lo) lo = d
  }
  return { hi, lo }
}

// Ledger demand of a note in a clef: how far its OUTER notehead pokes past the
// staff (above uses the top pitch, below uses the bottom pitch). One of the two
// is normally zero; we take the larger so the "cost" is the worst ledger run.
function noteLedgerCost(e: NoteExtent, clef: Clef): number {
  return Math.max(ledgersAbove(e.hi, clef), ledgersBelow(e.lo, clef))
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Split a voice's note count into per-measure counts: every measure holds
// `notesPerMeasure` except the last, which absorbs the remainder (the final
// half-note tail). Mirrors notation.ts's per-measure slicing exactly.
export function measureNoteCounts(total: number, notesPerMeasure: number, measureCount: number): number[] {
  const counts: number[] = []
  let used = 0
  for (let m = 0; m < measureCount; m++) {
    if (m === measureCount - 1) counts.push(total - used)
    else { counts.push(notesPerMeasure); used += notesPerMeasure }
  }
  return counts
}

// ============================================================================
// Stage 1 — per-measure base clef
// ============================================================================

function opposite(c: Clef): Clef { return c === 'treble' ? 'bass' : 'treble' }

function planClefs(extents: NoteExtent[], measureCounts: number[], naturalClef: Clef): Clef[] {
  const M = measureCounts.length
  const other = opposite(naturalClef)

  // Per-measure median ledger demand in EACH clef (robust to single passing notes).
  // The median, not the peak, is the "sustained register" signal — a lone high
  // note in an otherwise-comfortable measure barely moves it.
  const medNatural: number[] = new Array(M)
  const medOther: number[] = new Array(M)
  {
    let idx = 0
    for (let m = 0; m < M; m++) {
      const nat: number[] = [], oth: number[] = []
      for (let k = 0; k < measureCounts[m]; k++, idx++) {
        nat.push(noteLedgerCost(extents[idx], naturalClef))
        oth.push(noteLedgerCost(extents[idx], other))
      }
      medNatural[m] = median(nat)
      medOther[m] = median(oth)
    }
  }

  // Strong entry test at the measure where the change would start: its median note
  // is itself past the ledger limit in the natural clef (a settled excursion an
  // ottava couldn't fix) AND the other clef saves at least the hysteresis amount.
  const strongEntry = (m: number) =>
    medNatural[m] >= CLEF_ENTER_LEDGERS && medNatural[m] - medOther[m] >= CLEF_SWITCH_SAVING
  // Sustained-entry test: a strong entry whose new register PERSISTS — the other
  // clef stays at least as good through the lookahead window. The following
  // measures need only remain better (a descending return naturally relaxes toward
  // the middle); they need not stay past the ledger limit. A window that runs off
  // the end fails, so no clef change starts in the last (run-1) measures — that is
  // what keeps a low key's final descent on ottava instead of a one-measure clef
  // flip.
  const sustainedEntry = (m: number) => {
    if (!strongEntry(m)) return false
    if (m + CLEF_ENTER_RUN_MEASURES > M) return false
    for (let k = m + 1; k < m + CLEF_ENTER_RUN_MEASURES; k++) {
      if (medOther[k] > medNatural[k]) return false
    }
    return true
  }

  // Stateful walk with clef INERTIA + minimum dwell:
  //   • While in the natural clef, ENTER the other clef only on a sustained entry
  //     (a settled excursion an ottava couldn't fix).
  //   • Once in the other clef, STAY there (inertia) until the natural clef is
  //     again at least as good — so a descending return passing back through the
  //     middle doesn't flip the clef for a single measure.
  //   • A clef must be held CLEF_DWELL_MEASURES before it may switch again.
  const clef: Clef[] = new Array(M)
  let cur: Clef = naturalClef
  let dwell = CLEF_DWELL_MEASURES   // start "ready" to switch
  for (let m = 0; m < M; m++) {
    let switched = false
    if (dwell >= CLEF_DWELL_MEASURES) {
      if (cur === naturalClef) {
        if (sustainedEntry(m)) { cur = other; switched = true }
      } else {
        // EXIT back to the natural clef once it is no longer worse.
        if (medNatural[m] <= medOther[m]) { cur = naturalClef; switched = true }
      }
    }
    dwell = switched ? 0 : dwell + 1
    clef[m] = cur
  }
  return clef
}

// ============================================================================
// Stage 2 — beat-group-aligned ottava runs
// ============================================================================

function planOttava(
  extents: NoteExtent[],
  measureCounts: number[],
  clefPerMeasure: Clef[],
  beatGroupSize: number,
): OttavaRun[] {
  const N = extents.length
  if (N === 0) return []

  // Per-note base clef, expanded from the per-measure decision.
  const noteClef: Clef[] = new Array(N)
  {
    let idx = 0
    for (let m = 0; m < measureCounts.length; m++)
      for (let k = 0; k < measureCounts[m]; k++, idx++) noteClef[idx] = clefPerMeasure[m]
  }

  const g = Math.max(1, beatGroupSize)
  type Group = { start: number; end: number; clef: Clef; above: number; below: number }
  const groups: Group[] = []
  for (let s = 0; s < N; s += g) {
    const e = Math.min(s + g, N)
    let above = 0, below = 0
    for (let i = s; i < e; i++) {
      above = Math.max(above, ledgersAbove(extents[i].hi, noteClef[i]))
      below = Math.max(below, ledgersBelow(extents[i].lo, noteClef[i]))
    }
    groups.push({ start: s, end: e, clef: noteClef[s], above, below })
  }

  // Walk the beat groups with a hysteresis state machine to assign each group an
  // ottava state (none / up / down). ENTER at >LEDGER_LIMIT, EXIT at <=EXIT.
  type State = 'none' | OttavaDir
  const state: State[] = new Array(groups.length).fill('none')
  let cur: State = 'none'
  for (let i = 0; i < groups.length; i++) {
    const gr = groups[i]
    // A clef change resets the bracket: an ottava never spans two clefs.
    if (i > 0 && gr.clef !== groups[i - 1].clef) cur = 'none'

    if (cur === 'up') {
      if (gr.above <= OTTAVA_EXIT_LEDGERS) cur = 'none'
    } else if (cur === 'down') {
      if (gr.below <= OTTAVA_EXIT_LEDGERS) cur = 'none'
    }
    if (cur === 'none') {
      // Enter whichever side is over the line; if both (shouldn't happen for a
      // sane voice), take the more extreme.
      const wantUp = gr.above >= OTTAVA_ENTER_LEDGERS
      const wantDown = gr.below >= OTTAVA_ENTER_LEDGERS
      if (wantUp && (!wantDown || gr.above >= gr.below)) cur = 'up'
      else if (wantDown) cur = 'down'
    }
    state[i] = cur
  }

  // Coalesce consecutive same-state (and same-clef) groups into runs.
  const runs: OttavaRun[] = []
  let i = 0
  while (i < groups.length) {
    if (state[i] === 'none') { i++; continue }
    let j = i
    while (j < groups.length && state[j] === state[i] && groups[j].clef === groups[i].clef) j++
    const startIdx = groups[i].start, endIdx = groups[j - 1].end
    if (j - i >= MIN_DWELL_BEATGROUPS && endIdx - startIdx >= MIN_RUN_NOTES) {
      runs.push({ startIdx, endIdx, dir: state[i] as OttavaDir })
    }
    i = j
  }
  return runs
}

// ============================================================================
// Public entry
// ============================================================================

/**
 * Plan one voice's clef-per-measure and ottava runs.
 *
 * @param notes            the voice's flat note list (each note's pitches)
 * @param measureCounts    notes contained in each measure (sums to notes.length)
 * @param beatGroupSize    notes per beat group (= notesPerMeasure / 4 for 4/4)
 * @param naturalClef      the hand's home clef ('treble' for RH, 'bass' for LH)
 */
export function planVoiceRegister(
  notes: { pitches: Pitch[] }[],
  measureCounts: number[],
  beatGroupSize: number,
  naturalClef: Clef,
): RegisterPlan {
  const extents = notes.map(n => extentOf(n.pitches))
  const clefPerMeasure = planClefs(extents, measureCounts, naturalClef)
  const ottavaRuns = planOttava(extents, measureCounts, clefPerMeasure, beatGroupSize)
  return { clefPerMeasure, ottavaRuns }
}
