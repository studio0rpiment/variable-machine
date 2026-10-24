// Is this text a Vega-Lite chart that compiles, and does it follow three house rules?
import { compile } from 'vega-lite'
import fs from 'node:fs'
const COLUMNS = new Set(['EMPLOYER_CLEAN', 'AMOUNT', 'ELECTIONYEAR', 'WARD', 'CANDIDATENAME', 'CONTRIBUTORTYPE', 'DATEOFRECEIPT'])
export function check(text) {
  const out = { json: false, compiles: false, title: false, zero: true, fields: true, problems: [] }
  const m = text.match(/\{[\s\S]*\}/)
  let spec
  try { spec = JSON.parse(m ? m[0] : text); out.json = true } catch { out.problems.push('not JSON'); return out }
  try { compile(spec); out.compiles = true } catch (e) { out.problems.push('does not compile: ' + String(e.message).slice(0, 80)) }
  out.title = typeof spec.title === 'string' || typeof spec.title?.text === 'string'
  if (!out.title) out.problems.push('no title')
  const enc = spec.encoding ?? {}
  for (const [ch, e] of Object.entries(enc)) {
    if (e?.field && !COLUMNS.has(e.field)) { out.fields = false; out.problems.push(`unknown field ${e.field}`) }
    if ((ch === 'x' || ch === 'y') && e?.scale?.zero === false) { out.zero = false; out.problems.push('axis does not start at zero') }
  }
  out.ok = out.json && out.compiles && out.title && out.zero && out.fields
  return out
}
if (process.argv[1]?.endsWith('check-chart.mjs') && process.argv[2]) console.log(JSON.stringify(check(fs.readFileSync(process.argv[2], 'utf8'))))
