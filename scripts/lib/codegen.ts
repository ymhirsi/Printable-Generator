import type {
  MasterData, KeyDef, TechniqueDef, FingeringBlock, CadenceTemplate, Pitch,
} from '../../src/lib/data/types'

const banner =
  '// AUTO-GENERATED from master-data.docx by `npm run sync-data`.\n' +
  '// Do not edit by hand — edit the docx and re-sync.\n'

const pitchExpr = (p: Pitch): string =>
  `p('${p.step}','${p.accidental}',${p.octave})`

export function genKeysFile(keys: KeyDef[]): string {
  const lines: string[] = []
  lines.push(banner)
  lines.push(`import type { KeyDef, Pitch } from '../types'\n`)
  lines.push(`const p = (step: Pitch['step'], accidental: Pitch['accidental'], octave: number): Pitch => ({ step, accidental, octave })\n`)
  lines.push(`export const KEYS: KeyDef[] = [`)
  for (const k of keys) {
    lines.push(`  {`)
    lines.push(`    id: ${JSON.stringify(k.id)}, name: ${JSON.stringify(k.name)}, shortLabel: ${JSON.stringify(k.shortLabel)}, mode: ${JSON.stringify(k.mode)},`)
    lines.push(`    tonic: ${pitchExpr(k.tonic)},`)
    lines.push(`    keySignature: { sharps: ${JSON.stringify(k.keySignature.sharps)}, flats: ${JSON.stringify(k.keySignature.flats)} },`)
    lines.push(`    diatonic: [${k.diatonic.map(pitchExpr).join(',')}],`)
    if (k.relative) lines.push(`    relative: ${JSON.stringify(k.relative)},`)
    lines.push(`  },`)
  }
  lines.push(`]\n`)
  // KEY_GRID is hand-curated UI layout, not derivable from docx; we re-emit
  // the canonical grid here.
  lines.push(KEY_GRID_LITERAL)
  return lines.join('\n')
}

const KEY_GRID_LITERAL = `export interface KeyGridSlot {
  majorIds: string[]
  minorIds: string[]
  majorLabel: string
  minorLabel: string
}
export const KEY_GRID: KeyGridSlot[] = [
  { majorIds: ['c-major'],              minorIds: ['c-minor'],              majorLabel: 'C',     minorLabel: 'Cm' },
  { majorIds: ['db-major'],             minorIds: ['cs-minor'],             majorLabel: 'Db',    minorLabel: 'C#m' },
  { majorIds: ['d-major'],              minorIds: ['d-minor'],              majorLabel: 'D',     minorLabel: 'Dm' },
  { majorIds: ['eb-major'],             minorIds: ['eb-minor', 'ds-minor'], majorLabel: 'Eb',    minorLabel: 'Ebm/D#m' },
  { majorIds: ['e-major'],              minorIds: ['e-minor'],              majorLabel: 'E',     minorLabel: 'Em' },
  { majorIds: ['f-major'],              minorIds: ['f-minor'],              majorLabel: 'F',     minorLabel: 'Fm' },
  { majorIds: ['gb-major', 'fs-major'], minorIds: ['fs-minor'],             majorLabel: 'Gb/F#', minorLabel: 'F#m' },
  { majorIds: ['g-major'],              minorIds: ['g-minor'],              majorLabel: 'G',     minorLabel: 'Gm' },
  { majorIds: ['ab-major'],             minorIds: ['gs-minor'],             majorLabel: 'Ab',    minorLabel: 'G#m' },
  { majorIds: ['a-major'],              minorIds: ['a-minor'],              majorLabel: 'A',     minorLabel: 'Am' },
  { majorIds: ['bb-major'],             minorIds: ['bb-minor'],             majorLabel: 'Bb',    minorLabel: 'Bbm' },
  { majorIds: ['b-major'],              minorIds: ['b-minor'],              majorLabel: 'B',     minorLabel: 'Bm' },
]
`

export function genTechniquesFile(techs: TechniqueDef[]): string {
  const lines: string[] = []
  lines.push(banner)
  lines.push(`import type { TechniqueDef } from '../types'\n`)
  lines.push(`export const TECHNIQUES: TechniqueDef[] = [`)
  for (const t of techs) {
    lines.push(`  {`)
    lines.push(`    id: ${JSON.stringify(t.id)}, name: ${JSON.stringify(t.name)}, category: ${JSON.stringify(t.category)},`)
    lines.push(`    description: ${JSON.stringify(t.description)},`)
    lines.push(`    octavesAllowed: ${JSON.stringify(t.octavesAllowed)},`)
    lines.push(`    handConfigsAllowed: ${JSON.stringify(t.handConfigsAllowed)},`)
    lines.push(`    generationNotes: ${JSON.stringify(t.generationNotes)},`)
    lines.push(`  },`)
  }
  lines.push(`]\n`)
  return lines.join('\n')
}

export function genFingeringsFile(fings: FingeringBlock[]): string {
  const lines: string[] = []
  lines.push(banner)
  lines.push(`import type { FingeringBlock } from '../types'\n`)
  lines.push(`export const FINGERINGS: FingeringBlock[] = [`)
  for (const f of fings) {
    const parts: string[] = [
      `techniqueId: ${JSON.stringify(f.techniqueId)}`,
      `keyId: ${JSON.stringify(f.keyId)}`,
      `hand: ${JSON.stringify(f.hand)}`,
    ]
    if (f.variant) parts.push(`variant: ${JSON.stringify(f.variant)}`)
    parts.push(`ascending: ${JSON.stringify(f.ascending)}`)
    parts.push(`descending: ${JSON.stringify(f.descending)}`)
    if (f.needsReview) parts.push(`needsReview: true`)
    if (f.notes) parts.push(`notes: ${JSON.stringify(f.notes)}`)
    lines.push(`  { ${parts.join(', ')} },`)
  }
  lines.push(`]\n`)
  return lines.join('\n')
}

export function genCadencesFile(major: CadenceTemplate, minor: CadenceTemplate): string {
  const fmt = (t: CadenceTemplate) =>
    t.chords.map(chord =>
      `[${chord.map(v => v.alter ? `{ idx: ${v.idx}, alter: ${JSON.stringify(v.alter)} }` : `{ idx: ${v.idx} }`).join(', ')}]`
    ).join(',\n    ')
  return [
    banner,
    `import type { CadenceTemplate } from '../types'\n`,
    `export const CADENCE_MAJOR: CadenceTemplate = {`,
    `  chords: [\n    ${fmt(major)}\n  ],`,
    `}\n`,
    `export const CADENCE_MINOR: CadenceTemplate = {`,
    `  chords: [\n    ${fmt(minor)}\n  ],`,
    `}\n`,
  ].join('\n')
}

export function genFormulaPatternFile(fp: { source: string; sequence: string; description: string }): string {
  return [
    banner,
    `export const FORMULA_PATTERN = {`,
    `  source: ${JSON.stringify(fp.source)},`,
    `  sequence: ${JSON.stringify(fp.sequence)},`,
    `  description: ${JSON.stringify(fp.description)},`,
    `}\n`,
  ].join('\n')
}

export function genDefaultsFile(d: MasterData['defaults']): string {
  return [
    banner,
    `import type { AppDefaults } from '../types'\n`,
    `export const DEFAULTS: AppDefaults = {`,
    `  tempo: ${d.tempo},`,
    `  octaves: ${d.octaves},`,
    `  keyId: ${JSON.stringify(d.keyId)},`,
    `  bpmMin: ${d.bpmMin},`,
    `  bpmMax: ${d.bpmMax},`,
    `}\n`,
  ].join('\n')
}

export function genIndexFile(): string {
  return [
    banner,
    `import type { MasterData } from '../types'`,
    `import { KEYS, KEY_GRID } from './keys'`,
    `import { TECHNIQUES } from './techniques'`,
    `import { FINGERINGS } from './fingerings'`,
    `import { CADENCE_MAJOR, CADENCE_MINOR } from './cadences'`,
    `import { FORMULA_PATTERN } from './formulaPattern'`,
    `import { DEFAULTS } from './defaults'`,
    ``,
    `export const MASTER_DATA: MasterData = {`,
    `  version: '1.1',`,
    `  lastUpdated: ${JSON.stringify(new Date().toISOString().slice(0, 10))},`,
    `  keys: KEYS, techniques: TECHNIQUES, fingerings: FINGERINGS,`,
    `  formulaPattern: FORMULA_PATTERN,`,
    `  cadences: { major: CADENCE_MAJOR, minor: CADENCE_MINOR },`,
    `  defaults: DEFAULTS,`,
    `}`,
    ``,
    `export { KEYS, KEY_GRID, TECHNIQUES, FINGERINGS, CADENCE_MAJOR, CADENCE_MINOR, FORMULA_PATTERN, DEFAULTS }`,
    ``,
  ].join('\n')
}
