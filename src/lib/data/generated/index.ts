// AUTO-GENERATED from master-data.docx by `npm run sync-data`.
// Do not edit by hand — edit the docx and re-sync.

import type { MasterData } from '../types'
import { KEYS, KEY_GRID } from './keys'
import { TECHNIQUES } from './techniques'
import { FINGERINGS } from './fingerings'
import { CADENCE_MAJOR, CADENCE_MINOR } from './cadences'
import { FORMULA_PATTERN } from './formulaPattern'
import { DEFAULTS } from './defaults'

export const MASTER_DATA: MasterData = {
  version: '1.1',
  lastUpdated: "2026-06-23",
  keys: KEYS, techniques: TECHNIQUES, fingerings: FINGERINGS,
  formulaPattern: FORMULA_PATTERN,
  cadences: { major: CADENCE_MAJOR, minor: CADENCE_MINOR },
  defaults: DEFAULTS,
}

export { KEYS, KEY_GRID, TECHNIQUES, FINGERINGS, CADENCE_MAJOR, CADENCE_MINOR, FORMULA_PATTERN, DEFAULTS }
