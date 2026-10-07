// Arpeggio fingerings — category-based canonical source.
//
// This file is HAND-MAINTAINED (it is the source of truth for arpeggio
// fingerings) and is deliberately NOT part of the master-data.docx round-trip
// that governs keys / techniques / scale-fingerings. Arpeggio fingerings are
// grouped into shape-based CATEGORIES: within a category every key shares one
// canonical fingering pattern (per hand, per inversion) — that shared pattern is
// the *only* thing the keys in a category have in common. Storing one pattern per
// category (rather than one per key) enforces consistency by construction and
// prevents per-key drift. The "Odd Ones" are the sole exception: each has its own
// per-key pattern.
//
// Pattern format — each pattern is the 2-OCTAVE ascending form: 7 finger numbers
// for the 7 notes of a 2-octave arpeggio (root, 3rd, 5th, root, 3rd, 5th, top
// root). Descending simply reverses the ascending sequence. Any octave count is
// built from three parts of the 7-digit string via `expandAscending` below:
//   first-octave block = digits 1–3, interior block = digits 4–6, top = digit 7
//   N octaves = [1–3] + [4–6]×(N−1) + [7]
//
// Enharmonic note: this app's key list carries two enharmonic duplicates that the
// source chart names only once — Gb major (= F# major) and D# minor (= Eb minor).
// An arpeggio on Gb major lands on the exact same keys as one on F# major (and
// D#m = Ebm), so the fingering is physically identical; both duplicates therefore
// sit in WBT alongside their named twin.

import type { HandConfig } from './types'

export type ArpHand = Extract<HandConfig, 'RH' | 'LH'>
export type ArpInversion = 0 | 1 | 2  // 0 root · 1 first · 2 second

export interface ArpHandPatterns {
  root: number[]    // length 7 — 2-octave ascending
  first: number[]
  second: number[]
}
export interface ArpPatternSet {
  RH: ArpHandPatterns
  LH: ArpHandPatterns
}
export interface ArpCategory {
  id: string
  label: string
  keyIds: string[]
  patterns: ArpPatternSet
}

const INVERSION_KEYS = ['root', 'first', 'second'] as const

// ----- Shared categories (one canonical pattern inherited by every member key) -----
export const ARP_CATEGORIES: ArpCategory[] = [
  {
    id: 'WBT',
    label: 'White & Black Triads',
    // C, F, G, Am, Dm, Em, F#, Ebm (+ enharmonic twins Gb major, D# minor).
    keyIds: [
      'c-major', 'f-major', 'g-major', 'a-minor', 'd-minor', 'e-minor',
      'fs-major', 'gb-major', 'eb-minor', 'ds-minor',
    ],
    patterns: {
      RH: { root: [1,2,3,1,2,3,5], first: [1,2,4,1,2,4,5], second: [1,2,4,1,2,4,5] },
      LH: { root: [5,4,2,1,4,2,1], first: [5,4,2,1,4,2,1], second: [5,3,2,1,3,2,1] },
    },
  },
  {
    id: 'PTMJ',
    label: 'Pyramid Triads (Major)',
    keyIds: ['a-major', 'd-major', 'e-major'],
    patterns: {
      RH: { root: [1,2,3,1,2,3,5], first: [2,1,2,4,1,2,4], second: [1,2,4,1,2,4,5] },
      LH: { root: [5,3,2,1,3,2,1], first: [3,2,1,3,2,1,3], second: [5,3,2,1,3,2,1] },
    },
  },
  {
    id: 'PTMN',
    label: 'Pyramid Triads (Minor)',
    keyIds: ['c-minor', 'f-minor', 'g-minor'],
    patterns: {
      RH: { root: [1,2,3,1,2,3,5], first: [2,1,2,3,1,2,3], second: [1,2,3,1,2,3,5] },
      LH: { root: [5,4,2,1,4,2,1], first: [4,2,1,4,2,1,2], second: [5,3,2,1,3,2,1] },
    },
  },
  {
    id: 'VT',
    label: '"V" Triads',
    // Ab, Db, Eb (major); C#m, F#m, G#m (minor).
    keyIds: ['ab-major', 'db-major', 'eb-major', 'cs-minor', 'fs-minor', 'gs-minor'],
    patterns: {
      RH: { root: [3,1,2,4,1,2,4], first: [1,2,4,1,2,4,5], second: [2,4,1,2,4,1,2] },
      LH: { root: [2,1,4,2,1,4,2], first: [5,4,2,1,4,2,1], second: [4,2,1,4,2,1,2] },
    },
  },
]

// ----- Odd Ones (unique per-key fingerings) -----
export const ARP_ODD_ONES: { id: string; label: string; keys: Record<string, ArpPatternSet> } = {
  id: 'OO',
  label: 'Odd Ones',
  keys: {
    'b-major': {
      RH: { root: [1,2,3,1,2,3,5], first: [2,3,1,2,3,1,2], second: [3,1,2,3,1,2,3] },
      LH: { root: [5,3,2,1,3,2,1], first: [3,2,1,3,2,1,3], second: [2,1,3,2,1,3,2] },
    },
    'b-minor': {
      RH: { root: [1,2,3,1,2,3,5], first: [1,2,4,1,2,4,5], second: [2,1,2,3,1,2,3] },
      LH: { root: [5,4,2,1,4,2,1], first: [5,4,2,1,4,2,1], second: [4,2,1,4,2,1,2] },
    },
    'bb-major': {
      RH: { root: [2,1,2,4,1,2,4], first: [1,2,4,1,2,4,5], second: [1,2,4,1,2,4,5] },
      LH: { root: [3,2,1,3,2,1,3], first: [5,4,2,1,4,2,1], second: [5,3,2,1,3,2,1] },
    },
    'bb-minor': {
      RH: { root: [2,3,1,2,3,1,2], first: [2,1,2,3,1,2,3], second: [1,2,3,1,2,3,5] },
      LH: { root: [3,2,1,3,2,1,3], first: [2,1,3,2,1,3,2], second: [5,3,2,1,3,2,1] },
    },
  },
}

// ----- Resolution -----
export interface ResolvedArp {
  categoryId: string
  label: string
  patterns: ArpPatternSet
}

export function resolveArpPatternSet(keyId: string): ResolvedArp | null {
  for (const cat of ARP_CATEGORIES) {
    if (cat.keyIds.includes(keyId)) {
      return { categoryId: cat.id, label: cat.label, patterns: cat.patterns }
    }
  }
  const oo = ARP_ODD_ONES.keys[keyId]
  if (oo) return { categoryId: ARP_ODD_ONES.id, label: ARP_ODD_ONES.label, patterns: oo }
  return null
}

export function arpPattern(keyId: string, hand: ArpHand, inversion: ArpInversion): number[] | null {
  const set = resolveArpPatternSet(keyId)
  if (!set) return null
  return set.patterns[hand][INVERSION_KEYS[inversion]]
}

// Build the N-octave ASCENDING finger sequence from a 7-digit 2-octave pattern.
//   N octaves = [digits 1–3] + [digits 4–6] × (N−1) + [digit 7]
// Length = 3 + 3·(N−1) + 1 = 3N + 1, matching the ascending arpeggio note count.
export function expandAscending(pattern7: number[], octaves: number): number[] {
  const first = pattern7.slice(0, 3)
  const interior = pattern7.slice(3, 6)
  const top = pattern7[6]
  const asc = [...first]
  for (let o = 0; o < octaves - 1; o++) asc.push(...interior)
  asc.push(top)
  return asc
}

// Full ascend-then-descend finger sequence (6N + 1 numbers), aligned 1:1 with the
// arpeggio's pitch sequence. Descending reverses the ascending run, sharing the
// peak note (so the top-note finger appears exactly once, at the true top).
export function arpeggioFingers(
  keyId: string, hand: ArpHand, inversion: ArpInversion, octaves: number,
): number[] | null {
  const pattern = arpPattern(keyId, hand, inversion)
  if (!pattern) return null
  const asc = expandAscending(pattern, octaves)
  const des = asc.slice(0, -1).reverse()
  return [...asc, ...des]
}

// A 1-octave arpeggio's opening finger can differ from the 2-octave opening: a
// hand that opens on 3 to set up a long multi-octave climb often opens on 4 for a
// single octave. We apply the extension rule as the default (opening = digit 1),
// but flag every 1-octave case whose 2-octave pattern opens on 3 as needing human
// review rather than silently assuming the single-octave finger is correct.
export function isOneOctaveStartUncertain(
  keyId: string, hand: ArpHand, inversion: ArpInversion,
): boolean {
  const pattern = arpPattern(keyId, hand, inversion)
  return !!pattern && pattern[0] === 3
}

// All [NEEDS REVIEW] 1-octave openings, for the build/audit report.
export function arpeggioOneOctaveReviews(): { keyId: string; hand: ArpHand; inversion: ArpInversion }[] {
  const out: { keyId: string; hand: ArpHand; inversion: ArpInversion }[] = []
  const allKeyIds = [
    ...ARP_CATEGORIES.flatMap(c => c.keyIds),
    ...Object.keys(ARP_ODD_ONES.keys),
  ]
  for (const keyId of allKeyIds) {
    for (const hand of ['RH', 'LH'] as ArpHand[]) {
      for (const inversion of [0, 1, 2] as ArpInversion[]) {
        if (isOneOctaveStartUncertain(keyId, hand, inversion)) out.push({ keyId, hand, inversion })
      }
    }
  }
  return out
}
