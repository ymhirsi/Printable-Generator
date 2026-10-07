import {
  Document, Packer, Paragraph, HeadingLevel, TextRun,
} from 'docx'
import mammoth from 'mammoth'
import { JSDOM } from 'jsdom'   // optional; we'll do without if jsdom isn't available
import type {
  MasterData, KeyDef, Pitch, FingeringBlock, ScaleVariant, TechniqueDef,
  CadenceTemplate, Accidental, TechniqueId, HandConfig, TechniqueCategory, AppDefaults,
} from '../../src/lib/data/types'

// ---------- Serialization helpers ----------
const pitchStr = (p: Pitch) => `${p.step}${p.accidental || ''}${p.octave}`
const cadIdxStr = (v: { idx: number; alter?: '#' | 'b' }) =>
  `${v.idx}${v.alter ?? ''}`

const PITCH_RE = /^([A-G])(##|bb|#|b)?(-?\d+)$/
export const parsePitch = (s: string): Pitch | null => {
  const m = s.trim().match(PITCH_RE)
  if (!m) return null
  return { step: m[1] as Pitch['step'], accidental: (m[2] ?? '') as Accidental, octave: parseInt(m[3], 10) }
}

const CADIDX_RE = /^(-?\d+)([#b])?$/
const parseCadIdx = (s: string): { idx: number; alter?: '#' | 'b' } | null => {
  const m = s.trim().match(CADIDX_RE)
  if (!m) return null
  const idx = parseInt(m[1], 10)
  const alter = m[2] as '#' | 'b' | undefined
  return alter ? { idx, alter } : { idx }
}

// ---------- Exporter ----------
const h1 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_1 })
const h2 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2 })
const h3 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_3 })
const para = (text: string) => new Paragraph({ children: [new TextRun(text)] })
const labeled = (label: string, value: string) =>
  new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)] })

export async function buildMasterDocx(data: MasterData): Promise<Buffer> {
  const children: Paragraph[] = []

  children.push(h1('Solmido Piano — Master Data'))
  children.push(labeled('Version', data.version))
  children.push(labeled('Last updated', data.lastUpdated))
  children.push(para(''))

  // Section 1 — Keys
  children.push(h1('Section 1 — Keys'))
  for (const k of data.keys) {
    const sig =
      k.keySignature.sharps.length ? `${k.keySignature.sharps.length} sharp(s): ${k.keySignature.sharps.join(' ')}`
      : k.keySignature.flats.length ? `${k.keySignature.flats.length} flat(s): ${k.keySignature.flats.join(' ')}`
      : '(none)'
    children.push(h3(k.name))
    children.push(labeled('Id', k.id))
    children.push(labeled('Short label', k.shortLabel))
    children.push(labeled('Mode', k.mode))
    children.push(labeled('Key signature', sig))
    children.push(labeled('Tonic', pitchStr(k.tonic)))
    children.push(labeled('Relative', k.relative ?? '(none)'))
    children.push(labeled('Diatonic ascending', k.diatonic.map(pitchStr).join(' ')))
  }
  children.push(para(''))

  // Section 2 — Techniques
  children.push(h1('Section 2 — Techniques'))
  for (const t of data.techniques) {
    children.push(h3(t.name))
    children.push(labeled('Id', t.id))
    children.push(labeled('Category', t.category))
    children.push(labeled('Octaves allowed', t.octavesAllowed.join(', ')))
    children.push(labeled('Hand configurations', t.handConfigsAllowed.join(', ')))
    children.push(labeled('Description', t.description))
    children.push(labeled('Generation', t.generationNotes))
  }
  children.push(para(''))

  // Section 3 — Fingerings
  children.push(h1('Section 3 — Fingerings'))
  for (const f of data.fingerings) {
    const k = data.keys.find(x => x.id === f.keyId)
    const t = data.techniques.find(x => x.id === f.techniqueId)
    if (!k || !t) continue
    const variantSuffix = f.variant ? ` — ${capitalize(f.variant)}` : ''
    const reviewTag = f.needsReview ? ' [NEEDS REVIEW]' : ''
    children.push(h3(`${t.name} — ${k.name} — ${f.hand}${variantSuffix}${reviewTag}`))
    children.push(labeled('Ascending', f.ascending.join(' ')))
    children.push(labeled('Descending', f.descending.join(' ')))
    if (f.notes) children.push(labeled('Notes', f.notes))
  }
  children.push(para(''))

  // Section 4 — Formula Pattern
  children.push(h1('Section 4 — Formula Pattern Definition'))
  children.push(h3('Formula Pattern'))
  children.push(labeled('Source', data.formulaPattern.source))
  children.push(labeled('Sequence', data.formulaPattern.sequence))
  children.push(labeled('Description', data.formulaPattern.description))
  children.push(para(''))

  // Section 5 — Cadences
  children.push(h1('Section 5 — Cadence Progressions'))
  const labels = ['I', 'IV', 'I6/4', 'V7', 'I']
  const minorLabels = ['i', 'iv', 'i6/4', 'V7', 'i']
  children.push(h3('Major (I – IV – I⁶⁴ – V⁷ – I)'))
  data.cadences.major.chords.forEach((chord, i) => {
    children.push(labeled(labels[i], chord.map(cadIdxStr).join(' ') + '  (bass tenor alto soprano)'))
  })
  children.push(h3('Minor (i – iv – i⁶⁴ – V⁷ – i)'))
  data.cadences.minor.chords.forEach((chord, i) => {
    children.push(labeled(minorLabels[i], chord.map(cadIdxStr).join(' ') + '  (bass tenor alto soprano)'))
  })
  children.push(para(''))

  // Section 6 — App Defaults
  children.push(h1('Section 6 — App Defaults'))
  children.push(h3('Defaults'))
  children.push(labeled('Default tempo', String(data.defaults.tempo)))
  children.push(labeled('Default octaves', String(data.defaults.octaves)))
  children.push(labeled('Default key', data.defaults.keyId))
  children.push(labeled('BPM min', String(data.defaults.bpmMin)))
  children.push(labeled('BPM max', String(data.defaults.bpmMax)))

  const doc = new Document({ sections: [{ children }] })
  return await Packer.toBuffer(doc)
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- Parser ----------
interface Block {
  level: 1 | 2 | 3
  title: string
  body: { label: string | null; value: string }[]
}

function htmlToBlocks(html: string): Block[] {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const nodes = Array.from(doc.body.children)
  const blocks: Block[] = []
  let current: Block | null = null

  for (const node of nodes) {
    const tag = node.tagName.toLowerCase()
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      if (current) blocks.push(current)
      current = {
        level: tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3,
        title: (node.textContent || '').trim(),
        body: [],
      }
    } else if (tag === 'p') {
      const text = (node.textContent || '').trim()
      if (!text) continue
      const colonIdx = text.indexOf(':')
      let label: string | null = null
      let value: string = text
      if (colonIdx > 0 && colonIdx < 60) {
        label = text.slice(0, colonIdx).trim()
        value = text.slice(colonIdx + 1).trim()
      }
      if (current) current.body.push({ label, value })
    }
  }
  if (current) blocks.push(current)
  return blocks
}

const findLabel = (b: Block | undefined, label: string): string | undefined =>
  b?.body.find(x => x.label && x.label.toLowerCase() === label.toLowerCase())?.value

function blocksUnder(blocks: Block[], h1TitleSubstr: string): Block[] {
  const out: Block[] = []
  let inside = false
  for (const b of blocks) {
    if (b.level === 1) {
      inside = b.title.toLowerCase().includes(h1TitleSubstr.toLowerCase())
      continue
    }
    if (inside) out.push(b)
  }
  return out
}

const ALLOWED_TECH_IDS: TechniqueId[] = [
  'pentascale-major', 'pentascale-minor', 'scale', 'scale-chromatic', 'scale-contrary-motion',
  'scale-thirds', 'scale-sixths', 'scale-octaves', 'triads-solid', 'triads-broken',
  'cadence', 'arp-root', 'arp-first-inv', 'arp-second-inv', 'arp-dominant-7',
  'arp-diminished-7', 'arp-hand-over-hand', 'formula-pattern',
]

const ALLOWED_VARIANTS: ScaleVariant[] = ['natural', 'harmonic', 'melodic']

export interface ParseResult {
  ok: boolean
  data?: MasterData
  errors: string[]
  warnings: string[]
}

export async function parseMasterDocx(buf: Buffer): Promise<ParseResult> {
  const { value: html } = await mammoth.convertToHtml({ buffer: buf })
  const blocks = htmlToBlocks(html)

  const errors: string[] = []
  const warnings: string[] = []

  // ---- Keys ----
  const keys: KeyDef[] = []
  for (const b of blocksUnder(blocks, 'Section 1').filter(x => x.level === 3)) {
    const name = b.title
    const id = findLabel(b, 'Id')
    if (!id) { errors.push(`Key "${name}": missing Id.`); continue }
    const shortLabel = findLabel(b, 'Short label') ?? name
    const mode = (findLabel(b, 'Mode')?.toLowerCase() === 'minor') ? 'minor' : 'major'
    const sigText = findLabel(b, 'Key signature') || '(none)'
    const sharps: KeyDef['keySignature']['sharps'] = []
    const flats: KeyDef['keySignature']['flats'] = []
    if (/sharp/i.test(sigText)) {
      for (const n of (sigText.split(':')[1] ?? '').trim().split(/\s+/)) {
        if ('FCGDAEB'.includes(n)) sharps.push(n as any)
      }
    } else if (/flat/i.test(sigText)) {
      for (const n of (sigText.split(':')[1] ?? '').trim().split(/\s+/)) {
        if ('BEADGCF'.includes(n)) flats.push(n as any)
      }
    }
    const tonicStr = findLabel(b, 'Tonic')
    const tonic = tonicStr ? parsePitch(tonicStr) : null
    if (!tonic) { errors.push(`Key "${name}": tonic missing or malformed.`); continue }
    const diatonicStr = findLabel(b, 'Diatonic ascending') || ''
    const diatonic = diatonicStr.split(/\s+/).filter(Boolean).map(parsePitch)
    if (diatonic.length !== 7 || diatonic.some(x => !x)) {
      errors.push(`Key "${name}": diatonic ascending must list 7 valid pitches.`)
      continue
    }
    const relative = findLabel(b, 'Relative')
    keys.push({
      id, name, shortLabel, mode, tonic,
      keySignature: { sharps, flats },
      diatonic: diatonic as Pitch[],
      relative: relative && relative !== '(none)' ? relative : undefined,
    })
  }
  if (!keys.length) errors.push('No keys parsed from Section 1.')

  // ---- Techniques ----
  const techniques: TechniqueDef[] = []
  for (const b of blocksUnder(blocks, 'Section 2').filter(x => x.level === 3)) {
    const name = b.title
    const id = findLabel(b, 'Id') as TechniqueId | undefined
    if (!id || !ALLOWED_TECH_IDS.includes(id)) {
      errors.push(`Technique "${name}": missing/invalid Id (got "${id ?? ''}").`)
      continue
    }
    const category = (findLabel(b, 'Category') || 'Scales') as TechniqueCategory
    const octs = (findLabel(b, 'Octaves allowed') || '')
      .split(/[,\s]+/).filter(Boolean).map(n => parseInt(n, 10))
      .filter(n => [1, 2, 3, 4].includes(n)) as (1 | 2 | 3 | 4)[]
    const hands = (findLabel(b, 'Hand configurations') || '')
      .split(/[,\s]+/).filter(Boolean) as HandConfig[]
    techniques.push({
      id, name, category,
      octavesAllowed: octs.length ? octs : [1, 2],
      handConfigsAllowed: hands.length ? hands : ['RH'],
      description: findLabel(b, 'Description') || '',
      generationNotes: findLabel(b, 'Generation') || '',
    })
  }
  if (!techniques.length) errors.push('No techniques parsed from Section 2.')

  // ---- Fingerings ----
  const fingerings: FingeringBlock[] = []
  for (const b of blocksUnder(blocks, 'Section 3').filter(x => x.level === 3)) {
    const raw = b.title
    const needsReview = /\[NEEDS REVIEW\]/i.test(raw)
    const title = raw.replace(/\s*\[NEEDS REVIEW\]\s*/i, '').trim()
    const parts = title.split('—').map(s => s.trim())
    if (parts.length < 3 || parts.length > 4) {
      errors.push(`Fingering "${raw}": heading must be "Technique — Key — Hand" or "... — Hand — Variant".`)
      continue
    }
    const [techName, keyName, handStr, variantStr] = parts
    const tech = techniques.find(t => t.name.toLowerCase() === techName.toLowerCase())
    const key = keys.find(k => k.name.toLowerCase() === keyName.toLowerCase())
    if (!tech) { errors.push(`Fingering "${raw}": unknown technique "${techName}".`); continue }
    if (!key) { errors.push(`Fingering "${raw}": unknown key "${keyName}".`); continue }
    if (handStr !== 'RH' && handStr !== 'LH') {
      errors.push(`Fingering "${raw}": hand must be RH or LH (got "${handStr}").`); continue
    }
    let variant: ScaleVariant | undefined
    if (variantStr) {
      const v = variantStr.toLowerCase() as ScaleVariant
      if (!ALLOWED_VARIANTS.includes(v)) {
        errors.push(`Fingering "${raw}": variant must be one of natural/harmonic/melodic.`); continue
      }
      variant = v
    }
    const asc = (findLabel(b, 'Ascending') || '').split(/\s+/).filter(Boolean).map(n => parseInt(n, 10))
    const des = (findLabel(b, 'Descending') || '').split(/\s+/).filter(Boolean).map(n => parseInt(n, 10))
    if (!asc.length || !des.length) {
      errors.push(`Fingering "${raw}": missing Ascending or Descending row.`); continue
    }
    if (asc.some(n => !Number.isInteger(n) || n < 1 || n > 5) ||
        des.some(n => !Number.isInteger(n) || n < 1 || n > 5)) {
      errors.push(`Fingering "${raw}": all values must be integers 1–5.`); continue
    }
    if (asc.length !== des.length) {
      errors.push(`Fingering "${raw}": ascending (${asc.length}) and descending (${des.length}) must be same length.`); continue
    }
    fingerings.push({
      techniqueId: tech.id, keyId: key.id, hand: handStr, variant,
      ascending: asc, descending: des,
      needsReview: needsReview || undefined,
      notes: findLabel(b, 'Notes'),
    })
  }

  // ---- Formula Pattern ----
  const fpBlock = blocksUnder(blocks, 'Section 4').find(b => b.level === 3)
  const fp = fpBlock
    ? {
        source: findLabel(fpBlock, 'Source') || '',
        sequence: findLabel(fpBlock, 'Sequence') || '',
        description: findLabel(fpBlock, 'Description') || '',
      }
    : null
  if (!fp || !fp.source || !fp.sequence || !fp.description) {
    errors.push('Section 4 (Formula Pattern) missing one or more of Source/Sequence/Description.')
  }

  // ---- Cadences ----
  const cadBlocks = blocksUnder(blocks, 'Section 5').filter(b => b.level === 3)
  const parseCadence = (b: Block | undefined): CadenceTemplate | null => {
    if (!b) return null
    const rows = b.body.filter(x => x.label)   // 5 chord rows
    if (rows.length !== 5) return null
    const chords = rows.map(r => {
      const before = r.value.split('(')[0].trim()
      return before.split(/\s+/).filter(Boolean).map(parseCadIdx).filter((x): x is { idx: number; alter?: '#' | 'b' } => !!x)
    })
    if (chords.some(c => c.length !== 4)) return null
    return { chords }
  }
  const maj = parseCadence(cadBlocks.find(b => /major/i.test(b.title)))
  const min = parseCadence(cadBlocks.find(b => /minor/i.test(b.title)))
  if (!maj) errors.push('Section 5: major cadence missing or malformed (need 5 chords of 4 voices each).')
  if (!min) errors.push('Section 5: minor cadence missing or malformed (need 5 chords of 4 voices each).')

  // ---- Defaults ----
  const defBlock = blocksUnder(blocks, 'Section 6').find(b => b.level === 3)
  const defaults: AppDefaults = {
    tempo: parseInt(findLabel(defBlock, 'Default tempo') || '', 10) || 80,
    octaves: (parseInt(findLabel(defBlock, 'Default octaves') || '', 10) || 2) as 1 | 2 | 3 | 4,
    keyId: (findLabel(defBlock, 'Default key') || 'c-major'),
    bpmMin: parseInt(findLabel(defBlock, 'BPM min') || '', 10) || 40,
    bpmMax: parseInt(findLabel(defBlock, 'BPM max') || '', 10) || 200,
  }

  if (errors.length) return { ok: false, errors, warnings }

  return {
    ok: true,
    errors: [],
    warnings,
    data: {
      version: '1.1',
      lastUpdated: new Date().toISOString().slice(0, 10),
      keys, techniques, fingerings,
      formulaPattern: fp!,
      cadences: { major: maj!, minor: min! },
      defaults,
    },
  }
}
