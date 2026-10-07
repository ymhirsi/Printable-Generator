// Dominant 7th and Diminished 7th arpeggio chords — hand-maintained source.
//
// These two arpeggio families are NOT keys: each is a single chromatic chord
// shape (a stack of thirds) that exists independently of any key signature. They
// are therefore stored here as standalone chord definitions rather than in the
// key-centric master data. Like arpeggioFingerings.ts, this file is deliberately
// OUTSIDE the master-data.docx round-trip.
//
// Spelling. Chord tones are stacked in thirds, skipping a letter name each time
// (proper 7th-chord spelling), regardless of the accidentals this produces — so
// some diminished 7ths use double-flats (Cdim7 = C–Eb–Gb–Bbb). Dominant 7ths use
// flat spelling for black-key roots (Db7, Eb7, Ab7, Bb7) with the sole exception
// of F#7 (never Gb7). Diminished 7ths use sharp spelling for black-key roots
// (C#dim7, D#dim7, F#dim7, G#dim7, A#dim7), no exceptions. All accidentals are
// rendered explicitly — these shapes carry no key signature.
//
// Fingerings. Each pattern is the 2-OCTAVE ascending form: 9 finger numbers for
// the 9 notes of a 2-octave 7th-chord arpeggio (root, 3rd, 5th, 7th × 2 + top
// root). Descending reverses the ascending sequence. Any octave count is built
// from three parts of the 9-digit string via `expandSeventhAscending`:
//   first block = digits 1–4, interior block = digits 5–8, top = digit 9
//   N octaves = [1–4] + [5–8] × (N−1) + [9]
//
// Dominant 7th inversions are NOT enumerated. Only the four root-position pattern
// groups are stored; inversion fingerings are derived (see `dom7Pattern9`): a
// pitch-class→finger map taken from the root-position interior block, applied
// when the inversion starts on a black key, or replaced by the standard white-key
// fingering when it starts on a white key. Diminished 7ths are symmetrical and
// are used in root position only (no inversion selector).

import type { Pitch, Accidental, HandConfig, KeyDef } from './types'

export type SeventhHand = Extract<HandConfig, 'RH' | 'LH'>
export type SeventhInversion = 0 | 1 | 2          // 0 root · 1 first · 2 second (dom7 only)
export type SeventhChordType = 'dominant-7' | 'diminished-7'

type Step = Pitch['step']
const LETTERS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const STEP_PC: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ACC_PC: Record<Accidental, number> = { '': 0, '#': 1, 'b': -1, '##': 2, 'bb': -2 }

const pcOf = (step: Step, acc: Accidental): number =>
  (((STEP_PC[step] + ACC_PC[acc]) % 12) + 12) % 12
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11])
const isWhitePc = (pc: number): boolean => WHITE_PCS.has(pc)

// Root register: roots on C/D/E sit in octave 4, F/G/A/B in octave 3 — the same
// register convention the key tonics use, so a 7th-chord arpeggio seats in the
// same band as the matching scale/triad-arpeggio on a mixed page.
const baseOctaveFor = (step: Step): number =>
  step === 'C' || step === 'D' || step === 'E' ? 4 : 3

// ----- Chord specifications -----
// `toneAccidentals` are the accidentals for the four stacked-third tones; the
// letter names are derived (root letter, +2, +4, +6) so the spelling is correct
// by construction. `root` is the URL-safe root token used in the chord id.
interface SeventhChordSpec {
  id: string                    // e.g. 'dom7-c', 'dim7-cs'
  label: string                 // e.g. 'C7', 'C#dim7'
  type: SeventhChordType
  root: string                  // root token, e.g. 'c', 'fs', 'db'
  rootStep: Step
  toneAccidentals: [Accidental, Accidental, Accidental, Accidental]
}

const DOM7_SPECS: SeventhChordSpec[] = [
  { id: 'dom7-c',  label: 'C7',  type: 'dominant-7', root: 'c',  rootStep: 'C', toneAccidentals: ['', '', '', 'b'] },
  { id: 'dom7-db', label: 'Db7', type: 'dominant-7', root: 'db', rootStep: 'D', toneAccidentals: ['b', '', 'b', 'b'] },
  { id: 'dom7-d',  label: 'D7',  type: 'dominant-7', root: 'd',  rootStep: 'D', toneAccidentals: ['', '#', '', ''] },
  { id: 'dom7-eb', label: 'Eb7', type: 'dominant-7', root: 'eb', rootStep: 'E', toneAccidentals: ['b', '', 'b', 'b'] },
  { id: 'dom7-e',  label: 'E7',  type: 'dominant-7', root: 'e',  rootStep: 'E', toneAccidentals: ['', '#', '', ''] },
  { id: 'dom7-f',  label: 'F7',  type: 'dominant-7', root: 'f',  rootStep: 'F', toneAccidentals: ['', '', '', 'b'] },
  { id: 'dom7-fs', label: 'F#7', type: 'dominant-7', root: 'fs', rootStep: 'F', toneAccidentals: ['#', '#', '#', ''] },
  { id: 'dom7-g',  label: 'G7',  type: 'dominant-7', root: 'g',  rootStep: 'G', toneAccidentals: ['', '', '', ''] },
  { id: 'dom7-ab', label: 'Ab7', type: 'dominant-7', root: 'ab', rootStep: 'A', toneAccidentals: ['b', '', 'b', 'b'] },
  { id: 'dom7-a',  label: 'A7',  type: 'dominant-7', root: 'a',  rootStep: 'A', toneAccidentals: ['', '#', '', ''] },
  { id: 'dom7-bb', label: 'Bb7', type: 'dominant-7', root: 'bb', rootStep: 'B', toneAccidentals: ['b', '', '', 'b'] },
  { id: 'dom7-b',  label: 'B7',  type: 'dominant-7', root: 'b',  rootStep: 'B', toneAccidentals: ['', '#', '#', ''] },
]

const DIM7_SPECS: SeventhChordSpec[] = [
  { id: 'dim7-c',  label: 'Cdim7',  type: 'diminished-7', root: 'c',  rootStep: 'C', toneAccidentals: ['', 'b', 'b', 'bb'] },
  { id: 'dim7-cs', label: 'C#dim7', type: 'diminished-7', root: 'cs', rootStep: 'C', toneAccidentals: ['#', '', '', 'b'] },
  { id: 'dim7-d',  label: 'Ddim7',  type: 'diminished-7', root: 'd',  rootStep: 'D', toneAccidentals: ['', '', 'b', 'b'] },
  { id: 'dim7-ds', label: 'D#dim7', type: 'diminished-7', root: 'ds', rootStep: 'D', toneAccidentals: ['#', '#', '', ''] },
  { id: 'dim7-e',  label: 'Edim7',  type: 'diminished-7', root: 'e',  rootStep: 'E', toneAccidentals: ['', '', 'b', 'b'] },
  { id: 'dim7-f',  label: 'Fdim7',  type: 'diminished-7', root: 'f',  rootStep: 'F', toneAccidentals: ['', 'b', 'b', 'bb'] },
  { id: 'dim7-fs', label: 'F#dim7', type: 'diminished-7', root: 'fs', rootStep: 'F', toneAccidentals: ['#', '', '', 'b'] },
  { id: 'dim7-g',  label: 'Gdim7',  type: 'diminished-7', root: 'g',  rootStep: 'G', toneAccidentals: ['', 'b', 'b', 'b'] },
  { id: 'dim7-gs', label: 'G#dim7', type: 'diminished-7', root: 'gs', rootStep: 'G', toneAccidentals: ['#', '', '', ''] },
  { id: 'dim7-a',  label: 'Adim7',  type: 'diminished-7', root: 'a',  rootStep: 'A', toneAccidentals: ['', '', 'b', 'b'] },
  { id: 'dim7-as', label: 'A#dim7', type: 'diminished-7', root: 'as', rootStep: 'A', toneAccidentals: ['#', '#', '', ''] },
  { id: 'dim7-b',  label: 'Bdim7',  type: 'diminished-7', root: 'b',  rootStep: 'B', toneAccidentals: ['', '', '', 'b'] },
]

const ALL_SPECS = [...DOM7_SPECS, ...DIM7_SPECS]
const SPEC_BY_ID: Record<string, SeventhChordSpec> = Object.fromEntries(
  ALL_SPECS.map(s => [s.id, s]),
)

export const DOM7_CHORD_IDS: string[] = DOM7_SPECS.map(s => s.id)
export const DIM7_CHORD_IDS: string[] = DIM7_SPECS.map(s => s.id)
export const DOM7_CHORDS = DOM7_SPECS.map(s => ({ id: s.id, label: s.label }))
export const DIM7_CHORDS = DIM7_SPECS.map(s => ({ id: s.id, label: s.label }))

// ----- Tone construction -----
// The four chord tones in their base register, ascending. Letters advance by a
// third each step (root, +2, +4, +6); the octave bumps whenever the letter index
// wraps past B, so e.g. Db7's 7th (Cb) lands in the octave above the root.
function chordTones(spec: SeventhChordSpec): Pitch[] {
  const rootLi = LETTERS.indexOf(spec.rootStep)
  const baseOct = baseOctaveFor(spec.rootStep)
  return [0, 1, 2, 3].map(k => {
    const li = rootLi + 2 * k
    return {
      step: LETTERS[li % 7],
      accidental: spec.toneAccidentals[k],
      octave: baseOct + Math.floor(li / 7),
    }
  })
}

// ----- Pitch sequence -----
// Ascend through the chord-tone lattice (4 tones per octave) for `octaves`
// octaves, ending on the starting tone N octaves up (4N+1 notes), then descend
// back (sharing the peak), for a total of 8N+1 notes. `inversion` is the starting
// position in the lattice: 0 = root, 1 = start on the 3rd, 2 = start on the 5th.
export function seventhChordPitches(
  chordId: string, octaves: number, inversion: SeventhInversion,
): Pitch[] {
  const spec = SPEC_BY_ID[chordId]
  if (!spec) return []
  const tones = chordTones(spec)
  const count = 4 * octaves + 1
  const asc: Pitch[] = []
  for (let n = 0; n < count; n++) {
    const j = inversion + n
    const tone = tones[j % 4]
    asc.push({ ...tone, octave: tone.octave + Math.floor(j / 4) })
  }
  const des = asc.slice(0, -1).reverse()
  return [...asc, ...des]
}

// ----- Fingering pattern groups (2-octave, 9 digits) -----
interface FingerGroup { roots: string[]; RH: number[]; LH: number[] }

const DOM7_GROUPS: FingerGroup[] = [
  // White-key roots: standard 7th-chord fingering.
  { roots: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], RH: [1, 2, 3, 4, 1, 2, 3, 4, 5], LH: [5, 4, 3, 2, 1, 4, 3, 2, 1] },
  { roots: ['fs'],                              RH: [2, 3, 4, 1, 2, 3, 4, 1, 2], LH: [4, 3, 2, 1, 4, 3, 2, 1, 2] },
  { roots: ['db', 'ab', 'eb'],                  RH: [4, 1, 2, 3, 4, 1, 2, 3, 4], LH: [2, 1, 4, 3, 2, 1, 4, 3, 2] },
  { roots: ['bb'],                              RH: [4, 1, 2, 3, 4, 1, 2, 3, 4], LH: [3, 2, 1, 4, 3, 2, 1, 4, 3] },
]

const DIM7_GROUPS: FingerGroup[] = [
  { roots: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], RH: [1, 2, 3, 4, 1, 2, 3, 4, 5], LH: [5, 4, 3, 2, 1, 4, 3, 2, 1] },
  { roots: ['cs', 'fs', 'gs'],                  RH: [4, 1, 2, 3, 4, 1, 2, 3, 4], LH: [2, 1, 4, 3, 2, 1, 4, 3, 2] },
  { roots: ['ds', 'as'],                        RH: [3, 4, 1, 2, 3, 4, 1, 2, 3], LH: [4, 3, 2, 1, 4, 3, 2, 1, 4] },
]

// Standard white-key 7th-chord fingering, used to override an inversion whose
// starting note is a white key.
const STD_OVERRIDE: Record<SeventhHand, number[]> = {
  RH: [1, 2, 3, 4, 1, 2, 3, 4, 5],
  LH: [5, 4, 3, 2, 1, 4, 3, 2, 1],
}

function groupFor(spec: SeventhChordSpec, hand: SeventhHand): number[] | null {
  const groups = spec.type === 'dominant-7' ? DOM7_GROUPS : DIM7_GROUPS
  const g = groups.find(x => x.roots.includes(spec.root))
  return g ? g[hand].slice() : null
}

// The 9-digit root-position pattern for a dominant 7th inversion.
//   • Root position → the stored group pattern.
//   • Inversion starting on a WHITE key → the standard white-key fingering.
//   • Inversion starting on a BLACK key → a pitch-class→finger map read from the
//     root-position interior block (digits 5–8), reapplied from the inversion's
//     starting role. The opening and top fingers derived this way are uncertain,
//     so `needsReview` is set.
function dom7Pattern9(
  spec: SeventhChordSpec, hand: SeventhHand, inversion: SeventhInversion,
): { pattern9: number[]; needsReview: boolean } | null {
  const root = groupFor(spec, hand)
  if (!root) return null
  if (inversion === 0) return { pattern9: root, needsReview: false }

  const startTone = chordTones(spec)[inversion]    // inv 1 → 3rd, inv 2 → 5th
  if (isWhitePc(pcOf(startTone.step, startTone.accidental))) {
    return { pattern9: STD_OVERRIDE[hand].slice(), needsReview: false }
  }
  // Black-key start: role→finger map from the interior block (digits 5–8).
  const map = [root[4], root[5], root[6], root[7]]   // role 0=root,1=3rd,2=5th,3=7th
  const pattern9: number[] = []
  for (let pos = 0; pos < 9; pos++) pattern9.push(map[(inversion + pos) % 4])
  return { pattern9, needsReview: true }
}

// Build the N-octave ASCENDING finger sequence from a 9-digit 2-octave pattern.
//   N octaves = [digits 1–4] + [digits 5–8] × (N−1) + [digit 9]
// Length = 4 + 4·(N−1) + 1 = 4N + 1, matching the ascending note count.
export function expandSeventhAscending(pattern9: number[], octaves: number): number[] {
  const first = pattern9.slice(0, 4)
  const interior = pattern9.slice(4, 8)
  const top = pattern9[8]
  const asc = [...first]
  for (let o = 0; o < octaves - 1; o++) asc.push(...interior)
  asc.push(top)
  return asc
}

// Full ascend-then-descend finger sequence (8N + 1 numbers), aligned 1:1 with the
// arpeggio's pitch sequence. Descending reverses ascending, sharing the peak.
// Returns null when the chord/hand has no stored pattern.
export function seventhChordFingers(
  chordId: string, hand: SeventhHand, inversion: SeventhInversion, octaves: number,
): number[] | null {
  const spec = SPEC_BY_ID[chordId]
  if (!spec) return null
  let pattern9: number[]
  if (spec.type === 'dominant-7') {
    const r = dom7Pattern9(spec, hand, inversion)
    if (!r) return null
    pattern9 = r.pattern9
  } else {
    const g = groupFor(spec, hand)        // dim7: root position only
    if (!g) return null
    pattern9 = g
  }
  const asc = expandSeventhAscending(pattern9, octaves)
  const des = asc.slice(0, -1).reverse()
  return [...asc, ...des]
}

// ----- Resolution / helpers -----
export function isSeventhChordId(id: string): boolean {
  return id.startsWith('dom7-') || id.startsWith('dim7-')
}

export function seventhChordType(id: string): SeventhChordType | null {
  return SPEC_BY_ID[id]?.type ?? null
}

export function seventhChordLabel(id: string): string | null {
  return SPEC_BY_ID[id]?.label ?? null
}

export function resolveSeventhChord(
  id: string,
): { id: string; label: string; type: SeventhChordType } | null {
  const s = SPEC_BY_ID[id]
  return s ? { id: s.id, label: s.label, type: s.type } : null
}

// A minimal synthetic KeyDef so the render/PDF path — which is key-centric and
// only consults the keyDef for its key signature — can render a chord. The id is
// deliberately not one of the recognised key ids, so vfKeySignature falls back to
// 'C' (no signature) and every accidental is drawn explicitly.
export function seventhChordKeyDef(id: string): KeyDef {
  const spec = SPEC_BY_ID[id]
  const tonic: Pitch = spec
    ? { step: spec.rootStep, accidental: spec.toneAccidentals[0], octave: baseOctaveFor(spec.rootStep) }
    : { step: 'C', accidental: '', octave: 4 }
  return {
    id,
    name: spec?.label ?? id,
    shortLabel: spec?.label ?? id,
    mode: 'major',
    tonic,
    keySignature: { sharps: [], flats: [] },
    diatonic: [],
  }
}

// ----- [NEEDS REVIEW] reporting -----
// Two review triggers, surfaced in the build/audit report:
//   1. Dominant-7th inversions whose fingering is map-derived (black-key starts) —
//      the opening/turnaround finger is uncertain.
//   2. Any 1-octave arpeggio that starts on a black key — the single-octave opening
//      finger can differ from the multi-octave opening.
export function dom7InversionNeedsReview(chordId: string, inversion: SeventhInversion): boolean {
  const spec = SPEC_BY_ID[chordId]
  if (!spec || spec.type !== 'dominant-7' || inversion === 0) return false
  const r = dom7Pattern9(spec, 'RH', inversion)
  return !!r && r.needsReview
}

function startIsBlack(chordId: string, inversion: SeventhInversion): boolean {
  const spec = SPEC_BY_ID[chordId]
  if (!spec) return false
  const t = chordTones(spec)[inversion % 4]
  return !isWhitePc(pcOf(t.step, t.accidental))
}

export function seventhOneOctaveNeedsReview(chordId: string, inversion: SeventhInversion): boolean {
  return startIsBlack(chordId, inversion)
}

export interface SeventhReview {
  chordId: string
  label: string
  inversion: SeventhInversion
  reason: 'inversion-mapped' | 'one-octave-black-start'
}

export function seventhChordReviews(): SeventhReview[] {
  const out: SeventhReview[] = []
  for (const spec of ALL_SPECS) {
    const inversions: SeventhInversion[] = spec.type === 'dominant-7' ? [0, 1, 2] : [0]
    for (const inv of inversions) {
      if (dom7InversionNeedsReview(spec.id, inv)) {
        out.push({ chordId: spec.id, label: spec.label, inversion: inv, reason: 'inversion-mapped' })
      }
      if (seventhOneOctaveNeedsReview(spec.id, inv)) {
        out.push({ chordId: spec.id, label: spec.label, inversion: inv, reason: 'one-octave-black-start' })
      }
    }
  }
  return out
}
