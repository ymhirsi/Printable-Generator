import {
  StaveNote, Annotation, Formatter, Stave, Renderer, Voice, Accidental,
  StaveConnector, Articulation, Modifier, Tuplet, Beam, Barline,
} from 'vexflow'
import type { RenderedTechnique, RenderedNote } from './techniques'
import type { Pitch, KeyDef } from './data/types'
import { planVoiceRegister, type Clef, type RegisterPlan, type OttavaRun, type OttavaDir } from './register'

// ----- Engraving constants -----
const DEFAULT_SCORE_SCALE = 0.82
const PDF_CONTENT_W       = 504
const STAFF_HEIGHT        = 124   // inter-staff distance — held fixed: in dense
                                  // 4-octave scales the hands already nearly meet
                                  // at the seam (~9 units), so this can't shrink.
const SYSTEM_GAP          = 22
// TOP_PAD / BOTTOM_PAD set the minimum SVG height floor (= TOP_PAD + 2·STAFF_HEIGHT
// + BOTTOM_PAD). The viewBox itself always tracks the true ink bounds, so these
// only act as a lower bound for sparse systems. Trimmed so 1–2 octave systems —
// whose ink doesn't reach the old floor — render shorter, which is what lets four
// systems share a page. Dense systems are ink-bound and unaffected. Pure spacing:
// the staff line spacing and glyph sizes are untouched.
const TOP_PAD             = 16
const BOTTOM_PAD          = 16
const VIEWBOX_MARGIN      = 6
const SYSTEM_LEFT_PAD     = 8     // left margin inside the SVG canvas
const SYSTEM_RIGHT_PAD    = 8
// Fingering numbers: previously 9pt and hard to read. Bumped for legibility on
// the printed sheet (effective size is this × DEFAULT_SCORE_SCALE).
const FINGERING_FONT_SIZE = 13
// R.H. / L.H. hand labels. Drawn in the reserved gutter to the LEFT of the first
// stave, vertically centered on their staff. The font was 9 (≈4.5pt printed
// after the per-technique scale) — too small to read; bumped so it prints clearly.
// HAND_LABEL_X is the text's left edge; it must stay ≥ -(LEFT_RESERVE - VIEWBOX_MARGIN)
// so the label never becomes the leftmost ink and shifts a system's viewBox.
const HAND_LABEL_FONT_SIZE = 16
const HAND_LABEL_X         = -34
// Reserved left gutter (internal units) that every system's viewBox includes,
// whether or not a hand label is drawn. The hand labels are now shown ONLY on the
// first system of a technique, but the viewBox left edge must stay identical across
// all systems of a technique — otherwise each system scales differently and their
// end bar lines stop lining up. We clamp viewX to -LEFT_RESERVE so the gutter (and
// thus the horizontal scale) is uniform regardless of label presence. Its value
// equals the old label-driven bound (label left -34 minus VIEWBOX_MARGIN 6).
const LEFT_RESERVE = 40
// Tempo marking (♩ = N): drawn at the system start, ABOVE the clef. VexFlow's
// StaveTempo otherwise offsets it rightward by the clef+keysig+timesig header
// width, which lands it on top of the first notehead and its fingering. We
// cancel that offset and re-seat the mark a couple of units in from the stave's
// left edge, clear of every notehead and fingering.
const TEMPO_SHIFT_Y = -14
const TEMPO_LEFT_PAD = 2
// Accidental → notehead spacing: VexFlow's default gap (~17–30 internal units)
// reads far too wide. Glue each accidental to this tight, uniform gap.
//
// The value is bounded above by the densest spacing the duration-proportional
// formatter produces. In the tightest 4-octave measures the uniform sixteenth
// spacing falls to ~24.1 internal units; a notehead (~11.9) plus the widest
// accidental (~10.1) already consume ~22.0, leaving only ~2.1 for the gap before
// an accidental would graze the PREVIOUS note's head. We use 2 so every printed
// accidental clears both its own notehead (sits immediately to its left) and the
// preceding notehead, in every key, with margin to spare.
const ACCIDENTAL_GAP = 2

// ----- Ottava (8va / 8vb) bracket engraving -----
// The bracket is an ADDITIVE overlay: the run's notes are transposed one octave so
// they sit back on the staff (no x change, no alignment change), and a dashed line
// + "8va"/"8vb" marking + end hook is drawn ABOVE (8va) / BELOW (8vb) the run's
// actual rendered ink. All placement is ink-driven (computed from the run's note
// group bounding boxes) so the bracket always clears noteheads, stems, ledger lines
// and fingerings, whatever the key or octave count. Drawn BEFORE the SVG text
// fix-up and bounds passes so its text is font-normalized and its extent expands
// the system's viewBox (keeping it clear of adjacent systems).
const OTTAVA_FONT_SIZE = 12    // "8va"/"8vb" marking (printed at × scoreScale)
const OTTAVA_PAD       = 6     // vertical gap from the run's extreme ink to the line
const OTTAVA_HOOK      = 7     // length of the end hook (points toward the notes)
const OTTAVA_TEXT_GAP  = 3     // gap between the marking and the start of the dashes
const OTTAVA_DASH: [number, number] = [4, 3]

const pitchKey = (p: Pitch): string => `${p.step}${p.accidental || ''}/${p.octave}`

function vfKeySignature(key: KeyDef): string {
  const major: Record<string, string> = {
    'c-major': 'C', 'g-major': 'G', 'd-major': 'D', 'a-major': 'A',
    'e-major': 'E', 'b-major': 'B', 'fs-major': 'F#',
    'f-major': 'F', 'bb-major': 'Bb', 'eb-major': 'Eb', 'ab-major': 'Ab',
    'db-major': 'Db', 'gb-major': 'Gb',
  }
  const minor: Record<string, string> = {
    'a-minor': 'Am', 'e-minor': 'Em', 'b-minor': 'Bm', 'fs-minor': 'F#m',
    'cs-minor': 'C#m', 'gs-minor': 'G#m', 'ds-minor': 'D#m',
    'd-minor': 'Dm', 'g-minor': 'Gm', 'c-minor': 'Cm', 'f-minor': 'Fm',
    'bb-minor': 'Bbm', 'eb-minor': 'Ebm',
  }
  return major[key.id] ?? minor[key.id] ?? 'C'
}

// Fingering/articulation side is determined by HAND, never by the per-measure
// clef. Because the clef is chosen per measure by the register engine, an RH
// measure can render in bass clef and an LH measure in treble clef — but the RH
// voice always draws on the top stave and LH on the bottom. So RH fingerings must
// always sit above the top staff and LH fingerings always below the bottom
// staff, regardless of clef, stem direction, or note position.
function makeStaveNote(
  rn: RenderedNote,
  clef: 'treble' | 'bass',
  hand: 'RH' | 'LH',
  opts: { suppressFermata?: boolean; octaveShift?: number } = {},
): StaveNote {
  // octaveShift transposes the WRITTEN pitch by whole octaves so an ottava run's
  // notes sit back on the staff: an 8va (sounds 8 higher) is written one octave
  // LOWER (shift −1), an 8vb (sounds 8 lower) one octave HIGHER (shift +1). The
  // bracket drawn later restores the intended pitch to the reader. Transposing by a
  // whole octave preserves pitch class and key-relative accidental, so
  // applyAccidentals still shows the correct accidentals.
  const shift = opts.octaveShift ?? 0
  const keys = shift === 0
    ? rn.pitches.map(pitchKey)
    : rn.pitches.map(p => `${p.step}${p.accidental || ''}/${p.octave + shift}`)
  // auto_stem lets VexFlow pick the stem direction per standard convention from
  // this note's own pitches relative to its staff middle line: notes/chords above
  // the middle line stem down, below stem up, symmetric chords default down. A
  // bare StaveNote would otherwise default to Stem.UP. For single notes and chords
  // (cadences, solid triads) this is the whole rule; beamed groups are unified
  // afterwards by Beam (see addBeams). Each staff of a grand staff builds its own
  // notes here, so the two hands direct independently from their own middle lines.
  const note = new StaveNote({ clef, keys, duration: rn.duration, auto_stem: true })
  if (rn.fingering !== undefined) {
    const ann = new Annotation(String(rn.fingering))
      .setFont('Helvetica', FINGERING_FONT_SIZE)
      .setJustification(Annotation.HorizontalJustify.CENTER)
      .setVerticalJustification(
        hand === 'RH' ? Annotation.VerticalJustify.TOP : Annotation.VerticalJustify.BOTTOM
      )
    note.addModifier(ann, 0)
  }
  // Fermatas are ALWAYS placed above the note, never flipped below — regardless
  // of stem direction or which staff/hand the note is on. On a grand staff the
  // RH (top-staff) note carries the fermata above the top staff; its LH partner
  // suppresses its own fermata (opts.suppressFermata) so exactly one fermata
  // sits above the system, vertically centered over the shared note column.
  // VexFlow already centers the 'a@a' glyph horizontally over the notehead.
  if (rn.fermata && !opts.suppressFermata) {
    const fermata = new Articulation('a@a').setPosition(Modifier.Position.ABOVE)
    note.addModifier(fermata, 0)
  }
  return note
}

// Re-seat a stave's tempo mark above its clef. Must be called AFTER the clef,
// key signature, time signature and tempo have all been added to the stave, so
// getModifierXShift() reflects the full header width we need to cancel.
function seatTempoAboveClef(stave: Stave): void {
  const headerWidth = stave.getModifierXShift()
  for (const m of stave.getModifiers(undefined, 'StaveTempo')) {
    ;(m as unknown as { setShiftX(x: number): void }).setShiftX(TEMPO_LEFT_PAD - headerWidth)
  }
}

// Measure the REAL header width of a system's first measure: the horizontal
// distance from the stave's left edge to where its notes begin, once the clef,
// key signature and (optional) time signature have been added. We probe a
// throwaway Stave carrying the same modifiers and read getNoteStartX() - getX();
// VexFlow's Stave.format() derives this from glyph metrics and needs no
// rendering context. The tempo mark is excluded on purpose — it's re-seated
// above the clef (seatTempoAboveClef) and consumes no note-start space.
//
// Using the MEASURED header instead of a fixed budget is the key to beat-
// proportional spacing reading uniformly: the first measure's note area then
// matches every other measure's exactly, widening only when the key signature
// genuinely has more accidentals (and staying tight for C major).
function measureHeaderWidth(keySig: string, timeSig?: string): number {
  const probe = new Stave(0, 0, 500)
  probe.addClef('treble')
  probe.addKeySignature(keySig)
  if (timeSig) probe.addTimeSignature(timeSig)
  return probe.getNoteStartX() - probe.getX()
}

// Note-start offset of a bare measure (no clef / key / time signature): the
// small begin-barline + padding that VexFlow puts before the first note of EVERY
// stave. Non-first measures still carry this, so if the width budget ignored it
// their note area would come out a few px narrower than the first measure's,
// making their beats read slightly tighter. We measure it and add it back to
// each rest measure's width so every measure's NOTE AREA is identical — the
// precondition for beats reading the same width across the whole system, not
// just within one measure.
function measureBareStart(): number {
  const probe = new Stave(0, 0, 500)
  return probe.getNoteStartX() - probe.getX()
}

// Extra note-start space a CUE-sized (small) mid-system clef consumes, over and
// above the bare begin-barline padding every measure already has. A clef change
// mid-system is engraved small (Alfred/Hal-Leonard convention); it pushes that
// measure's first note right by this much. We measure it on a throwaway Stave and
// fold it into the width budget of any measure that changes clef, so that
// measure's NOTE AREA still matches every other measure's (beats stay uniform and
// the system's end bar line stays aligned with the others).
function measureSmallClefExtra(): number {
  const probe = new Stave(0, 0, 500)
  probe.addClef('treble', 'small')
  return (probe.getNoteStartX() - probe.getX()) - measureBareStart()
}

/**
 * Re-space a formatted measure so every BEAT gets an equal width allotment and
 * each note occupies the combined width of all the beats it sustains through.
 * VexFlow's Formatter justifies with a *soft* algorithm (softmax of ticks, nudged
 * by per-tick modifier/geometry min-widths); that both crams equal-duration beats
 * unevenly AND under-allocates space to a genuinely long note (a half note landing
 * on beat 3 gets squeezed into ~one beat instead of spanning beats 3–4). This pass
 * replaces the soft distribution with a deterministic, strictly time-proportional
 * one:
 *
 *   • The whole measure note area is tiled by musical time. Each note's head is
 *     placed at the LEFT edge of a slot whose width is proportional to that note's
 *     duration:  x(i) = x0 + onset[i] / totalTicks * (noteEnd - x0).
 *   • Equal-duration notes therefore get identical slots (the common case — a beat
 *     of four sixteenths reads the same from beat to beat).
 *   • A longer note advances its onset further AND leaves its whole duration as
 *     trailing room, so a half note on beat 3 sits at the 2-beats-in mark and its
 *     sustain fills beats 3 and 4 out to the barline — never crammed into one beat.
 *
 * x0 is the Formatter's position for the first note, so its leading pad (room for
 * the clef/barline and the note's own left accidental) is preserved; noteEnd is the
 * stave's note-area right boundary, just inside the end barline. Every notehead
 * lands at or before noteEnd, so nothing crosses the system's shared end line.
 * Fingerings/accidentals are re-anchored to their noteheads later (SVG fix-up
 * pass), so moving a notehead carries its annotations with it.
 *
 * Ticks are read AFTER any tuplet multiplier (applyTripletTiming) so triplet
 * groups space as true equal-duration triplets.
 */
function enforceEvenSpacing(notes: StaveNote[]): void {
  const n = notes.length
  if (n < 2) return
  const stave = notes[0].getStave()
  if (!stave) return
  const onset: number[] = new Array(n)
  let acc = 0
  for (let i = 0; i < n; i++) { onset[i] = acc; acc += notes[i].getTicks().value() }
  const totalTicks = acc
  if (totalTicks <= 0) return
  const x0 = notes[0].getNoteHeadBeginX()
  const usable = stave.getNoteEndX() - x0
  if (usable <= 0) return
  const pxPerTick = usable / totalTicks
  for (let i = 1; i < n; i++) {
    const desiredX = x0 + pxPerTick * onset[i]
    const dx = desiredX - notes[i].getNoteHeadBeginX()
    if (Math.abs(dx) > 1e-6) notes[i].setXShift(notes[i].getXShift() + dx)
  }
}

/**
 * THE central grand-staff formatter. Every two-staff (grand / hands-separate)
 * render MUST go through this — no technique may format its two hands
 * independently. It guarantees that any RH note and its corresponding LH note
 * on the same beat share the EXACT same x-coordinate, so a vertical line dropped
 * from any RH notehead passes through the center of its LH partner.
 *
 * Three layers of enforcement:
 *  1. Equalize both staves' note-start x (treble & bass clef glyphs differ in
 *     width, which would otherwise offset the two note rows on the first/clef-
 *     change measures).
 *  2. ONE shared formatting pass — the two voices are joined and formatted
 *     together, so horizontal spacing derives from a single computation.
 *  3. A final hard snap: each LH notehead is shifted to its partner RH
 *     notehead's exact x. With pure StaveNote voices steps 1–2 already align
 *     them; the snap also absorbs any residual chord/accidental x-shift (e.g.
 *     cadence chords) so the guarantee is exact, not approximate.
 *
 * Precondition: rhNotes[i] and lhNotes[i] are the i-th simultaneous notes
 * (equal lengths). Callers assert this.
 */
function formatGrandStaff(
  rhVoice: Voice, lhVoice: Voice,
  rhStave: Stave, lhStave: Stave,
  rhNotes: StaveNote[], lhNotes: StaveNote[],
): void {
  const startX = Math.max(rhStave.getNoteStartX(), lhStave.getNoteStartX())
  rhStave.setNoteStartX(startX)
  lhStave.setNoteStartX(startX)

  new Formatter().joinVoices([rhVoice, lhVoice]).formatToStave([rhVoice, lhVoice], rhStave)

  // Bind each notehead-bearing tickable to its stave so getNoteHeadBeginX()
  // (= absolute x + x-shift) is well-defined before we draw.
  for (const sn of rhNotes) sn.setStave(rhStave)
  for (const sn of lhNotes) sn.setStave(lhStave)

  // Regularize the RH row to strict onset-proportional spacing (this is where
  // the joined-voice softmax cramming is removed), then snap LH onto it — so
  // both hands inherit the even columns AND stay perfectly aligned.
  enforceEvenSpacing(rhNotes)

  const n = Math.min(rhNotes.length, lhNotes.length)
  for (let i = 0; i < n; i++) {
    const dx = rhNotes[i].getNoteHeadBeginX() - lhNotes[i].getNoteHeadBeginX()
    if (Math.abs(dx) > 1e-6) lhNotes[i].setXShift(lhNotes[i].getXShift() + dx)
  }
}

export interface RenderOptions { width: number }
export interface RenderOutput  { svg: SVGElement; width: number; height: number }

/**
 * Render one system. The system contains M measures, each rendered as its own
 * VexFlow Stave (for single-staff layouts) or Stave-pair (for grand staff).
 * Bar lines between measures are natural Stave end-barlines; the final
 * measure of the final system uses a light-light double bar.
 */
function renderOneSystem(args: {
  host: HTMLElement
  rt: RenderedTechnique
  keyDef: KeyDef
  rhSlice: RenderedNote[]
  lhSlice: RenderedNote[] | null
  showTimeSig: boolean
  showHandLabels: boolean          // R.H./L.H. labels: only on a technique's first system
  internalWidth: number
  scoreScale: number
  isLastSystem: boolean
  measureCount: number             // number of measures in this system
  notesPerMeasure: number          // notes per full measure (rhythm-dependent)
  rhClefs: Clef[]                  // base clef per measure for the top/single stave
  lhClefs: Clef[] | null           // base clef per measure for the bottom stave
  rhOttava: OttavaRun[]            // ottava runs for the top/single voice (system-local indices)
  lhOttava: OttavaRun[] | null     // ottava runs for the bottom voice (system-local indices)
}): RenderOutput {
  const {
    host, rt, keyDef, rhSlice, lhSlice, showTimeSig, showHandLabels, internalWidth,
    scoreScale, isLastSystem, measureCount, notesPerMeasure, rhClefs, lhClefs,
    rhOttava, lhOttava,
  } = args

  const sysHost = document.createElement('div')
  host.appendChild(sysHost)

  const isTwoStaff = !!lhSlice
  const yTop = TOP_PAD
  const totalHeight = TOP_PAD + (isTwoStaff ? STAFF_HEIGHT * 2 : STAFF_HEIGHT) + BOTTOM_PAD

  const keySig = vfKeySignature(keyDef)

  // Layout: M measures share the available horizontal width, and EVERY measure
  // must end up with the same note area so beats read the same width across the
  // whole system. A per-measure leading offset (measured, not budgeted) eats into
  // that area: measure 0 carries the full clef+key+time header; every measure
  // carries a begin-barline pad; and a measure that changes clef mid-system carries
  // an extra cue-clef width. Each measure gets one shared note area `A` PLUS its own
  // offset, so the total stays Σ(A + offset_m) = M·A + Σoffset = availableWidth for
  // ANY offsets — every system still starts and ends at the same x. (Details below.)
  const availableWidth = internalWidth - SYSTEM_LEFT_PAD - SYSTEM_RIGHT_PAD
  const firstHeader = measureHeaderWidth(keySig, showTimeSig ? rt.timeSignature : undefined)
  const bareStart = measureBareStart()
  const smallClefExtra = measureSmallClefExtra()

  // Per-measure leading offset (the space before its first note):
  //   • measure 0 carries the full header (clef + key sig + optional time sig);
  //   • every later measure carries the bare begin-barline padding, PLUS a cue
  //     clef's width whenever either stave changes clef at that measure.
  // Each measure's note area = (availableWidth − Σ offsets) / measureCount is then
  // identical, and Σ measureWidth = availableWidth regardless of how many measures
  // change clef — so beats read the same width everywhere and every system still
  // ends at the same x (shared end bar line).
  const offsets: number[] = []
  for (let m = 0; m < measureCount; m++) {
    if (m === 0) { offsets.push(firstHeader); continue }
    const topChange = rhClefs[m] !== rhClefs[m - 1]
    const botChange = lhClefs ? lhClefs[m] !== lhClefs[m - 1] : false
    offsets.push(bareStart + (topChange || botChange ? smallClefExtra : 0))
  }
  const offsetSum = offsets.reduce((a, b) => a + b, 0)
  const noteAreaPerMeasure = (availableWidth - offsetSum) / measureCount
  const measureWidths = offsets.map(off => noteAreaPerMeasure + off)

  // Slice the system's notes into per-measure chunks.
  const rhMeasures: RenderedNote[][] = []
  const lhMeasures: (RenderedNote[] | null)[] = []
  {
    let idx = 0
    for (let m = 0; m < measureCount; m++) {
      const take = Math.min(notesPerMeasure, rhSlice.length - idx)
      rhMeasures.push(rhSlice.slice(idx, idx + take))
      lhMeasures.push(lhSlice ? lhSlice.slice(idx, idx + take) : null)
      idx += take
    }
    // Any leftover notes (the final half + fermata that pads the last measure
    // when the scale doesn't divide evenly) go in the last measure.
    if (idx < rhSlice.length) {
      const lastIdx = rhMeasures.length - 1
      rhMeasures[lastIdx].push(...rhSlice.slice(idx))
      if (lhMeasures[lastIdx] && lhSlice) {
        lhMeasures[lastIdx]!.push(...lhSlice.slice(idx))
      }
    }
  }

  // Per-note octave shift for the ottava overlay (system-local note index → shift):
  // 'up' (8va) renders one octave lower (−1), 'down' (8vb) one octave higher (+1).
  // rhMeasures concatenated in order equals rhSlice in order, so a running cursor
  // over the measure loop indexes these arrays directly.
  const rhShift = buildOttavaShift(rhSlice.length, rhOttava)
  const lhShift = lhSlice ? buildOttavaShift(lhSlice.length, lhOttava ?? []) : []

  const renderer = new Renderer(sysHost as HTMLDivElement, Renderer.Backends.SVG)
  renderer.resize(internalWidth, totalHeight)
  const ctx = renderer.getContext()
  ctx.setFont('Helvetica', 10)

  const beams: Beam[] = []

  let xCursor = SYSTEM_LEFT_PAD
  let noteBase = 0   // running system-local index of the first note in this measure
  for (let m = 0; m < measureCount; m++) {
    const isFirstMeasure = m === 0
    const isLastMeasure  = m === measureCount - 1
    const measureWidth = measureWidths[m]

    const rhNotes = rhMeasures[m]
    const lhNotes = lhMeasures[m]

    const endBar = (isLastMeasure && isLastSystem) ? Barline.type.DOUBLE : Barline.type.SINGLE

    if (!isTwoStaff) {
      const v = rt.voices[0]
      const clef = rhClefs[m]
      // Redraw the clef at the start of every system (m === 0, full size) and
      // wherever the base clef changes mid-system (cue/small size).
      const showClef = isFirstMeasure || clef !== rhClefs[m - 1]

      const stave = new Stave(xCursor, yTop, measureWidth)
      if (showClef) stave.addClef(clef, isFirstMeasure ? 'default' : 'small')
      if (isFirstMeasure) {
        stave.addKeySignature(keySig)
        if (showTimeSig && rt.timeSignature) stave.addTimeSignature(rt.timeSignature)
        if (showTimeSig) {
          stave.setTempo({ duration: 'q', bpm: rt.tempo }, TEMPO_SHIFT_Y)
          seatTempoAboveClef(stave)
        }
      }
      stave.setEndBarType(endBar)
      stave.setContext(ctx).draw()
      if (isFirstMeasure && showHandLabels) drawHandLabel(ctx, v.hand, stave)

      const staveNotes = rhNotes.map((rn, k) => makeStaveNote(rn, clef, v.hand, { octaveShift: rhShift[noteBase + k] }))
      const voice = new Voice({ num_beats: 1, beat_value: 4 }).setStrict(false)
      voice.addTickables(staveNotes)
      Accidental.applyAccidentals([voice], keySig)
      applyTripletTiming(rhNotes, staveNotes)
      addBeams(rhNotes, staveNotes, beams)
      new Formatter().joinVoices([voice]).formatToStave([voice], stave)
      for (const sn of staveNotes) sn.setStave(stave)
      enforceEvenSpacing(staveNotes)
      voice.draw(ctx, stave)
    } else {
      // RH and LH MUST have identical note counts per measure for vertical
      // alignment to be meaningful. The slices come from the same source array,
      // so this is a structural invariant; assert it.
      if (rhNotes.length !== lhNotes!.length) {
        throw new Error(
          `HT alignment error: measure has ${rhNotes.length} RH notes vs ${lhNotes!.length} LH notes`
        )
      }

      const topClef = rhClefs[m]
      const botClef = lhClefs![m]
      // Full-size clef at every system start; cue/small clef at a mid-system change.
      const showTop = isFirstMeasure || topClef !== rhClefs[m - 1]
      const showBot = isFirstMeasure || botClef !== lhClefs![m - 1]

      const trebleStave = new Stave(xCursor, yTop, measureWidth)
      const bassStave   = new Stave(xCursor, yTop + STAFF_HEIGHT, measureWidth)
      if (showTop) trebleStave.addClef(topClef, isFirstMeasure ? 'default' : 'small')
      if (showBot) bassStave.addClef(botClef, isFirstMeasure ? 'default' : 'small')
      if (isFirstMeasure) {
        trebleStave.addKeySignature(keySig)
        bassStave.addKeySignature(keySig)
        if (showTimeSig && rt.timeSignature) {
          trebleStave.addTimeSignature(rt.timeSignature)
          bassStave.addTimeSignature(rt.timeSignature)
        }
        if (showTimeSig) {
          trebleStave.setTempo({ duration: 'q', bpm: rt.tempo }, TEMPO_SHIFT_Y)
          seatTempoAboveClef(trebleStave)
        }
      }
      trebleStave.setEndBarType(endBar)
      bassStave.setEndBarType(endBar)

      trebleStave.setContext(ctx).draw()
      bassStave.setContext(ctx).draw()

      if (isFirstMeasure && showHandLabels) {
        drawHandLabel(ctx, 'RH', trebleStave)
        drawHandLabel(ctx, 'LH', bassStave)
      }

      if (rt.layout === 'grand') {
        if (isFirstMeasure) {
          new StaveConnector(trebleStave, bassStave).setType(StaveConnector.type.BRACE).setContext(ctx).draw()
          new StaveConnector(trebleStave, bassStave).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw()
        }
        const rightType = (isLastMeasure && isLastSystem)
          ? StaveConnector.type.THIN_DOUBLE
          : StaveConnector.type.SINGLE_RIGHT
        new StaveConnector(trebleStave, bassStave).setType(rightType).setContext(ctx).draw()
      }

      // Both hands are PURE StaveNote sequences (no ClefNote tickables) with
      // identical length → identical tick structure. Clef changes are carried
      // by the staves above, never by in-voice tickables.
      const trebleStaveNotes = rhNotes.map((rn, k) => makeStaveNote(rn, topClef, 'RH', { octaveShift: rhShift[noteBase + k] }))
      const bassStaveNotes   = lhNotes!.map((rn, k) => makeStaveNote(rn, botClef, 'LH', { suppressFermata: true, octaveShift: lhShift[noteBase + k] }))

      const trebleVoice = new Voice({ num_beats: 1, beat_value: 4 }).setStrict(false)
      const bassVoice   = new Voice({ num_beats: 1, beat_value: 4 }).setStrict(false)
      trebleVoice.addTickables(trebleStaveNotes)
      bassVoice.addTickables(bassStaveNotes)

      Accidental.applyAccidentals([trebleVoice, bassVoice], keySig)
      applyTripletTiming(rhNotes, trebleStaveNotes)
      applyTripletTiming(lhNotes!, bassStaveNotes)
      addBeams(rhNotes, trebleStaveNotes, beams)
      addBeams(lhNotes!, bassStaveNotes, beams)

      // ONE shared formatting pass + hard x-snap. This is the single rule that
      // governs every grand-staff render in the app.
      formatGrandStaff(trebleVoice, bassVoice, trebleStave, bassStave, trebleStaveNotes, bassStaveNotes)
      trebleVoice.draw(ctx, trebleStave)
      bassVoice.draw(ctx, bassStave)
    }

    xCursor += measureWidth
    noteBase += rhNotes.length
  }

  for (const b of beams) b.setContext(ctx).draw()

  const svg = sysHost.querySelector('svg') as SVGElement

  // Draw the ottava brackets BEFORE the text fix-up and bounds passes: the note
  // groups are now in the DOM (one g.vf-stavenote per note, in measure order:
  // measure-0 RH notes, then measure-0 LH notes, then measure-1 …), so we can find
  // each run's notes by their system-local index and place an ink-driven dashed
  // bracket above (8va) / below (8vb) them. Drawing here means the "8va"/"8vb" text
  // is normalized by the font pass and the bracket extent expands the viewBox.
  {
    const allGroups = Array.from(svg.querySelectorAll('g.vf-stavenote'))
    const rhGroups: Element[] = []
    const lhGroups: Element[] = []
    let gi = 0
    for (let m = 0; m < measureCount; m++) {
      const rc = rhMeasures[m].length
      for (let k = 0; k < rc; k++) rhGroups.push(allGroups[gi++])
      if (isTwoStaff) {
        const lc = lhMeasures[m]!.length
        for (let k = 0; k < lc; k++) lhGroups.push(allGroups[gi++])
      }
    }
    for (const run of rhOttava) drawOttavaBracket(ctx, rhGroups.slice(run.startIdx, run.endIdx), run.dir)
    if (lhOttava) for (const run of lhOttava) drawOttavaBracket(ctx, lhGroups.slice(run.startIdx, run.endIdx), run.dir)
  }

  svg.querySelectorAll('text').forEach(el => {
    const ff = el.getAttribute('font-family') || ''
    if (/times/i.test(ff)) el.setAttribute('font-family', 'times')
    else if (/courier|mono/i.test(ff)) el.setAttribute('font-family', 'courier')
    else el.setAttribute('font-family', 'helvetica')
    if (!el.getAttribute('fill')) el.setAttribute('fill', '#000')
    const fs = el.getAttribute('font-size') || ''
    const m = fs.match(/^(\d+(?:\.\d+)?)\s*pt$/i)
    if (m) el.setAttribute('font-size', m[1])
  })

  // Center each fingering digit horizontally over its note's column. VexFlow
  // anchors annotation text by its LEFT edge (text-anchor=start) using an
  // inflated width estimate for non-metric fonts, which leaves single-digit
  // fingerings ~one notehead-width left of the note. Re-anchor each fingering
  // to the geometric center of its stave-note's principal notehead column so
  // the number sits directly above (RH) / below (LH) the note it belongs to.
  svg.querySelectorAll('g.vf-stavenote').forEach(group => {
    const fingerings = Array.from(group.querySelectorAll('text'))
      .filter(t => /^[1-5]$/.test(t.textContent || ''))
    if (!fingerings.length) return
    // Principal column = leftmost notehead center (a displaced 2nd sits right).
    // VexFlow draws the notehead glyph FIRST into each g.vf-notehead, then appends
    // any accidental/articulation glyphs as later sibling <path>s — so paths[0] is
    // always the notehead. We must NOT pick by x-position: enforceEvenSpacing
    // shifts the notehead via x-shift but not its accidental (drawn from the note's
    // unshifted x), so the accidental can sit to the RIGHT of its notehead, and a
    // double-sharp glyph is as short as a notehead so height can't disambiguate.
    // Path order is the one reliable invariant.
    let colCx = Infinity
    group.querySelectorAll('g.vf-notehead').forEach(head => {
      const head0 = head.querySelector(':scope > path') as SVGGraphicsElement | null
      if (!head0) return
      const glyph = head0.getBBox()
      const cx = glyph.x + glyph.width / 2
      if (cx < colCx) colCx = cx
    })
    if (!isFinite(colCx)) return
    for (const t of fingerings) {
      t.setAttribute('text-anchor', 'middle')
      t.setAttribute('x', String(colCx))
    }
  })

  // Per-notehead glyph fix-ups. VexFlow renders an accidental and/or a fermata
  // as sibling <path>s inside the same g.vf-notehead as the notehead glyph:
  //   • an accidental should sit to the LEFT of the notehead, roughly level with it;
  //   • a fermata sits ABOVE the notehead.
  // Two problems to correct here:
  //   1. Accidental gap — VexFlow's default is too wide, and on a grand staff
  //      (RH/LH share a tick → one shared modifier context) it's also uneven
  //      between hands. Also: enforceEvenSpacing nudges each notehead by x-shift,
  //      but an accidental is drawn from the note's UNSHIFTED absolute x, so it can
  //      end up far to the left of (note shifted right) or even to the RIGHT of
  //      (note shifted left) its own notehead. Re-glue every accidental to a tight,
  //      uniform gap on the notehead's left, regardless of where it started.
  //   2. Fermata centering — VexFlow centers the fermata over the note's
  //      pre-justification x, so after the grand-staff formatting pass it can
  //      drift off the notehead. Re-center it over the notehead column, exactly
  //      as we do for fingerings.
  // Identifying the notehead: VexFlow draws the notehead glyph FIRST into the group,
  // then appends accidental/articulation glyphs — so paths[0] is ALWAYS the notehead.
  // This is the only reliable discriminator: x-position fails because an accidental
  // can land on either side of the notehead, and glyph height fails because a
  // double-sharp glyph is as short (h≈10) as a notehead.
  svg.querySelectorAll('g.vf-notehead').forEach(head => {
    const paths = Array.from(head.children).filter(
      c => c.tagName.toLowerCase() === 'path',
    ) as SVGGraphicsElement[]
    if (paths.length < 2) return
    const notehead = paths[0]
    const nb = notehead.getBBox()
    const nCx = nb.x + nb.width / 2
    const nCy = nb.y + nb.height / 2

    const accs: SVGGraphicsElement[] = []
    for (let i = 1; i < paths.length; i++) {
      const p = paths[i]
      const b = p.getBBox()
      const cy = b.y + b.height / 2
      if (cy < nCy - 15) {
        // Well above the notehead → fermata (or other above-articulation). Center
        // it horizontally over the notehead column.
        const dxC = nCx - (b.x + b.width / 2)
        if (Math.abs(dxC) > 0.5) p.setAttribute('transform', `translate(${dxC.toFixed(2)}, 0)`)
      } else {
        // Roughly level with the notehead → accidental. Collect and re-glue below.
        accs.push(p)
      }
    }
    if (accs.length) {
      let maxRight = -Infinity
      for (const a of accs) { const b = a.getBBox(); if (b.x + b.width > maxRight) maxRight = b.x + b.width }
      // Seat the accidental group so its rightmost edge sits exactly ACCIDENTAL_GAP
      // to the left of the notehead — pulling the group LEFT when it overlaps the
      // notehead, nudging it RIGHT when the Formatter left it too far away. Moving
      // the whole group by one dx preserves the relative spacing of any stacked
      // accidentals. The uniform note spacing leaves room for this gap without the
      // accidental crashing the previous note's head.
      const dx = nb.x - ACCIDENTAL_GAP - maxRight
      if (Math.abs(dx) > 0.1) for (const a of accs) a.setAttribute('transform', `translate(${dx.toFixed(2)}, 0)`)
    }
  })

  const bbox = computeSvgContentBounds(svg, internalWidth, totalHeight)
  // Always reserve the same left gutter (-LEFT_RESERVE) so every system of a
  // technique scales identically and their end bar lines stay aligned — even
  // though the R.H./L.H. labels (which used to anchor this edge) now appear only
  // on the first system.
  const viewX = Math.min(0, bbox.minX - VIEWBOX_MARGIN, -LEFT_RESERVE)
  const viewY = Math.min(0, bbox.minY - VIEWBOX_MARGIN)
  const viewW = Math.max(internalWidth, bbox.maxX + VIEWBOX_MARGIN) - viewX
  const viewH = Math.max(totalHeight, bbox.maxY + VIEWBOX_MARGIN) - viewY

  const displayW = Math.round(viewW * scoreScale)
  const displayH = Math.round(viewH * scoreScale)
  svg.setAttribute('viewBox', `${viewX} ${viewY} ${viewW} ${viewH}`)
  svg.setAttribute('width',  String(displayW))
  svg.setAttribute('height', String(displayH))
  sysHost.style.display = 'block'
  sysHost.style.marginBottom = `${SYSTEM_GAP * scoreScale}px`

  return { svg, width: displayW, height: displayH }
}

// Parse the leading translate(dx, dy) from an element's transform attribute.
// The accidental/fermata fix-up pass re-seats glyphs with `translate(dx, 0)`, and
// getBBox() reports an element's bounds in its LOCAL frame — i.e. BEFORE its own
// transform. So a stranded accidental we visually glued back to its notehead still
// reads at its original (pre-fix-up) x under getBBox. Folding the translate back in
// gives the element's TRUE rendered bounds.
function translateOf(el: Element): { dx: number; dy: number } {
  const tf = el.getAttribute('transform')
  if (!tf) return { dx: 0, dy: 0 }
  const m = /translate\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?/.exec(tf)
  if (!m) return { dx: 0, dy: 0 }
  return { dx: parseFloat(m[1]) || 0, dy: m[2] ? parseFloat(m[2]) || 0 : 0 }
}

function computeSvgContentBounds(
  svg: SVGElement,
  fallbackW: number,
  fallbackH: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX =  Infinity, minY =  Infinity
  let maxX = -Infinity, maxY = -Infinity
  const all = svg.querySelectorAll('path, line, rect, polygon, polyline, circle, ellipse, text')
  all.forEach(el => {
    try {
      const bb = (el as SVGGraphicsElement).getBBox()
      if (bb.width === 0 && bb.height === 0) return
      // Account for any translate the fix-up pass applied to this element, so the
      // bounds track where the glyph is actually drawn — not its pre-fix-up x. This
      // keeps a re-seated accidental from inflating the viewBox to one side, which
      // would otherwise shift this system's stave end line out of alignment with the
      // others once every system is scaled to the shared PDF content width.
      const { dx, dy } = translateOf(el)
      const x = bb.x + dx, y = bb.y + dy
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x + bb.width  > maxX) maxX = x + bb.width
      if (y + bb.height > maxY) maxY = y + bb.height
    } catch { /* not in render tree */ }
  })
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = fallbackW; maxY = fallbackH }
  return { minX, minY, maxX, maxY }
}

function chooseSystemSizes(totalNotes: number, maxPerSys: number): number[] {
  if (totalNotes <= maxPerSys) return [totalNotes]
  const sysCount = Math.ceil(totalNotes / maxPerSys)
  const base = Math.floor(totalNotes / sysCount)
  const rem = totalNotes % sysCount
  return Array.from({ length: sysCount }, (_, i) => (i < rem ? base + 1 : base))
}

export function renderTechniqueSystems(
  host: HTMLElement,
  rt: RenderedTechnique,
  keyDef: KeyDef,
  opts: RenderOptions,
): RenderOutput[] {
  host.innerHTML = ''
  const scoreScale = rt.scoreScale ?? DEFAULT_SCORE_SCALE
  const availableWidth = Math.min(opts.width, PDF_CONTENT_W)
  const internalWidth = Math.round(availableWidth / scoreScale)

  // For scales: rt.systemSizes + rt.systemMeasures are pre-computed.
  // For other techniques (no measure structure): fall back to one-measure-per-system.
  const sizes = rt.systemSizes ?? chooseSystemSizes(rt.totalNotes, 16)
  const measureCounts =
    rt.systemMeasures && rt.systemMeasures.length === sizes.length
      ? rt.systemMeasures
      : sizes.map(() => 1)
  const notesPerMeasure = rt.notesPerMeasure ?? rt.totalNotes

  const out: RenderOutput[] = []
  const isTwoStaff = rt.layout !== 'single'

  // Plan each voice's register (base clef per measure + ottava runs) ONCE over the
  // whole technique — not per system — so a clef change can carry across a system
  // boundary and the decision sees the full pitch contour. The per-measure note
  // counts are derived to EXACTLY mirror renderOneSystem's per-measure slicing
  // (every measure holds notesPerMeasure except the last measure of each system,
  // which absorbs that system's leftover half-note tail), so clefPerMeasure aligns
  // 1:1 with the measures actually rendered.
  const perMeasureCounts = measuresToNoteCounts(sizes, measureCounts, notesPerMeasure)
  const beatGroupSize = Math.max(1, Math.round(notesPerMeasure / 4))
  const rhPlan: RegisterPlan = planVoiceRegister(
    rt.voices[0].notes, perMeasureCounts, beatGroupSize, rt.voices[0].clef as Clef,
  )
  const lhPlan: RegisterPlan | null = isTwoStaff
    ? planVoiceRegister(rt.voices[1].notes, perMeasureCounts, beatGroupSize, rt.voices[1].clef as Clef)
    : null

  let idx = 0       // running note index across systems
  let measIdx = 0   // running measure index across systems
  for (let s = 0; s < sizes.length; s++) {
    const size = sizes[s]
    const mc = measureCounts[s]
    const rhSlice = rt.voices[0].notes.slice(idx, idx + size)
    const lhSlice = isTwoStaff ? rt.voices[1].notes.slice(idx, idx + size) : null
    const rhClefs = rhPlan.clefPerMeasure.slice(measIdx, measIdx + mc)
    const lhClefs = lhPlan ? lhPlan.clefPerMeasure.slice(measIdx, measIdx + mc) : null
    // Re-base each voice's ottava runs to this system's note window so the bracket
    // indices line up with the per-system note groups.
    const rhOttava = localizeOttavaRuns(rhPlan.ottavaRuns, idx, size)
    const lhOttava = lhPlan ? localizeOttavaRuns(lhPlan.ottavaRuns, idx, size) : null
    out.push(renderOneSystem({
      host, rt, keyDef, rhSlice, lhSlice,
      showTimeSig: s === 0,
      showHandLabels: s === 0,
      internalWidth, scoreScale,
      isLastSystem: s === sizes.length - 1,
      measureCount: mc,
      notesPerMeasure,
      rhClefs, lhClefs,
      rhOttava, lhOttava,
    }))
    idx += size
    measIdx += mc
  }
  return out
}

// Expand the per-SYSTEM note sizes into a flat per-MEASURE note-count array that
// mirrors renderOneSystem's slicing exactly: within each system every measure
// takes `notesPerMeasure`, except that system's last measure, which absorbs the
// system's remaining notes (the final held tone + fermata tail). The register
// engine consumes this so its clefPerMeasure indexes line up with the rendered
// measures.
function measuresToNoteCounts(
  sizes: number[], measureCounts: number[], notesPerMeasure: number,
): number[] {
  const counts: number[] = []
  for (let s = 0; s < sizes.length; s++) {
    const mc = measureCounts[s]
    let rem = sizes[s]
    for (let m = 0; m < mc; m++) {
      if (m === mc - 1) counts.push(rem)
      else { counts.push(notesPerMeasure); rem -= notesPerMeasure }
    }
  }
  return counts
}

export function renderTechniqueToHost(
  host: HTMLElement,
  rt: RenderedTechnique,
  keyDef: KeyDef,
  opts: RenderOptions,
): RenderOutput {
  const systems = renderTechniqueSystems(host, rt, keyDef, opts)
  const width  = systems.reduce((m, s) => Math.max(m, s.width), 0)
  const scoreScale = rt.scoreScale ?? DEFAULT_SCORE_SCALE
  const gap = SYSTEM_GAP * scoreScale
  const height = systems.reduce((acc, s) => acc + s.height, 0) + (systems.length - 1) * gap
  return { svg: systems[0]?.svg ?? document.createElementNS('http://www.w3.org/2000/svg', 'svg'), width, height }
}

// ----- Tuplets / beams / labels -----
// Build a Tuplet for every eighth-note-triplet group of 3 (three-octave scales).
// Constructing the Tuplet is what matters for RHYTHM and SPACING: its attach()
// applies the 3:2 tick multiplier to each note, so the formatter spaces the
// group as a true triplet. We deliberately DO NOT draw the tuplet — the "3"
// numeral collided with the fingering digits and read as clutter, so it's
// suppressed. bracketed:false means there'd be no bracket anyway; the triplet
// beam (added separately by addBeams) still groups the three notes visually.
function applyTripletTiming(rn: RenderedNote[], notes: StaveNote[]) {
  for (let i = 0; i + 2 < rn.length; ) {
    if (rn[i].tuplet === 'triplet' && rn[i + 1].tuplet === 'triplet' && rn[i + 2].tuplet === 'triplet') {
      // Side effect only: the constructed Tuplet sets each note's triplet tick
      // ratio. We never push it to a draw list, so no numeral is rendered.
      new Tuplet([notes[i], notes[i + 1], notes[i + 2]], { bracketed: false })
      i += 3
    } else {
      i += 1
    }
  }
}

function addBeams(rn: RenderedNote[], notes: StaveNote[], out: Beam[]) {
  let i = 0
  while (i < rn.length) {
    const startKind = beamKind(rn[i])
    if (!startKind) { i += 1; continue }
    let j = i
    while (j < rn.length && beamKind(rn[j]) === startKind) j += 1
    // 16ths group by 4 (one beat); triplets by 3 (one beat); 8ths by 2 (one beat).
    const G = startKind === 'triplet' ? 3 : startKind === '16' ? 4 : 2
    for (let k = i; k < j; k += G) {
      const chunk = notes.slice(k, Math.min(k + G, j))
      // auto_stem=true: the beam picks ONE direction for the whole group from the
      // notes' aggregate distance from the middle line and applies it uniformly,
      // instead of inheriting the first note's stem (which forced ascending runs up).
      if (chunk.length >= 2) out.push(new Beam(chunk, true))
    }
    i = j
  }
}

function beamKind(rn: RenderedNote): '8' | '16' | 'triplet' | null {
  if (rn.duration === '16') return '16'
  if (rn.duration === '8')  return rn.tuplet === 'triplet' ? 'triplet' : '8'
  return null
}

// Draw an "R.H." / "L.H." label in the left gutter, vertically centered on the
// staff it belongs to. The y-center is the staff's MIDDLE line (getYForLine(2)),
// so the label lines up with the staff regardless of which clef the measure uses.
// The baseline is biased down by ~0.34·fontSize so the glyph cap-height straddles
// the middle line.
function drawHandLabel(ctx: any, hand: 'RH' | 'LH', stave: Stave) {
  const label = hand === 'RH' ? 'R.H.' : 'L.H.'
  const yMid = stave.getYForLine(2)
  ctx.save()
  ctx.setFont('Helvetica', HAND_LABEL_FONT_SIZE, 'normal')
  ctx.fillText(label, HAND_LABEL_X, yMid + HAND_LABEL_FONT_SIZE * 0.34)
  ctx.restore()
}

// ----- Ottava overlay -----

// Expand a voice's ottava runs into a per-note octave-shift array over `size`
// notes. 'up' (8va) → −1 (write an octave lower), 'down' (8vb) → +1 (write an
// octave higher). Indices are system-local; out-of-range indices are ignored.
function buildOttavaShift(size: number, runs: OttavaRun[]): number[] {
  const shift = new Array<number>(size).fill(0)
  for (const r of runs) {
    const d = r.dir === 'up' ? -1 : 1
    for (let i = Math.max(0, r.startIdx); i < Math.min(size, r.endIdx); i++) shift[i] = d
  }
  return shift
}

// Intersect a voice's GLOBAL ottava runs with one system's note window
// [start, start+size) and re-base them to system-local indices. A run that crosses
// a system boundary is split into the per-system pieces that fall inside each
// window (each piece keeps its direction and gets its own bracket).
function localizeOttavaRuns(runs: OttavaRun[], start: number, size: number): OttavaRun[] {
  const out: OttavaRun[] = []
  for (const r of runs) {
    const s = Math.max(r.startIdx, start)
    const e = Math.min(r.endIdx, start + size)
    if (e > s) out.push({ startIdx: s - start, endIdx: e - start, dir: r.dir })
  }
  return out
}

// Draw one ottava bracket over the given note groups (the run's g.vf-stavenote DOM
// elements). All geometry is ink-driven: the dashed line sits OTTAVA_PAD past the
// run's extreme rendered bound (top for 8va, bottom for 8vb), so it always clears
// the noteheads, stems, ledger lines and fingerings that those groups contain. The
// "8va"/"8vb" marking leads the line; a hook at the far end points back toward the
// notes. Drawn with the VexFlow SVGContext so it shares the score's styling.
function drawOttavaBracket(ctx: any, groups: Element[], dir: OttavaDir): void {
  if (!groups.length) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const g of groups) {
    let bb: DOMRect
    try { bb = (g as SVGGraphicsElement).getBBox() } catch { continue }
    if (bb.width === 0 && bb.height === 0) continue
    if (bb.x < minX) minX = bb.x
    if (bb.y < minY) minY = bb.y
    if (bb.x + bb.width > maxX) maxX = bb.x + bb.width
    if (bb.y + bb.height > maxY) maxY = bb.y + bb.height
  }
  if (!isFinite(minX)) return

  const label = dir === 'up' ? '8va' : '8vb'
  const textW = OTTAVA_FONT_SIZE * 0.6 * label.length    // estimate for non-metric font
  // Line y: above the highest ink (8va) or below the lowest (8vb). Hook points back
  // toward the notes (down for 8va, up for 8vb).
  const yLine = dir === 'up' ? minY - OTTAVA_PAD : maxY + OTTAVA_PAD
  const hookDy = dir === 'up' ? OTTAVA_HOOK : -OTTAVA_HOOK
  const yText = yLine + OTTAVA_FONT_SIZE * 0.32          // marking vertically centered on the line

  ctx.save()
  ctx.setFont('Helvetica', OTTAVA_FONT_SIZE, 'normal')
  ctx.setFillStyle('#000')
  ctx.fillText(label, minX, yText)

  ctx.setStrokeStyle('#000')
  ctx.setLineWidth(1)
  const lineStartX = minX + textW + OTTAVA_TEXT_GAP
  if (maxX > lineStartX) {
    ctx.setLineDash(OTTAVA_DASH)
    ctx.beginPath()
    ctx.moveTo(lineStartX, yLine)
    ctx.lineTo(maxX, yLine)
    ctx.stroke()
    ctx.setLineDash([])
    // End hook (solid).
    ctx.beginPath()
    ctx.moveTo(maxX, yLine)
    ctx.lineTo(maxX, yLine + hookDy)
    ctx.stroke()
  }
  ctx.restore()
}
