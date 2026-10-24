/**
 * `npm run site:examples`: gather what the animated examples page
 * (site/examples/) draws from, into site/examples/data.json and a small icon
 * sprite. Everything comes from the real records: docs/examples/ (manifests,
 * commands, loss, chat answers, evaluations), the adapters' own tensors in
 * workspace/adapters/ and workspace/merges/, and Ollama's model list. Run it
 * after making the examples again; the page itself never reads the workspace.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EX = path.join(ROOT, 'docs', 'examples')
const WS = path.join(ROOT, 'workspace')
const OUT = path.join(ROOT, 'site', 'examples')

const json = <T = any>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8'))
const jsonl = (p: string) => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const ex = (...p: string[]) => path.join(EX, ...p)

/* ---------- tensors: read a safetensors file without any library ---------- */

type Tensor = { shape: number[]; data: Float32Array }
function readSafetensors(file: string, want: string[]): Record<string, Tensor> {
  const buf = fs.readFileSync(file)
  const n = Number(buf.readBigUInt64LE(0))
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'))
  const base = 8 + n
  const out: Record<string, Tensor> = {}
  for (const k of want) {
    const h = header[k]
    if (!h) throw new Error(`${file}: no ${k}`)
    const [s, e] = h.data_offsets
    const bytes = buf.subarray(base + s, base + e)
    const count = h.shape.reduce((a: number, b: number) => a * b, 1)
    const data = new Float32Array(count)
    if (h.dtype === 'F32') for (let i = 0; i < count; i++) data[i] = bytes.readFloatLE(i * 4)
    else if (h.dtype === 'BF16') for (let i = 0; i < count; i++) data[i] = new Float32Array(new Uint32Array([bytes.readUInt16LE(i * 2) << 16]).buffer)[0]
    else throw new Error(`${file}: ${k} is ${h.dtype}`)
    out[k] = { shape: h.shape, data }
  }
  return out
}

/** The top-left rows × cols of a 2-D tensor, rounded to 4 figures for a small file. */
function corner(t: Tensor, rows: number, cols: number): number[][] {
  const [, w] = t.shape
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => +t.data[r * w + c].toPrecision(4)))
}

/** ΔW = A · B over the corner: rows of A (inputs) × columns of B (outputs), through every rank. Full precision; rounded when written. */
function product(a: Tensor, b: Tensor, rows: number, cols: number): number[][] {
  const r = a.shape[1]
  const out = b.shape[1]
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => {
      let s = 0
      for (let k = 0; k < r; k++) s += a.data[i * r + k] * b.data[k * out + j]
      return s
    }),
  )
}

const LAYER = 'model.layers.31.self_attn.q_proj'
const ROWS = 24
const COLS = 24
function adapterPicture(folder: string) {
  const t = readSafetensors(path.join(folder, 'adapters.safetensors'), [`${LAYER}.lora_a`, `${LAYER}.lora_b`])
  const a = t[`${LAYER}.lora_a`]
  const b = t[`${LAYER}.lora_b`]
  return {
    layer: LAYER,
    shapeA: a.shape,
    shapeB: b.shape,
    a: corner(a, ROWS, a.shape[1]),
    b: corner(b, b.shape[0], COLS),
    delta: product(a, b, ROWS, COLS),
  }
}
const rounded = (p: ReturnType<typeof adapterPicture>) => ({ ...p, delta: p.delta.map((row) => row.map((v) => +v.toPrecision(4))) })

/* ---------- the 5-7-5 rule, as in docs/examples/3-haiku-dpo/tools/make_pairs.py ---------- */

const SPECIAL: Record<string, number> = { the: 1, fire: 1, every: 2, evening: 2, poem: 2, quiet: 2, being: 2, create: 2, idea: 3, museum: 3, canvas: 2, a: 1 }
function syllables(word: string) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w in SPECIAL) return SPECIAL[w]
  if (w.length <= 3) return 1
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m) => m[0]).replace(/^y/, '')
  return Math.max(1, (w.match(/[aeiouy]+/g) ?? []).length)
}
const counts = (text: string) => text.trim().split('\n').filter((l) => l.trim()).map((l) => l.split(/\s+/).reduce((s, w) => s + syllables(w), 0))

/* ---------- Ollama: what each example is called there, and its size ---------- */

async function ollamaSizes(): Promise<Record<string, number>> {
  try {
    const r = (await (await fetch('http://127.0.0.1:11434/api/tags')).json()) as { models: { name: string; size: number }[] }
    return Object.fromEntries(r.models.map((m) => [m.name.replace(/:latest$/, ''), m.size]))
  } catch {
    console.warn('Ollama is not running: model sizes left out')
    return {}
  }
}

/* ---------- the four chapters ---------- */

const lossOf = (p: string) => jsonl(p).map((r: any) => ({ iter: r.iter, train: r.trainLoss, val: r.valLoss }))
const chat = (p: string) => json<{ model: string; prompt: string; answer: string }[]>(p)
const sizes = await ollamaSizes()

const modelfile = fs.readFileSync(ex('1-studio-crit', 'studio-crit.Modelfile'), 'utf8')
const words = {
  id: 'words',
  title: 'studio crit',
  way: 'words',
  base: 'smollm2:1.7b',
  model: 'studio-crit',
  modelfile: modelfile.trimEnd().split('\n'),
  commands: json(ex('1-studio-crit', 'commands.json')),
  chat: chat(ex('1-studio-crit', 'chat.json')),
  size: sizes['studio-crit'],
  baseSize: sizes['smollm2:1.7b'],
}

const colourData = jsonl(path.join(WS, 'data', 'colour-hex-3k', 'train.jsonl'))
const examples = {
  id: 'examples',
  title: 'colour → hex',
  way: 'examples',
  raw: json(ex('2-colour-hex', 'raw-colors.manifest.json')),
  data: json(ex('2-colour-hex', 'data.manifest.json')),
  rows: colourData.slice(0, 18).map((r: any) => ({ q: r.messages[0].content, a: r.messages[1].content })),
  run: { command: fs.readFileSync(ex('2-colour-hex', 'run', 'command.txt'), 'utf8').trim().split('\n').filter(Boolean), loss: lossOf(ex('2-colour-hex', 'run', 'loss.jsonl')) },
  adapter: { ...json(ex('2-colour-hex', 'adapter.manifest.json')), picture: adapterPicture(path.join(WS, 'adapters', 'colour-hex-3k-360m')) },
  fused: json(ex('2-colour-hex', 'fused.manifest.json')),
  commands: json(ex('2-colour-hex', 'commands.json')),
  eval: json(ex('2-colour-hex', 'eval.json')),
  chat: chat(ex('2-colour-hex', 'chat.json')),
  base: 'smollm2:360m',
  model: 'colour-hex-3k-360m',
  size: sizes['colour-hex-3k-360m'],
}

const pairs = jsonl(ex('3-haiku-dpo', 'data', 'train.jsonl'))
const taste = {
  id: 'taste',
  title: 'haiku that keep 5-7-5',
  way: 'taste',
  data: json(ex('3-haiku-dpo', 'data', 'manifest.json')),
  pairs: pairs.slice(0, 10).map((p: any) => ({ prompt: p.prompt, chosen: p.chosen, rejected: p.rejected, chosenCounts: counts(p.chosen), rejectedCounts: counts(p.rejected) })),
  run: { command: fs.readFileSync(ex('3-haiku-dpo', 'run', 'command.txt'), 'utf8').trim().split('\n').filter(Boolean), loss: lossOf(ex('3-haiku-dpo', 'run', 'loss.jsonl')), results: json(ex('3-haiku-dpo', 'run', 'results.json')) },
  collapsed: { command: fs.readFileSync(ex('3-haiku-dpo', 'collapsed-run', 'command.txt'), 'utf8').trim().split('\n')[0], loss: lossOf(ex('3-haiku-dpo', 'collapsed-run', 'loss.jsonl')), results: json(ex('3-haiku-dpo', 'collapsed-run', 'results.json')) },
  adapter: { ...json(ex('3-haiku-dpo', 'adapter.manifest.json')), picture: adapterPicture(path.join(WS, 'adapters', 'haiku-575-dpo')) },
  fused: json(ex('3-haiku-dpo', 'fused.manifest.json')),
  commands: json(ex('3-haiku-dpo', 'commands.json')),
  eval: json(ex('3-haiku-dpo', 'eval.json')),
  base: 'smollm2:360m',
  model: 'haiku-575-dpo',
  size: sizes['haiku-575-dpo'],
}

/** The merge's own check, done again here from the files: the stacked product against (1 − t)·ΔA + t·ΔB, over the picture's corner. */
function mergeCheck(t: number, merged: ReturnType<typeof adapterPicture>) {
  const a = examples.adapter.picture.delta
  const b = taste.adapter.picture.delta
  let worst = 0
  merged.delta.forEach((row, i) => row.forEach((v, j) => (worst = Math.max(worst, Math.abs(v - ((1 - t) * a[i][j] + t * b[i][j]))))))
  return worst
}
const blends = [0.5, 0.75].map((t) => {
  const name = `colour-x-haiku-${t * 100}`
  const picture = adapterPicture(path.join(WS, 'merges', name))
  return { t, name, manifest: json(ex('4-merge', `${name}.manifest.json`)), picture: rounded(picture), check: mergeCheck(t, picture), size: sizes[name] }
})
const blend = {
  id: 'blend',
  title: 'colour + haiku',
  way: 'blend',
  a: 'colour-hex-3k-360m',
  b: 'haiku-575-dpo',
  blends,
  commands: json(ex('4-merge', 'commands.json')),
  chat: chat(ex('4-merge', 'chat.json')),
}

examples.adapter.picture = rounded(examples.adapter.picture)
taste.adapter.picture = rounded(taste.adapter.picture)
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify({ made: new Date().toISOString().slice(0, 10), chapters: [words, examples, taste, blend] }))

/* ---------- the hand-icon glyphs the page uses (the same ones as the app's tabs) ---------- */

const ICONS = ['hi-triangle-b-fill-r180', 'hi-star-scribble-fill-r45', 'hi-triangle-y-fill-r90', 'hi-bolt-fill', 'hi-dumbbell-fill-r90', 'hi-triangle-y-fill-r270', 'hi-dumbbell-fill', 'hi-blob-fill']
const sprite = fs.readFileSync(path.join(ROOT, 'ui', 'src', 'icons', 'hand-icons.svg'), 'utf8')
const symbols = ICONS.map((id) => {
  const m = new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`).exec(sprite)
  if (!m) throw new Error(`no ${id} in the hand-icons sprite`)
  return m[0]
})
// each glyph draws a shared path by reference: bring those along too
const shared = [...new Set(symbols.flatMap((s) => [...s.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])))].map((id) => {
  const m = new RegExp(`<(path|g|symbol)[^>]*id="${id}"[\\s\\S]*?(?:/>|</\\1>)`).exec(sprite)
  if (!m) throw new Error(`no ${id} in the hand-icons sprite`)
  return m[0]
})
fs.writeFileSync(path.join(OUT, 'icons.svg'), `<svg xmlns="http://www.w3.org/2000/svg"><!-- Kevin Patton's hand-icons (CC BY 4.0), the glyphs the app's tabs use --><defs>${shared.join('')}${symbols.join('')}</defs></svg>\n`)

const kb = (f: string) => `${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`
console.log(`site/examples/data.json ${kb('data.json')} · icons.svg ${kb('icons.svg')} · merge checks ${blends.map((b) => b.check.toExponential(1)).join(', ')}`)
