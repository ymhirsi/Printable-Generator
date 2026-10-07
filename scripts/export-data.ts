// `npm run export-data` — regenerate master-data.docx from the current TS data files.
// Use after editing /src/lib/data/generated/*.ts directly.
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MASTER_DATA } from '../src/lib/data/generated/index'
import { buildMasterDocx } from './lib/docxIO'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'master-data.docx')

async function main() {
  const buf = await buildMasterDocx(MASTER_DATA)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, buf)
  console.log(`✓ Wrote ${OUT} (${buf.length.toLocaleString()} bytes)`)
  console.log(`  ${MASTER_DATA.keys.length} keys · ${MASTER_DATA.techniques.length} techniques · ${MASTER_DATA.fingerings.length} fingering blocks`)
  const flagged = MASTER_DATA.fingerings.filter(f => f.needsReview)
  console.log(`  ${flagged.length} fingering block(s) marked [NEEDS REVIEW]`)
}
main().catch(e => { console.error(e); process.exit(1) })
