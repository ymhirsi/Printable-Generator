// Solmido — master data types.
// The .docx at the repo root is the source of truth.
// `npm run sync-data` parses it and regenerates /generated/*.ts (which the app imports).
// `npm run export-data` regenerates the .docx from these TS files.

export type Mode = 'major' | 'minor'

export type Accidental = '' | '#' | 'b' | '##' | 'bb'
export interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
  accidental: Accidental
  octave: number
}

export interface KeyDef {
  id: string                        // canonical: "c-major", "fs-major", "ds-minor", etc.
  name: string                      // formal: "C Major", "F# Major"
  shortLabel: string                // button label: "C", "C#m", "F#" (for Gb/F# alt)
  mode: Mode
  tonic: Pitch                      // notated tonic, register chosen for typical staff placement
  keySignature: {
    sharps: ('F' | 'C' | 'G' | 'D' | 'A' | 'E' | 'B')[]
    flats: ('B' | 'E' | 'A' | 'D' | 'G' | 'C' | 'F')[]
  }
  // For major: the major scale ascending, 7 pitches starting on tonic.
  // For minor: the natural minor scale ascending, 7 pitches starting on tonic.
  diatonic: Pitch[]
  relative?: string
}

export type TechniqueId =
  | 'pentascale-major'
  | 'pentascale-minor'
  | 'scale'                          // unified Scale; variant: 'major' (implicit for major keys) | 'natural' | 'harmonic' | 'melodic' (minor)
  | 'scale-chromatic'
  | 'scale-contrary-motion'
  | 'scale-thirds'
  | 'scale-sixths'
  | 'scale-octaves'
  | 'triads-solid'
  | 'triads-broken'
  | 'cadence'
  | 'arp-root'
  | 'arp-first-inv'
  | 'arp-second-inv'
  | 'arp-dominant-7'
  | 'arp-diminished-7'
  | 'arp-hand-over-hand'
  | 'formula-pattern'

export type TechniqueCategory = 'Scales' | 'Arpeggios' | 'Chords' | 'Patterns'

export type HandConfig = 'RH' | 'LH' | 'separate' | 'together'

export type ScaleVariant = 'natural' | 'harmonic' | 'melodic'  // only for minor keys

export interface TechniqueDef {
  id: TechniqueId
  name: string
  category: TechniqueCategory
  description: string
  octavesAllowed: (1 | 2 | 3 | 4)[]
  handConfigsAllowed: HandConfig[]
  generationNotes: string
}

export interface FingeringBlock {
  techniqueId: TechniqueId
  keyId: string
  hand: 'RH' | 'LH'
  variant?: ScaleVariant            // present for minor-scale fingerings; undefined for everything else
  ascending: number[]
  descending: number[]
  needsReview?: boolean             // [NEEDS REVIEW] flag from the docx; surfaced in the build report
  notes?: string
}

// Cadence template — scale-degree indices relative to the key's tonic.
// idx 0 = tonic; idx 7 = octave above; idx -7 = octave below. alter='#' raises by a semitone.
export interface CadenceVoice {
  idx: number
  alter?: '#' | 'b'
}
export interface CadenceTemplate {
  chords: CadenceVoice[][]          // 5 chords × 4 voices [bass, tenor, alto, soprano]
}

export interface AppDefaults {
  tempo: number
  octaves: 1 | 2 | 3 | 4
  keyId: string
  bpmMin: number
  bpmMax: number
}

export interface MasterData {
  version: string
  lastUpdated: string
  keys: KeyDef[]
  techniques: TechniqueDef[]
  fingerings: FingeringBlock[]
  formulaPattern: {
    source: string
    sequence: string
    description: string
  }
  cadences: {
    major: CadenceTemplate
    minor: CadenceTemplate
  }
  defaults: AppDefaults
}

// Implemented-technique allowlist for the current renderer.
// The data file always contains all 20 techniques; the UI shows only these in the picker.
// (arp-first-inv / arp-second-inv are reached via the "Arpeggio" inversion selector,
// not as separate picker entries.)
export const IMPLEMENTED_TECHNIQUES: TechniqueId[] = [
  'scale', 'arp-root', 'arp-dominant-7', 'arp-diminished-7', 'cadence',
]
