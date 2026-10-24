// Ask a model for a design for each request in design-requests.jsonl, then render
// each answer with OpenSCAD (its WebAssembly build), measure it, and check it fits
// the printer and keeps the request's numbers.
//
//   node docs/briefs/4-tangible/ask-designs.mjs data-to-shape
//   TOKENS=6000 node docs/briefs/4-tangible/ask-designs.mjs shape-writer-qwen
//
// Run `npm install` in docs/briefs/4-tangible once first. Whether the *form* is
// right (bars when it asked for bars) is for a person to judge: the answers, with
// each one's size, are saved in workspace/outputs/designs-<model>.json.
import fs from 'node:fs'
import { check } from './check-design.mjs'

async function main() {
  const model = process.argv[2]
  if (!model) return console.log('usage: node docs/briefs/4-tangible/ask-designs.mjs <model>')
  const rows = fs.readFileSync(new URL('./design-requests.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const out = []
  const count = { renders: 0, fits: 0, right: 0 }
  const t0 = Date.now()
  for (const r of rows) {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model, messages: [{ role: 'user', content: r.input }], stream: false, options: { num_predict: Number(process.env.TOKENS ?? 700), temperature: 0 } }),
    })
    const code = ((await res.json()).message?.content ?? '').replace(/```[a-z]*\n?/g, '').trim()
    const c = await check(code)
    const vals = (code.match(/values\s*=\s*\[([^\]]*)\]/) ?? [])[1]?.split(',').map((x) => Number(x.trim()))
    const sameData = !!vals && JSON.stringify(vals) === JSON.stringify(r.values)
    count.renders += c.renders
    count.fits += c.fits
    count.right += c.fits && sameData
    const first = r.input.split('\n').find((l) => l.startsWith('Encoding:')) ?? ''
    console.log(`${c.renders ? (c.fits ? 'fits ' : 'big  ') : 'fails'} ${sameData ? 'same data ' : 'other data'} ${(c.size ?? []).join(' x ').padEnd(16)} ${r.kind.padEnd(8)} ${first.slice(10, 80)}`)
    out.push({ ...r, code, check: c, sameData })
  }
  console.log(`\n${model}: renders ${count.renders} of ${rows.length} · fits the printer ${count.fits} · fits with the request's numbers ${count.right} · ${Math.round((Date.now() - t0) / 1000)}s`)
  const file = `workspace/outputs/designs-${model.replace(/[^\w.-]/g, '_')}.json`
  fs.mkdirSync('workspace/outputs', { recursive: true })
  fs.writeFileSync(file, JSON.stringify(out, null, 1))
  console.log(`the answers are in ${file}: paste one into OpenSCAD to see it`)
}

main()
