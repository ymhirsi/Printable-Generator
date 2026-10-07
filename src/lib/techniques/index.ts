import type {
  MasterData, KeyDef, Pitch, Accidental, TechniqueId, HandConfig, ScaleVariant,
  CadenceTemplate, FingeringBlock,
} from '../data/types'
import { arpeggioFingers } from '../data/arpeggioFingerings'
import {
  resolveSeventhChord, seventhChordPitches, seventhChordFingers,
  type SeventhInversion,
} from '../data/seventhChords'

export interface QueueEntry {
  id: string
  techniqueId: TechniqueId
  keyId: string
  hand: HandConfig
  octaves: 1 | 2 | 3 | 4
  tempo: number
  variant?: ScaleVariant            // only meaningful for Scale + minor key
  inversion?: SeventhInversion      // only meaningful for the dominant-7th arpeggio
}

export interface RenderedNote {
  pitches: Pitch[]
  duration: 'q' | 'h' | 'w' | '8' | '16'
  fingering?: number
  fermata?: boolean              // draws a fermata articulation above/below the note
  tuplet?: 'triplet'             // marks this note as part of an eighth-triplet group of 3
}
export interface RenderedVoice {
  clef: 'treble' | 'bass'
  hand: 'RH' | 'LH'
  notes: RenderedNote[]
}
export interface RenderedTechnique {
  title: string
  keyId: string
  voices: RenderedVoice[]
  layout: 'single' | 'separate' | 'grand'
  tempo: number
  totalNotes: number
  systemSizes?: number[]         // explicit per-system note counts; falls back to auto when absent
  systemMeasures?: number[]      // measures contained in each system (same length as systemSizes)
  timeSignature?: string         // e.g. '4/4' — drawn on the first stave only
  scoreScale?: number            // overrides default SCORE_SCALE (per-octave size tiers)
  notesPerMeasure?: number       // notes per 4/4 measure; drives per-measure note slicing
}

// ----- Pitch math -----
const STEP_PC: Record<Pitch['step'], number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ACCIDENTAL_PC: Record<Accidental, number> = { '': 0, '#': 1, 'b': -1, '##': 2, 'bb': -2 }

export const pitchMidi = (p: Pitch): number =>
  (p.octave + 1) * 12 + STEP_PC[p.step] + ACCIDENTAL_PC[p.accidental]

export const upOct = (p: Pitch, n = 1): Pitch => ({ ...p, octave: p.octave + n })

const raiseAccidental = (a: Accidental): Accidental => {
  switch (a) {
    case 'bb': return 'b'
    case 'b':  return ''
    case '':   return '#'
    case '#':  return '##'
    case '##': return '##'
  }
}

const raisePitch = (p: Pitch): Pitch => ({ ...p, accidental: raiseAccidental(p.accidental) })

// Return the diatonic pitch at a given scale-degree-index relative to the tonic.
// idx 0 = tonic, 7 = octave above, -1 = note below tonic, etc.
function scaleAt(key: KeyDef, idx: number): Pitch {
  const mod = ((idx % 7) + 7) % 7
  const octaveShift = Math.floor(idx / 7)
  const base = key.diatonic[mod]
  // The diatonic array is anchored at `tonic.octave`. base is already a Pitch
  // in some octave; we adjust by octaveShift to get the requested octave-index step.
  // Compute the natural octave displacement of base relative to tonic.
  const baseDispl = base.octave - key.tonic.octave
  return { ...base, octave: key.tonic.octave + baseDispl + octaveShift }
}

// ----- Scale generators -----
function majorScalePitches(key: KeyDef, octaves: number): Pitch[] {
  const asc: Pitch[] = []
  for (let i = 0; i <= 7 * octaves; i++) asc.push(scaleAt(key, i))
  const des = [...asc].slice(0, -1).reverse()
  return [...asc, ...des]
}

function naturalMinorPitches(key: KeyDef, octaves: number): Pitch[] {
  return majorScalePitches(key, octaves)        // identical generator; key.diatonic carries the minor spelling
}

function harmonicMinorPitches(key: KeyDef, octaves: number): Pitch[] {
  // Raise scale degree 7 (idx 6, 13, 20, ...) in both directions.
  const asc: Pitch[] = []
  for (let i = 0; i <= 7 * octaves; i++) {
    const p = scaleAt(key, i)
    const isSeventh = (((i % 7) + 7) % 7) === 6
    asc.push(isSeventh ? raisePitch(p) : p)
  }
  const des = [...asc].slice(0, -1).reverse()
  return [...asc, ...des]
}

function melodicMinorPitches(key: KeyDef, octaves: number): Pitch[] {
  // Ascending: raised 6 & 7.  Descending: natural minor.
  const asc: Pitch[] = []
  for (let i = 0; i <= 7 * octaves; i++) {
    const deg = (((i % 7) + 7) % 7)
    const p = scaleAt(key, i)
    asc.push(deg === 5 || deg === 6 ? raisePitch(p) : p)
  }
  const desRaw: Pitch[] = []
  for (let i = 7 * octaves - 1; i >= 0; i--) desRaw.push(scaleAt(key, i))
  return [...asc, ...desRaw]
}

// The three arpeggio inversions are distinct techniqueIds that share ONE engine.
function isArpeggioId(id: TechniqueId): boolean {
  return id === 'arp-root' || id === 'arp-first-inv' || id === 'arp-second-inv'
}
// 0 = root position, 1 = first inversion, 2 = second inversion.
function arpInversion(id: TechniqueId): 0 | 1 | 2 {
  return id === 'arp-first-inv' ? 1 : id === 'arp-second-inv' ? 2 : 0
}
const ARP_INVERSION_LABEL = ['Root Position', '1st Inversion', '2nd Inversion'] as const

// Arpeggiate the tonic triad. `inversion` selects the starting chord tone:
//   0 = root  (1–3–5–1…, e.g. C E G C),
//   1 = first  (3–5–1–3…, e.g. E G C E),
//   2 = second (5–1–3–5…, e.g. G C E G).
// All three share the SAME structure — 3N+1 notes ascending to the starting
// tone N octaves up, then back down (6N+1 notes total) — so every inversion
// flows through the identical metered / sizing / layout path. Only the starting
// chord tone (and therefore the note ordering and the held final tone) differs.
function arpeggioPitches(key: KeyDef, octaves: number, inversion: 0 | 1 | 2): Pitch[] {
  // The triad tones, as scale-degree indices, ascend as 0,2,4, 7,9,11, 14,…
  // For chord-tone position j: octave = ⌊j/3⌋ and the in-octave degree is
  // [0,2,4][j mod 3]. An inversion is simply the starting position in that lattice.
  const inOctave = [0, 2, 4]
  const asc: Pitch[] = []
  const count = 3 * octaves + 1
  for (let n = 0; n < count; n++) {
    const j = inversion + n
    const idx = inOctave[j % 3] + 7 * Math.floor(j / 3)
    asc.push(scaleAt(key, idx))
  }
  const des = [...asc].slice(0, -1).reverse()
  return [...asc, ...des]
}

// ----- Cadence -----
function cadenceVoices(key: KeyDef, template: CadenceTemplate): { rh: RenderedNote[]; lh: RenderedNote[] } {
  const rh: RenderedNote[] = []
  const lh: RenderedNote[] = []
  const last = template.chords.length - 1
  template.chords.forEach((chord, ci) => {
    const resolved: Pitch[] = chord.map(v => {
      const p = scaleAt(key, v.idx)
      return v.alter === '#' ? raisePitch(p) : p
    })
    // resolved is [bass, tenor, alto, soprano]. The cadence is engraved like the
    // scales' close: the chords move in even quarter-note beats and the final
    // tonic chord is held for a whole measure under a fermata. Four quarter chords
    // + one whole chord = exactly two 4/4 measures, so the cadence inherits the
    // scales' beat-proportional spacing and measure discipline (see extras below).
    const isLast = ci === last
    const duration: RenderedNote['duration'] = isLast ? 'w' : 'q'
    rh.push({ pitches: [resolved[1], resolved[2], resolved[3]], duration, fermata: isLast ? true : undefined })
    lh.push({ pitches: [resolved[0]], duration, fermata: isLast ? true : undefined })
  })
  return { rh, lh }
}

// ----- Fingering attachment -----
// Returns a finger-number sequence the same length as `pitches`, tiled from a
// 1-octave fingering block. Used by SCALES only (8-element tiles); arpeggios use
// the category-based system in ../data/arpeggioFingerings. Returns null if no
// usable fingering is available.
function fingerSequence(pitches: Pitch[], block?: FingeringBlock): number[] | null {
  if (!block) return null
  let topIdx = 0, topM = -Infinity
  for (let i = 0; i < pitches.length; i++) {
    const m = pitchMidi(pitches[i])
    if (m > topM) { topM = m; topIdx = i }
  }
  const ascLen = topIdx + 1
  const desLen = pitches.length - topIdx
  const tile = (src: number[], targetLen: number): number[] => {
    if (src.length === targetLen) return src.slice()
    if (src.length === 8 && targetLen > 8) {
      const seq: number[] = []
      const octs = Math.max(1, Math.round((targetLen - 1) / 7))
      for (let o = 0; o < octs; o++) {
        const piece = o === 0 ? src : src.slice(1)
        seq.push(...piece)
      }
      while (seq.length < targetLen) seq.push(src[src.length - 1])
      seq.length = targetLen
      return seq
    }
    return []
  }
  const ascSeq = tile(block.ascending, ascLen)
  const desSeq = tile(block.descending, desLen)
  if (!ascSeq.length || !desSeq.length) return null
  const full = [...ascSeq, ...desSeq.slice(1)]
  // The pinky (5) only ever plays the hand's outermost note — the top note in the
  // RH, the bottom note in the LH. Tiling a one-octave block across octaves repeats
  // that endpoint 5 at every interior octave boundary, where the hand actually
  // thumb-crosses. Rewrite each interior 5 to a 1, keeping 5 only at the true
  // extreme (RH max pitch / LH min pitch). In a monotonic ascend-then-descend run
  // the extreme is reached only at the genuine endpoints, so no interior 5 can
  // legitimately match it — the test is exact, not heuristic.
  const midis = pitches.map(pitchMidi)
  const extreme = block.hand === 'LH' ? Math.min(...midis) : Math.max(...midis)
  return full.map((f, i) => (f === 5 && midis[i] !== extreme ? 1 : f))
}

// Default attach for techniques that don't need rhythm overrides. `fingers` is a
// precomputed finger sequence (or null) the same length as `pitches`.
function attachFingerings(pitches: Pitch[], fingers: number[] | null): RenderedNote[] {
  return pitches.map((p, i) => ({
    pitches: [p],
    duration: 'q',
    fingering: fingers ? fingers[i] : undefined,
  }))
}

// Per-octave rhythm. Each scale = exactly 4 measures of 4/4. The rhythm value
// scales with octave count so the same 14N+1 notes fit in 4 measures regardless
// of N (faster rhythm for more octaves). Multi-system layout is achieved by
// SPLITTING those 4 measures across N systems, not by adding more measures.
type ScaleRhythm = { duration: 'q' | '8' | '16'; tuplet: boolean; notesPerMeasure: number }
function scaleRhythm(octaves: 1 | 2 | 3 | 4): ScaleRhythm {
  switch (octaves) {
    case 1: return { duration: 'q',  tuplet: false, notesPerMeasure: 4  }
    case 2: return { duration: '8',  tuplet: false, notesPerMeasure: 8  }
    case 3: return { duration: '8',  tuplet: true,  notesPerMeasure: 12 }
    case 4: return { duration: '16', tuplet: false, notesPerMeasure: 16 }
  }
}

// Per-system measure breakdown. All scales = 4 measures total, split across
// systems. 2-, 3- and 4-oct all pack 2 measures per line ([2,2]) so every
// multi-system scale reads as exactly two balanced systems of two measures —
// a tighter, more cohesive whole than spreading one measure per line. (3-oct
// previously used an uneven [2,1,1] split, which produced a lopsided
// 2-then-1-then-1 layout; [2,2] keeps its four measures to two even systems.)
function scaleSystemMeasures(octaves: 1 | 2 | 3 | 4): number[] {
  switch (octaves) {
    case 1: return [4]
    case 2: return [2, 2]
    case 3: return [2, 2]
    case 4: return [2, 2]
  }
}

// Per-octave staff-size tier within the MOLA 7.0-7.5mm practice-material range.
function scaleScoreScale(octaves: 1 | 2 | 3 | 4): number {
  switch (octaves) {
    case 1: return 0.53   // 7.49mm staff
    case 2: return 0.515  // 7.27mm
    case 3: return 0.505  // 7.13mm
    case 4: return 0.495  // 6.99mm
  }
}

// 4-octave scales start one octave lower than other octave counts. Returns
// the octave-offset to apply to every pitch in the generated sequence.
function scaleStartingOctaveShift(octaves: 1 | 2 | 3 | 4): number {
  return octaves === 4 ? -1 : 0
}

function attachScaleRhythm(
  pitches: Pitch[], fingers: number[] | null, rhythm: ScaleRhythm,
  finalDuration: 'h' | 'w' = 'h',
): RenderedNote[] {
  return pitches.map((p, i) => {
    const isLast = i === pitches.length - 1
    if (isLast) {
      return {
        pitches: [p],
        duration: finalDuration,
        fermata: true,
        fingering: fingers ? fingers[i] : undefined,
      }
    }
    return {
      pitches: [p],
      duration: rhythm.duration,
      tuplet: rhythm.tuplet ? 'triplet' : undefined,
      fingering: fingers ? fingers[i] : undefined,
    }
  })
}

// Note counts per system. Derived from scaleSystemMeasures × notesPerMeasure,
// with the last system absorbing the final half-note tail (= 1 extra note).
//
//   1-oct quarters:  [4×4=16 → 15]            (15 notes: 14 q + 1 half)
//   2-oct eighths:   [2×8=16, 13]             (29 notes: 28 eighths + 1 half)
//   3-oct triplets:  [2×12=24, 19]            (43 notes: 42 trip + 1 half)
//   4-oct 16ths:     [2×16=32, 25]            (57 notes: 56 16ths + 1 half)
function scaleSystemSizes(octaves: 1 | 2 | 3 | 4): number[] {
  const rhythm = scaleRhythm(octaves)
  const measures = scaleSystemMeasures(octaves)
  const totalNotes = 14 * octaves + 1
  const sizes: number[] = []
  let used = 0
  for (let i = 0; i < measures.length; i++) {
    const isLast = i === measures.length - 1
    if (isLast) {
      sizes.push(totalNotes - used)
    } else {
      const noteCount = measures[i] * rhythm.notesPerMeasure
      sizes.push(noteCount)
      used += noteCount
    }
  }
  return sizes
}

// ----- Title -----
function buildTitle(e: QueueEntry, keyName: string, techName: string): string {
  const handLabel =
    e.hand === 'RH'       ? 'Right Hand'
    : e.hand === 'LH'     ? 'Left Hand'
    : e.hand === 'separate' ? 'Hands Separate'
    :                       'Hands Together'
  // Arpeggio blocks read as one family: the base name "Arpeggio" plus the
  // inversion ("Root Position" / "1st Inversion" / "2nd Inversion"), so all three
  // inversions of a key share a title stem rather than three unrelated names.
  const isArp = isArpeggioId(e.techniqueId)
  const displayTech = isArp ? 'Arpeggio' : techName
  const variantSuffix =
    isArp
      ? ` — ${ARP_INVERSION_LABEL[arpInversion(e.techniqueId)]}`
      : e.techniqueId === 'scale' && e.variant
        ? ` — ${capitalize(e.variant)}`
        : ''
  const octLabel = e.techniqueId === 'cadence'
    ? ''
    : ` — ${e.octaves} Octave${e.octaves === 1 ? '' : 's'}`
  // jsPDF's built-in Helvetica doesn't include music-symbol code points (♩, ♭, ♯, ♮).
  // Substitute them to ASCII so the block title renders correctly in the PDF.
  // VexFlow itself handles musical glyphs with its own embedded font (Bravura).
  const safeKey = keyName
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/♮/g, 'n')
  return `${safeKey} ${displayTech}${variantSuffix} — ${handLabel}${octLabel} — ${e.tempo} BPM`
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ----- Seventh-chord arpeggios (Dominant 7th / Diminished 7th) -----
// These chords are NOT keys: each is a standalone chromatic stack of thirds. They
// reuse the arpeggio engine wholesale — same per-octave rhythm tier, beat-
// proportional 4/4 measures, staff-size tier and held-final-tone treatment — and
// differ only in shape (a 4-tone chord rather than a 3-tone triad). A 7th-chord
// arpeggio runs 8N notes (4 tones × N octaves, up and back) + a held whole-note
// final = 8 beats + 4 beats = exactly three 4/4 measures on a single system, for
// every octave count. The chord/inversion are parameters; there is no separate
// layout path.
function buildSeventhTitle(
  e: QueueEntry, chord: { label: string; type: string }, inversion: SeventhInversion,
): string {
  const handLabel =
    e.hand === 'RH'         ? 'Right Hand'
    : e.hand === 'LH'       ? 'Left Hand'
    : e.hand === 'separate' ? 'Hands Separate'
    :                         'Hands Together'
  const invSuffix = chord.type === 'dominant-7' ? ` — ${ARP_INVERSION_LABEL[inversion]}` : ''
  const octLabel = ` — ${e.octaves} Octave${e.octaves === 1 ? '' : 's'}`
  // The label already encodes the chord quality (C7, Cdim7), and uses ASCII '#'/'b'
  // so it prints correctly in jsPDF's Helvetica.
  return `${chord.label} Arpeggio${invSuffix} — ${handLabel}${octLabel} — ${e.tempo} BPM`
}

function renderSeventhChord(entry: QueueEntry): RenderedTechnique {
  const chord = resolveSeventhChord(entry.keyId)
  if (!chord) throw new Error(`Unknown seventh chord: ${entry.keyId}`)
  // Diminished 7ths are symmetrical — root position only.
  const inversion: SeventhInversion = chord.type === 'diminished-7' ? 0 : (entry.inversion ?? 0)

  let pitches = seventhChordPitches(entry.keyId, entry.octaves, inversion)
  // Seat in the same register as the matching-octave scale/arpeggio: 4-octave
  // shapes start one octave lower (shared with scales via scaleStartingOctaveShift).
  const shift = scaleStartingOctaveShift(entry.octaves)
  if (shift !== 0) pitches = pitches.map(p => upOct(p, shift))
  const lhPitches = pitches.map(p => upOct(p, -1))

  const rhFingers = seventhChordFingers(entry.keyId, 'RH', inversion, entry.octaves)
  const lhFingers = seventhChordFingers(entry.keyId, 'LH', inversion, entry.octaves)

  const rhythm = scaleRhythm(entry.octaves)
  const rhNotes = attachScaleRhythm(pitches, rhFingers, rhythm, 'w')
  const lhNotes = attachScaleRhythm(lhPitches, lhFingers, rhythm, 'w')

  const title = buildSeventhTitle(entry, chord, inversion)
  const totalNotes = pitches.length
  const extras = {
    // 8N running notes (8 beats) + a held whole-note final (4 beats) = three 4/4
    // measures, all on a single system — the same beat-proportional spacing,
    // notes-per-measure slicing and staff-size tier the scales/arpeggios use.
    systemSizes:     [totalNotes],
    systemMeasures:  [3],
    timeSignature:   '4/4',
    scoreScale:      scaleScoreScale(entry.octaves),
    notesPerMeasure: rhythm.notesPerMeasure,
  }

  if (entry.hand === 'RH') {
    return { title, keyId: entry.keyId, layout: 'single', tempo: entry.tempo, totalNotes, ...extras,
      voices: [{ clef: 'treble', hand: 'RH', notes: rhNotes }] }
  }
  if (entry.hand === 'LH') {
    return { title, keyId: entry.keyId, layout: 'single', tempo: entry.tempo, totalNotes, ...extras,
      voices: [{ clef: 'bass', hand: 'LH', notes: lhNotes }] }
  }
  if (entry.hand === 'separate') {
    return { title, keyId: entry.keyId, layout: 'separate', tempo: entry.tempo, totalNotes, ...extras,
      voices: [
        { clef: 'treble', hand: 'RH', notes: rhNotes },
        { clef: 'bass',   hand: 'LH', notes: lhNotes },
      ] }
  }
  return { title, keyId: entry.keyId, layout: 'grand', tempo: entry.tempo, totalNotes, ...extras,
    voices: [
      { clef: 'treble', hand: 'RH', notes: rhNotes },
      { clef: 'bass',   hand: 'LH', notes: lhNotes },
    ] }
}

// ----- Main render -----
export function renderTechnique(entry: QueueEntry, data: MasterData): RenderedTechnique {
  const tech = data.techniques.find(t => t.id === entry.techniqueId)
  if (!tech) throw new Error(`Unknown technique: ${entry.techniqueId}`)

  // ----- Seventh-chord arpeggio path (no KeyDef — the chord is its own shape) -----
  if (entry.techniqueId === 'arp-dominant-7' || entry.techniqueId === 'arp-diminished-7') {
    return renderSeventhChord(entry)
  }

  const key = data.keys.find(k => k.id === entry.keyId)
  if (!key) throw new Error(`Unknown key: ${entry.keyId}`)

  // ----- Cadence path -----
  if (entry.techniqueId === 'cadence') {
    const template = key.mode === 'major' ? data.cadences.major : data.cadences.minor
    const { rh, lh } = cadenceVoices(key, template)
    return {
      title: buildTitle(entry, key.name, tech.name),
      keyId: key.id,
      voices: [
        { clef: 'treble', hand: 'RH', notes: rh },
        { clef: 'bass',   hand: 'LH', notes: lh },
      ],
      layout: 'grand',
      tempo: entry.tempo,
      totalNotes: rh.length,
      // Reuse the scale sizing/layout system: one system of two 4/4 measures
      // (four quarter chords + one held whole chord), the same staff-size tier as
      // a one-octave scale, and beat-proportional spacing driven by notesPerMeasure.
      systemSizes:     [rh.length],
      systemMeasures:  [2],
      timeSignature:   '4/4',
      scoreScale:      scaleScoreScale(1),
      notesPerMeasure: 4,
    }
  }

  // ----- Other techniques: pitch sequence + fingerings -----
  let pitches: Pitch[]
  let variant: ScaleVariant | undefined = entry.variant

  if (entry.techniqueId === 'scale') {
    if (key.mode === 'major') {
      pitches = majorScalePitches(key, entry.octaves)
      variant = undefined
    } else if (variant === 'harmonic') {
      pitches = harmonicMinorPitches(key, entry.octaves)
    } else if (variant === 'melodic') {
      pitches = melodicMinorPitches(key, entry.octaves)
    } else {
      pitches = naturalMinorPitches(key, entry.octaves)
      variant ??= 'natural'
    }
    // 4-oct scales start one octave lower than other octave counts.
    const shift = scaleStartingOctaveShift(entry.octaves)
    if (shift !== 0) pitches = pitches.map(p => upOct(p, shift))
  } else if (isArpeggioId(entry.techniqueId)) {
    pitches = arpeggioPitches(key, entry.octaves, arpInversion(entry.techniqueId))
    // Arpeggios span the same wide range as scales, so apply the same per-octave
    // starting-octave shift (4-octave arpeggios start one octave lower) — this
    // seats an arpeggio in the same register as the matching-octave scale so a
    // mixed page reads consistently.
    const shift = scaleStartingOctaveShift(entry.octaves)
    if (shift !== 0) pitches = pitches.map(p => upOct(p, shift))
  } else {
    throw new Error(`Renderer not implemented for technique: ${entry.techniqueId}`)
  }

  const fingerLookup = (hand: 'RH' | 'LH'): FingeringBlock | undefined =>
    data.fingerings.find(f =>
      f.techniqueId === entry.techniqueId &&
      f.keyId === entry.keyId &&
      f.hand === hand &&
      (variant ? f.variant === variant : !f.variant)
    )

  const lhPitches = pitches.map(p => upOct(p, -1))

  // Finger sequences. Scales tile a 1-octave fingering block (via fingerSequence);
  // arpeggios resolve their category-based canonical pattern and expand it with the
  // octave-extension rule. Both yield an array aligned 1:1 with the pitch sequence.
  let rhFingers: number[] | null
  let lhFingers: number[] | null
  if (isArpeggioId(entry.techniqueId)) {
    const inv = arpInversion(entry.techniqueId)
    rhFingers = arpeggioFingers(key.id, 'RH', inv, entry.octaves)
    lhFingers = arpeggioFingers(key.id, 'LH', inv, entry.octaves)
  } else {
    rhFingers = fingerSequence(pitches, fingerLookup('RH'))
    lhFingers = fingerSequence(lhPitches, fingerLookup('LH'))
  }

  // Scales and arpeggios share the SAME engraving treatment: a per-octave rhythm
  // tier, a held final tone under a fermata, beat-proportional 4/4 measures and the
  // per-octave staff-size tier. They differ only in how their measures pack onto
  // systems — a scale's four measures spread across one or two systems, while an
  // arpeggio's 6N running notes + held final always make exactly two 4/4 measures
  // on a single system (6N notes ÷ N-per-beat = 6 beats, + a 2-beat final = 8 beats
  // = two measures, for every octave count). Reusing scaleRhythm/attachScaleRhythm/
  // scaleScoreScale here is what makes a mixed page read as one cohesive document.
  const isScale = entry.techniqueId === 'scale'
  const isArp   = isArpeggioId(entry.techniqueId)
  const metered = isScale || isArp
  const rhythm = metered ? scaleRhythm(entry.octaves) : null
  const rhNotes = rhythm
    ? attachScaleRhythm(pitches, rhFingers, rhythm)
    : attachFingerings(pitches, rhFingers)
  const lhNotes = rhythm
    ? attachScaleRhythm(lhPitches, lhFingers, rhythm)
    : attachFingerings(lhPitches, lhFingers)

  const title = buildTitle(entry, key.name, tech.name)
  const totalNotes = pitches.length

  const extras = metered
    ? {
        // Scales lay their four measures out per scaleSystemSizes/Measures; an
        // arpeggio is always one system of two measures holding all its notes.
        systemSizes:    isScale ? scaleSystemSizes(entry.octaves)    : [totalNotes],
        systemMeasures: isScale ? scaleSystemMeasures(entry.octaves) : [2],
        timeSignature:  '4/4',
        scoreScale:     scaleScoreScale(entry.octaves),
        notesPerMeasure: rhythm!.notesPerMeasure,
      }
    : {}

  if (entry.hand === 'RH') {
    return { title, keyId: key.id, layout: 'single', tempo: entry.tempo, totalNotes, ...extras,
      voices: [{ clef: 'treble', hand: 'RH', notes: rhNotes }] }
  }
  if (entry.hand === 'LH') {
    return { title, keyId: key.id, layout: 'single', tempo: entry.tempo, totalNotes, ...extras,
      voices: [{ clef: 'bass', hand: 'LH', notes: lhNotes }] }
  }
  if (entry.hand === 'separate') {
    return { title, keyId: key.id, layout: 'separate', tempo: entry.tempo, totalNotes, ...extras,
      voices: [
        { clef: 'treble', hand: 'RH', notes: rhNotes },
        { clef: 'bass',   hand: 'LH', notes: lhNotes },
      ] }
  }
  return { title, keyId: key.id, layout: 'grand', tempo: entry.tempo, totalNotes, ...extras,
    voices: [
      { clef: 'treble', hand: 'RH', notes: rhNotes },
      { clef: 'bass',   hand: 'LH', notes: lhNotes },
    ] }
}
