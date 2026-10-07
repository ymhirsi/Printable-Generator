// `npm run sync-data` — parse master-data.docx and regenerate /src/lib/data/generated/*.ts.
// All validation errors are collected and reported at once. The TS files are NOT
// overwritten unless the docx parses cleanly.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMasterDocx } from './lib/docxIO'
import {
  genKeysFile, genTechniquesFile, genFingeringsFile, genCadencesFile,
  genFormulaPatternFile, genDefaultsFile, genIndexFile,
} from './lib/codegen'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DOCX = resolve(ROOT, 'master-data.docx')
const GEN  = resolve(ROOT, 'src/lib/data/generated')

async function main() {
  if (!existsSync(DOCX)) {
    console.error(`✗ master-data.docx not found at ${DOCX}`)
    console.error('  Run `npm run export-data` first to generate it from the current TS files.')
    process.exit(1)
  }
  const buf = readFileSync(DOCX)
  const result = await parseMasterDocx(buf)

  if (!result.ok) {
    console.error('\n✗ master-data.docx has validation errors. No TS files were written.\n')
    for (const e of result.errors) console.error(`  • ${e}`)
    console.error(`\n  ${result.errors.length} error(s) total. Fix all blocks above and re-run.`)
    process.exit(1)
  }

  const data = result.data!
  writeFileSync(resolve(GEN, 'keys.ts'),            genKeysFile(data.keys))
  writeFileSync(resolve(GEN, 'techniques.ts'),      genTechniquesFile(data.techniques))
  writeFileSync(resolve(GEN, 'fingerings.ts'),      genFingeringsFile(data.fingerings))
  writeFileSync(resolve(GEN, 'cadences.ts'),        genCadencesFile(data.cadences.major, data.cadences.minor))
  writeFileSync(resolve(GEN, 'formulaPattern.ts'),  genFormulaPatternFile(data.formulaPattern))
  writeFileSync(resolve(GEN, 'defaults.ts'),        genDefaultsFile(data.defaults))
  writeFileSync(resolve(GEN, 'index.ts'),           genIndexFile())

  console.log(`✓ Regenerated 7 files in ${GEN}`)
  console.log(`  ${data.keys.length} keys · ${data.techniques.length} techniques · ${data.fingerings.length} fingerings`)

  if (result.warnings.length) {
    console.log('\n  Warnings:')
    for (const w of result.warnings) console.log(`    • ${w}`)
  }

  // [NEEDS REVIEW] report
  const flagged = data.fingerings.filter(f => f.needsReview)
  if (flagged.length) {
    console.log(`\n  ${flagged.length} fingering block(s) tagged [NEEDS REVIEW]:`)
    const byTech: Record<string, typeof flagged> = {}
    for (const f of flagged) {
      const t = data.techniques.find(x => x.id === f.techniqueId)?.name ?? f.techniqueId
      ;(byTech[t] ||= []).push(f)
    }
    for (const [tech, list] of Object.entries(byTech)) {
      console.log(`\n    ${tech} (${list.length}):`)
      for (const f of list) {
        const k = data.keys.find(x => x.id === f.keyId)?.name ?? f.keyId
        const variant = f.variant ? ` — ${f.variant}` : ''
        console.log(`      · ${k} — ${f.hand}${variant}`)
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
