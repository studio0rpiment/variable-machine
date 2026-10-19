import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { status } from './status.ts'
import { formatBytes, setRunning, write } from './run.ts'
import { ollamaPost } from './ollama.ts'
import { estimateTokens, rowProblem, type ChatRow } from './shared/chatRow.ts'
import { identifyLicense } from './shared/licenses.ts'
import type { DataSource, DatasetManifest } from './shared/manifest.ts'
import { DATA_SOURCES } from './shared/library.ts'

/**
 * `data …` (plan §7). A dataset is workspace/data/<name>/ with train.jsonl,
 * valid.jsonl and manifest.json. Rows are mlx-lm chat format. Everything
 * here is a command, so it shows in the terminal whether typed or clicked.
 */

export const DATASET_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const dir = (name: string) => path.join(WORKSPACE, 'data', name)
const rel = (p: string) => path.relative(path.dirname(WORKSPACE), p)

const HELP = `data new <name>
data import dolly <name> [--limit 300] [--category <c>] [--seed 0]
data validate <name>
data split <name> [--valid 0.1] [--seed 0]
data count <name>
data append <name> '<row json>' [--source <model or label>]`

/** Small seeded PRNG (mulberry32), so a split or a sample can be made again exactly. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(xs: T[], seed: number): T[] {
  const r = rng(seed)
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

async function readJsonl(file: string): Promise<{ rows: unknown[]; lines: number[]; bad: { line: number; reason: string }[] }> {
  let text = ''
  try {
    text = await fs.readFile(file, 'utf8')
  } catch {
    return { rows: [], lines: [], bad: [] }
  }
  const rows: unknown[] = []
  const lines: number[] = []
  const bad: { line: number; reason: string }[] = []
  text.split('\n').forEach((l, i) => {
    if (!l.trim()) return
    try {
      rows.push(JSON.parse(l))
      lines.push(i + 1)
    } catch {
      bad.push({ line: i + 1, reason: 'not valid JSON' })
    }
  })
  return { rows, lines, bad }
}

const toJsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')

async function readManifest(name: string): Promise<DatasetManifest | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(name), 'manifest.json'), 'utf8')) as DatasetManifest
  } catch {
    return null
  }
}

/** A dataset's license follows its sources; share-alike terms carry through to the whole set. */
function combinedLicense(sources: DataSource[]) {
  const names = [...new Set(sources.filter((s) => s.kind !== 'generated').map((s) => s.license))]
  return names.length ? names.join(' + ') : sources.length ? 'generated (see sources)' : 'none yet'
}

async function writeManifest(m: DatasetManifest) {
  m.license = combinedLicense(m.sources)
  await fs.writeFile(path.join(dir(m.name), 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
}

function recordCommand(m: DatasetManifest, line: string) {
  if (m.command.at(-1) !== line) m.command.push(line)
}

async function ensureDataset(name: string, line: string): Promise<DatasetManifest> {
  const existing = await readManifest(name)
  if (existing) return existing
  await fs.mkdir(dir(name), { recursive: true })
  for (const f of ['train.jsonl', 'valid.jsonl']) await fs.writeFile(path.join(dir(name), f), '', { flag: 'a' })
  const m: DatasetManifest = {
    name,
    kind: 'dataset',
    created: new Date().toISOString(),
    license: 'none yet',
    inputs: [],
    command: [line],
    format: 'chat',
    counts: { train: 0, valid: 0 },
    split: null,
    sources: [],
  }
  await writeManifest(m)
  return m
}

async function allRows(name: string) {
  const train = await readJsonl(path.join(dir(name), 'train.jsonl'))
  const valid = await readJsonl(path.join(dir(name), 'valid.jsonl'))
  return { train, valid }
}

/* ---------- import ---------- */

/** Download once into workspace/raw/<id>/, with a progress line. Later imports reuse it. */
async function download(url: string, dest: string, abort: AbortController): Promise<boolean> {
  try {
    await fs.access(dest)
    print(`using ${rel(dest)} (downloaded earlier)`)
    return true
  } catch {
    // not there yet
  }
  await fs.mkdir(path.dirname(dest), { recursive: true })
  print(`GET ${url}`)
  const res = await fetch(url, { signal: abort.signal })
  if (!res.ok || !res.body) {
    print(`download failed: ${res.status} ${res.statusText}`)
    return false
  }
  const total = Number(res.headers.get('content-length') ?? 0)
  let done = 0
  const tmp = dest + '.part'
  const out = createWriteStream(tmp)
  let shown = ''
  for await (const chunk of res.body) {
    out.write(chunk)
    done += chunk.length
    // Redraw only when the visible text changes; chunks arrive far faster than that.
    const text = `downloading ${formatBytes(done)}${total ? ` / ${formatBytes(total)}` : ''}`
    if (text !== shown) write(`\r\x1b[2K${(shown = text)}`)
  }
  await new Promise((r) => out.end(r))
  await fs.rename(tmp, dest)
  write('\n')
  return true
}

/** Ask Hugging Face what license the dataset declares right now (plan §8: record it at download time). */
async function hfLicense(repo: string): Promise<string | null> {
  try {
    const res = await fetch(`https://huggingface.co/api/datasets/${repo}`)
    const d = (await res.json()) as { cardData?: { license?: string | string[] } }
    const l = d.cardData?.license
    return Array.isArray(l) ? l.join(', ') : (l ?? null)
  } catch {
    return null
  }
}

async function importDolly(name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  const src = DATA_SOURCES.dolly
  const limit = Number(opts.limit ?? 300)
  const seed = Number(opts.seed ?? 0)
  const abort = new AbortController()
  setRunning({ abort })
  try {
    const raw = path.join(WORKSPACE, 'raw', src.repo.replace('/', '--'), src.file)
    if (!(await download(src.url, raw, abort))) return false
    const declared = await hfLicense(src.repo)
    const license = declared ? (declared.toLowerCase() === 'cc-by-sa-3.0' ? 'CC BY-SA 3.0' : declared) : src.license
    print(declared ? `license on Hugging Face: ${declared}` : `couldn't reach Hugging Face for the license; recording the listed one (${src.license})`)

    const { rows } = await readJsonl(raw)
    type Dolly = { instruction: string; context: string; response: string; category: string }
    let pool = rows as Dolly[]
    if (opts.category) pool = pool.filter((r) => r.category === opts.category)
    if (!pool.length) {
      print(`no rows${opts.category ? ` in category ${opts.category}` : ''}. categories: ${[...new Set((rows as Dolly[]).map((r) => r.category))].join(', ')}`)
      return false
    }
    const picked = shuffle(pool, seed).slice(0, limit)
    // instruction (+ context) is the user turn; the human-written response is what gets learned.
    const converted: ChatRow[] = picked.map((r) => ({
      messages: [
        { role: 'user', content: r.context?.trim() ? `${r.instruction.trim()}\n\n${r.context.trim()}` : r.instruction.trim() },
        { role: 'assistant', content: r.response.trim() },
      ],
    }))

    const m = await ensureDataset(name, line)
    await fs.appendFile(path.join(dir(name), 'train.jsonl'), toJsonl(converted))
    m.counts.train += converted.length
    const source: DataSource = { id: src.repo, kind: 'import', license, licenseChecked: !!declared, url: src.url, rows: converted.length }
    const prev = m.sources.find((s) => s.id === source.id)
    if (prev) prev.rows += source.rows
    else m.sources.push(source)
    if (!m.inputs.includes(rel(raw))) m.inputs.push(rel(raw))
    recordCommand(m, line)
    await writeManifest(m)
    print(`  ◂ ${converted.length} rows → ${rel(path.join(dir(name), 'train.jsonl'))} · ${license}`)
    return true
  } catch (err) {
    write('\n')
    print(abort.signal.aborted ? '  ◂ stopped' : `data import: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}

/* ---------- validate / split / count / append ---------- */

async function validate(name: string, line: string): Promise<boolean> {
  const m = await readManifest(name)
  if (!m) return missing(name)
  const { train, valid } = await allRows(name)
  let ok = true
  for (const [label, part] of [['train', train], ['valid', valid]] as const) {
    const problems = [...part.bad]
    part.rows.forEach((r, i) => {
      const p = rowProblem(r)
      if (p) problems.push({ line: part.lines[i], reason: p })
    })
    print(`${label}.jsonl  ${part.rows.length + part.bad.length} rows · ${problems.length ? `${problems.length} problems` : 'all valid chat rows'}`)
    problems.sort((a, b) => a.line - b.line)
    problems.slice(0, 8).forEach((p) => print(`  line ${p.line}: ${p.reason}`))
    if (problems.length > 8) print(`  … and ${problems.length - 8} more`)
    if (problems.length) ok = false
  }
  if (!valid.rows.length) print(`no valid.jsonl rows yet: mlx-lm needs some. run: data split ${name}`)
  recordCommand(m, line)
  m.validated = { at: new Date().toISOString(), ok }
  await writeManifest(m)
  return ok
}

async function split(name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  const m = await readManifest(name)
  if (!m) return missing(name)
  const frac = Number(opts.valid ?? 0.1)
  const seed = Number(opts.seed ?? 0)
  if (!(frac > 0 && frac < 0.9)) {
    print('data split: --valid is a fraction between 0 and 0.9, e.g. 0.1')
    return false
  }
  const { train, valid } = await allRows(name)
  const rows = shuffle([...train.rows, ...valid.rows], seed)
  const nValid = Math.max(1, Math.round(rows.length * frac))
  if (rows.length < 2) {
    print('data split: needs at least 2 rows')
    return false
  }
  await fs.writeFile(path.join(dir(name), 'valid.jsonl'), toJsonl(rows.slice(0, nValid)))
  await fs.writeFile(path.join(dir(name), 'train.jsonl'), toJsonl(rows.slice(nValid)))
  m.counts = { train: rows.length - nValid, valid: nValid }
  m.split = { valid: frac, seed }
  recordCommand(m, line)
  await writeManifest(m)
  print(`  ◂ ${m.counts.train} train · ${m.counts.valid} valid (seed ${seed})`)
  return true
}

async function count(name: string, line: string): Promise<boolean> {
  const m = await readManifest(name)
  if (!m) return missing(name)
  const { train, valid } = await allRows(name)
  const limit = status.tier === '16' ? 1024 : 2048
  const all = [...train.rows, ...valid.rows].filter((r) => !rowProblem(r)) as ChatRow[]
  const tokens = all.map(estimateTokens)
  const total = tokens.reduce((a, b) => a + b, 0)
  const max = Math.max(0, ...tokens)
  const over = tokens.filter((t) => t > limit).length
  print(`${all.length} rows · about ${total.toLocaleString('en-US')} tokens · mean ${all.length ? Math.round(total / all.length) : 0} · longest ${max}`)
  print(`${over} rows over ${limit} tokens (the tier ${status.tier} max sequence length; mlx-lm truncates them)`)
  print('\x1b[2m  an estimate: characters / 3.7 plus the chat template; the base model’s tokenizer decides the real number\x1b[22m')
  m.tokens = { total, max, overLimit: over, limit, estimate: true }
  recordCommand(m, line)
  await writeManifest(m)
  return true
}

/** Model licenses for generated rows, read from Ollama once per model. */
async function modelLicense(model: string): Promise<{ license: string; checked: boolean }> {
  try {
    const res = await ollamaPost('/api/show', { model })
    const s = (await res.json()) as { license?: string | string[] }
    const info = identifyLicense(s.license)
    return { license: `${info.name} (model)`, checked: true }
  } catch {
    return { license: 'unknown', checked: false }
  }
}

async function append(name: string, json: string | undefined, opts: Record<string, string>, line: string): Promise<boolean> {
  if (!json) {
    print(`usage: data append <name> '<row json>' [--source <model>]`)
    return false
  }
  let row: unknown
  try {
    row = JSON.parse(json)
  } catch {
    print('data append: the row is not valid JSON')
    return false
  }
  const problem = rowProblem(row)
  if (problem) {
    print(`data append: row ${problem}`)
    return false
  }
  const m = await ensureDataset(name, line)
  await fs.appendFile(path.join(dir(name), 'train.jsonl'), JSON.stringify(row) + '\n')
  m.counts.train += 1
  const id = opts.source ?? 'typed'
  let s = m.sources.find((x) => x.id === id)
  if (!s) {
    const lic = opts.source ? await modelLicense(id) : { license: 'yours', checked: true }
    s = { id, kind: opts.source ? 'generated' : 'typed', license: lic.license, licenseChecked: lic.checked, rows: 0 }
    m.sources.push(s)
  }
  s.rows += 1
  // Every appended row is its own command; the manifest keeps the shape of it, not every row.
  recordCommand(m, `data append ${name} '<row>'${opts.source ? ` --source ${opts.source}` : ''}`)
  await writeManifest(m)
  print(`  ◂ ${name}/train.jsonl · ${m.counts.train} rows`)
  return true
}

function missing(name: string) {
  print(`no dataset called ${name}. data new ${name}, or data import dolly ${name}`)
  return false
}

/** Pull --flag value pairs out of the words; what's left are positional. */
function flags(words: string[]): { pos: string[]; opts: Record<string, string> } {
  const pos: string[] = []
  const opts: Record<string, string> = {}
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('--')) opts[words[i].slice(2)] = words[++i] ?? ''
    else pos.push(words[i])
  }
  return { pos, opts }
}

export async function dataCommand(args: string[], line: string): Promise<boolean> {
  const [sub, ...rest] = args
  const { pos, opts } = flags(rest)
  const name = sub === 'import' ? pos[1] : pos[0]
  if (!sub || !['new', 'import', 'validate', 'split', 'count', 'append'].includes(sub)) {
    print(HELP)
    return !sub || sub === 'help'
  }
  if (!name || !DATASET_NAME.test(name)) {
    print(`data ${sub}: dataset names are lowercase letters, digits and . _ -`)
    return false
  }
  for (const k of Object.keys(opts)) {
    const allowed: Record<string, string[]> = { import: ['limit', 'category', 'seed'], split: ['valid', 'seed'], append: ['source'] }
    if (!(allowed[sub] ?? []).includes(k)) {
      print(`data ${sub}: unknown option --${k}`)
      return false
    }
  }
  switch (sub) {
    case 'new': {
      if (await readManifest(name)) {
        print(`${name} already exists`)
        return false
      }
      await ensureDataset(name, line)
      print(`  ◂ workspace/data/${name}/ (train.jsonl, valid.jsonl, manifest.json)`)
      return true
    }
    case 'import':
      if (pos[0] !== 'dolly') {
        print(`data import: sources so far: dolly (databricks/databricks-dolly-15k)`)
        return false
      }
      return importDolly(name, opts, line)
    case 'validate':
      return validate(name, line)
    case 'split':
      return split(name, opts, line)
    case 'count':
      return count(name, line)
    case 'append':
      return append(name, pos[1], opts, line)
  }
  return false
}
