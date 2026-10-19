import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { status } from './status.ts'
import { formatBytes, setRunning, write } from './run.ts'
import { ollamaPost } from './ollama.ts'
import { estimatePrefTokens, estimateTokens, problemFor, rowProblem, type ChatRow, type DataFormat, type PrefRow } from './shared/chatRow.ts'
import { identifyLicense } from './shared/licenses.ts'
import type { DataSource, DatasetManifest } from './shared/manifest.ts'
import { DATA_SOURCES, OASST1, SMOLTALK } from './shared/library.ts'
import { rawCommand } from './rawsources.ts'
import { detectShape, parseCsv, SHAPES_HELP } from './shared/rowShapes.ts'
import { describeDataset } from './shared/datasetAbout.ts'

/**
 * `data …` (plan §7). A dataset is workspace/data/<name>/ with train.jsonl,
 * valid.jsonl and manifest.json. Rows are mlx-lm chat format. Everything
 * here is a command, so it shows in the terminal whether typed or clicked.
 */

export const DATASET_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const dir = (name: string) => path.join(WORKSPACE, 'data', name)
const rel = (p: string) => path.relative(path.dirname(WORKSPACE), p)

const HELP = `data new <name> [--format chat|preference]
data import dolly <name> [--limit 300] [--category <c>] [--seed 0]
data import oasst1 <name> [--limit 300]
data import smoltalk <name> --subset smol-magpie-ultra|smol-constraints|smol-rewrite|smol-summarize [--limit 300] [--seed 0]
data import example <example> <name>   (workspace/examples/data)
data import hf <owner/name> <name> [--config <c>] [--split train] [--limit 300]   (any dataset on huggingface.co/datasets)
data import file uploads/<file> <name> --license "<terms>"   (a .csv, .jsonl or .json uploaded on the Data tab)
data describe <name> <a sentence about it>
data template raw/<table> <name> --question "…{column}…" --answer "…{column}…" [--skip 0] [--limit 300]   (a table's rows as questions and answers)
data raw gutenberg <book number> <name>
data raw csv|txt <url> <name> --license "<what the source states>"
data validate <name>
data split <name> [--valid 0.1] [--seed 0]
data count <name>
data append <name> '<row json>' [--source <model or label>] [--from raw/<name>]`

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
  const names = [...new Set(sources.filter((s) => s.kind !== 'generated' && s.kind !== 'chat-log').map((s) => s.license))]
  return names.length ? names.join(' + ') : sources.length ? 'generated (see sources)' : 'none yet'
}

async function writeManifest(m: DatasetManifest) {
  m.license = combinedLicense(m.sources)
  await fs.writeFile(path.join(dir(m.name), 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
}

function recordCommand(m: DatasetManifest, line: string) {
  if (m.command.at(-1) !== line) m.command.push(line)
}

async function ensureDataset(name: string, line: string, format: DataFormat = 'chat'): Promise<DatasetManifest> {
  const existing = await readManifest(name)
  if (existing) return { ...existing, format: existing.format ?? 'chat' }
  await fs.mkdir(dir(name), { recursive: true })
  for (const f of ['train.jsonl', 'valid.jsonl']) await fs.writeFile(path.join(dir(name), f), '', { flag: 'a' })
  const m: DatasetManifest = {
    name,
    kind: 'dataset',
    created: new Date().toISOString(),
    license: 'none yet',
    inputs: [],
    command: [line],
    format,
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

/**
 * The opening of a dataset card, as a description: its first real sentences
 * (headings like "Dataset Card for X" and "Dataset Summary" skipped).
 */
async function hfAbout(repo: string): Promise<string | null> {
  try {
    const d = (await (await fetch(`https://huggingface.co/api/datasets/${repo}`)).json()) as { description?: string }
    const lines = (d.description ?? '').split('\n').map((l) => l.trim()).filter((l) => l.length > 60 || /[.!?]$/.test(l))
    const text = lines.join(' ').replace(/\s+/g, ' ').trim()
    if (!text) return null
    // Sentences end at . ! ? followed by a space (not the dots inside a web address); keep whole ones, in order.
    let out = ''
    for (const x of text.split(/(?<=[.!?])\s+/)) {
      if ((out + ' ' + x).length > 280) break
      out = `${out} ${x}`.trim()
    }
    return `From its card on Hugging Face: ${(out || text.slice(0, 277) + '…').trim()}`
  } catch {
    return null
  }
}

/** Rows from Hugging Face's dataset viewer API: JSON, 100 at a time, no parquet reader needed. */
async function hfRows(repo: string, config: string, offset: number, length: number, abort: AbortController, split = 'train') {
  const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(repo)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`
  const res = await fetch(url, { signal: abort.signal })
  if (!res.ok) throw new Error(`datasets-server ${res.status} for ${repo}/${config}`)
  return (await res.json()) as { rows: { row: Record<string, unknown> }[]; num_rows_total: number }
}

async function addImported(name: string, line: string, rows: ChatRow[], source: DataSource) {
  const m = await ensureDataset(name, line)
  if (m.format === 'preference') {
    print(`data import: ${name} is a preference set; import into a chat dataset`)
    return false
  }
  await fs.appendFile(path.join(dir(name), 'train.jsonl'), toJsonl(rows))
  m.counts.train += rows.length
  const prev = m.sources.find((x) => x.id === source.id)
  if (prev) prev.rows += source.rows
  else m.sources.push(source)
  if (source.url && !m.inputs.includes(source.url)) m.inputs.push(source.url)
  recordCommand(m, line)
  await writeManifest(m)
  print(`  ◂ ${rows.length} rows → workspace/data/${name}/train.jsonl · ${source.license}`)
  return true
}

/** oasst1, flattened (plan §8): each conversation's first prompt and its top-ranked reply. */
async function importOasst1(name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  const limit = Number(opts.limit ?? 300)
  const lang = opts.lang ?? 'en'
  const abort = new AbortController()
  setRunning({ abort })
  try {
    const declared = await hfLicense(OASST1.repo)
    const license = declared === 'apache-2.0' ? 'Apache 2.0' : (declared ?? OASST1.license)
    print(declared ? `license on Hugging Face: ${declared}` : `couldn't read the license; recording the listed one (${OASST1.license})`)
    const roots = new Map<string, string>()
    const rows: ChatRow[] = []
    for (let offset = 0; rows.length < limit && offset < 20_000; offset += 100) {
      const page = await hfRows(OASST1.repo, 'default', offset, 100, abort)
      for (const { row } of page.rows) {
        const r = row as { message_id: string; parent_id: string | null; role: string; text: string; lang: string; rank: number | null; deleted?: boolean }
        if (r.deleted || r.lang !== lang) continue
        if (r.role === 'prompter' && !r.parent_id) roots.set(r.message_id, r.text)
        else if (r.role === 'assistant' && r.rank === 0 && r.parent_id && roots.has(r.parent_id)) {
          rows.push({ messages: [{ role: 'user', content: roots.get(r.parent_id)!.trim() }, { role: 'assistant', content: r.text.trim() }] })
          roots.delete(r.parent_id)
        }
      }
      write(`\r\x1b[2Kread ${offset + page.rows.length} messages · ${rows.length} pairs`)
      if (page.rows.length < 100) break
    }
    write('\n')
    return addImported(name, line, rows.slice(0, limit), { id: OASST1.repo, kind: 'import', license, licenseChecked: !!declared, url: `https://huggingface.co/datasets/${OASST1.repo}`, rows: Math.min(rows.length, limit) })
  } catch (err) {
    write('\n')
    print(abort.signal.aborted ? '  ◂ stopped' : `data import oasst1: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}

/** SmolTalk, only the subsets its card licenses as Apache 2.0 (see library.ts). */
async function importSmoltalk(name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  const subset = opts.subset ?? ''
  if (!SMOLTALK.subsets.includes(subset)) {
    print(`data import smoltalk: --subset is one of ${SMOLTALK.subsets.join(', ')} (the ones the dataset card licenses as Apache 2.0)`)
    return false
  }
  const limit = Number(opts.limit ?? 300)
  const seed = Number(opts.seed ?? 0)
  const abort = new AbortController()
  setRunning({ abort })
  try {
    // The license lives in the card's text, not its metadata: read it now, as the import's record.
    const card = await fetch(`https://huggingface.co/datasets/${SMOLTALK.repo}/raw/main/README.md`).then((r) => (r.ok ? r.text() : ''), () => '')
    const section = card.split(/^## License/m)[1]?.split(/^## /m)[0] ?? ''
    // The card names the four new subsets in one sentence (spelling "Smol-contraints" as it does).
    const checked = /Apache 2\.0/.test(section) && /Smol-Magpie-Ultra.*Smol-cons?traints.*Smol-rewrite.*Smol-summarize/is.test(section)
    print(checked ? `license: the card's License section names this subset as Apache 2.0` : `couldn't confirm the license from the card; recording ${SMOLTALK.license} as listed`)
    const first = await hfRows(SMOLTALK.repo, subset, 0, 1, abort)
    const total = first.num_rows_total
    const start = Math.floor(rng(seed)() * Math.max(1, total - limit))
    const rows: ChatRow[] = []
    for (let offset = start; rows.length < limit && offset < total; offset += 100) {
      const page = await hfRows(SMOLTALK.repo, subset, offset, Math.min(100, limit - rows.length), abort)
      for (const { row } of page.rows) {
        const msgs = (row.messages as { role: string; content: string }[]) ?? []
        const r = { messages: msgs.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })) }
        if (!rowProblem(r)) rows.push(r)
      }
      write(`\r\x1b[2Kread ${rows.length} of ${limit}`)
    }
    write('\n')
    return addImported(name, line, rows, { id: `${SMOLTALK.repo}/${subset}`, kind: 'import', license: SMOLTALK.license, licenseChecked: checked, url: `https://huggingface.co/datasets/${SMOLTALK.repo}`, rows: rows.length })
  } catch (err) {
    write('\n')
    print(abort.signal.aborted ? '  ◂ stopped' : `data import smoltalk: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}

/** Copy a dataset from workspace/examples (tracked in git, CC0) into workspace/data. */
async function importExample(example: string, name: string, line: string): Promise<boolean> {
  const from = path.join(WORKSPACE, 'examples', 'data', example)
  const src = await readJson<DatasetManifest>(path.join(from, 'manifest.json'))
  if (!src || !DATASET_NAME.test(example)) {
    const have = await fs.readdir(path.join(WORKSPACE, 'examples', 'data')).catch(() => [])
    print(`data import example: no example ${example}. examples: ${have.join(', ') || 'none'}`)
    return false
  }
  if (await readManifest(name)) {
    print(`${name} already exists`)
    return false
  }
  await fs.mkdir(dir(name), { recursive: true })
  for (const f of ['train.jsonl', 'valid.jsonl']) await fs.copyFile(path.join(from, f), path.join(dir(name), f))
  const m: DatasetManifest = {
    ...src,
    name,
    created: new Date().toISOString(),
    inputs: [`workspace/examples/data/${example}`],
    command: [line],
  }
  await writeManifest(m)
  print(`  ◂ ${m.counts.train} + ${m.counts.valid} ${m.format === 'preference' ? 'pairs' : 'rows'} → workspace/data/${name} · ${m.license}`)
  return true
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
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
    if (m.format === 'preference') {
      print(`data import: ${name} is a preference set; import into a chat dataset`)
      return false
    }
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

/* ---------- any dataset: from Hugging Face by name, or a file brought in ---------- */

/**
 * Turn rows of any known shape (see shared/rowShapes.ts) into a dataset. The
 * shape is worked out from the first row and printed, so the student sees how
 * their columns were read; rows that don't fit are counted and left out.
 */
async function addConverted(name: string, line: string, found: Record<string, unknown>[], source: DataSource, about: string | undefined): Promise<boolean> {
  if (!found.length) {
    print('no rows found')
    return false
  }
  const shape = detectShape(found[0])
  if (!shape) {
    print(`couldn't tell which columns are the question and the answer. columns: ${Object.keys(found[0]).join(', ')}`)
    for (const h of SHAPES_HELP) print(`  ${h}`)
    print('rename the columns in the file to one of these and bring it in again')
    return false
  }
  print(`reading ${shape.reads} (${shape.format})`)
  const rows = found.flatMap((r) => {
    const c = shape.convert(r)
    return c ? [c] : []
  })
  if (found.length - rows.length) print(`  ${found.length - rows.length} ${found.length - rows.length === 1 ? "row" : "rows"} left out: empty or not in that shape`)
  if (!rows.length) return false
  const existing = await readManifest(name)
  if (existing && (existing.format ?? 'chat') !== shape.format) {
    print(`${name} is a ${existing.format ?? 'chat'} dataset and these rows are ${shape.format}; bring them into a new dataset`)
    return false
  }
  const m = existing ?? (await ensureDataset(name, line, shape.format))
  await fs.appendFile(path.join(dir(name), 'train.jsonl'), toJsonl(rows))
  m.counts.train += rows.length
  source.rows = rows.length
  m.sources.push(source)
  if (source.url && !m.inputs.includes(source.url)) m.inputs.push(source.url)
  if (about) m.about = about
  recordCommand(m, line)
  await writeManifest(m)
  print(`  ◂ ${rows.length} ${shape.format === 'preference' ? 'pairs' : 'rows'} → workspace/data/${name}/train.jsonl · ${source.license}`)
  return true
}

/** `data import hf <owner/name> <dataset>`: any dataset on Hugging Face with a viewer, read through its rows API. */
async function importHf(repo: string, name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) {
    print('usage: data import hf <owner/name> <dataset> [--config <c>] [--split train] [--limit 300]   (the name as shown on huggingface.co/datasets)')
    return false
  }
  const limit = Math.min(Number(opts.limit ?? 300), 5000)
  const abort = new AbortController()
  setRunning({ abort })
  try {
    let config = opts.config
    let split = opts.split
    if (!config || !split) {
      // Ask the viewer which configs and splits exist; take the first, preferring "train".
      const res = await fetch(`https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(repo)}`, { signal: abort.signal })
      if (!res.ok) {
        print(`Hugging Face has no viewer for ${repo} (${res.status}). Check the name, or download its file and bring it in with upload.`)
        return false
      }
      const { splits } = (await res.json()) as { splits: { config: string; split: string }[] }
      const pick = splits.find((x) => (!config || x.config === config) && (split ? x.split === split : x.split === 'train')) ?? splits.find((x) => !config || x.config === config)
      if (!pick) {
        print(`no ${config ? `config ${config}` : 'splits'} in ${repo}. configs: ${[...new Set(splits.map((x) => x.config))].join(', ')}`)
        return false
      }
      config = pick.config
      split = pick.split
      print(`reading ${repo} · config ${config} · split ${split}`)
    }
    const declared = await hfLicense(repo)
    print(declared ? `license on Hugging Face: ${declared}` : 'no license on the dataset card: check it before you share anything made from it')
    const found: Record<string, unknown>[] = []
    for (let offset = 0; found.length < limit; offset += 100) {
      const page = await hfRows(repo, config, offset, Math.min(100, limit - found.length), abort, split)
      found.push(...page.rows.map((r) => r.row))
      write(`\r\x1b[2Kread ${found.length} of ${Math.min(limit, page.num_rows_total)}`)
      if (offset + 100 >= page.num_rows_total) break
    }
    write('\n')
    const source: DataSource = { id: repo, kind: 'import', license: declared ?? 'not stated (check the dataset card)', licenseChecked: !!declared, url: `https://huggingface.co/datasets/${repo}`, rows: 0 }
    return addConverted(name, line, found, source, opts.about ?? (await hfAbout(repo)) ?? undefined)
  } catch (err) {
    write('\n')
    print(abort.signal.aborted ? '  ◂ stopped' : `data import hf: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}

/** `data import file uploads/<file> <dataset> --license "<terms>"`: a .csv, .jsonl or .json brought in from the browser. */
async function importFile(rel: string, name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  if (!/^uploads\/[\w.-]+\.(csv|jsonl|json)$/.test(rel ?? '')) {
    print('usage: data import file uploads/<file>.csv|.jsonl|.json <dataset> --license "<the terms it came with>"')
    return false
  }
  if (!opts.license?.trim()) {
    print('data import file: say what license the data came with, e.g. --license "CC BY 4.0", or --license "mine" for your own writing')
    return false
  }
  const text = await fs.readFile(path.join(WORKSPACE, rel), 'utf8').catch(() => null)
  if (text === null) {
    print(`no file workspace/${rel}`)
    return false
  }
  let found: Record<string, unknown>[] = []
  try {
    if (rel.endsWith('.csv')) found = parseCsv(text)
    else if (rel.endsWith('.jsonl')) found = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    else {
      const v = JSON.parse(text)
      found = Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Array.isArray(v?.rows) ? v.rows : []
    }
  } catch (err) {
    print(`data import file: couldn't read ${rel}: ${(err as Error).message}`)
    return false
  }
  const source: DataSource = { id: rel, kind: 'import', license: opts.license.trim(), licenseChecked: false, rows: 0 }
  return addConverted(name, line, found.filter((r) => r && typeof r === 'object'), source, opts.about)
}

/** `data describe <dataset> <text…>`: say in your own words what the dataset is. */
async function describe(name: string, words: string[], line: string): Promise<boolean> {
  const m = await readManifest(name)
  if (!m) return missing(name)
  const about = words.join(' ').trim()
  if (!about) {
    print(`${name}: ${describeDataset(m)}`)
    return true
  }
  m.about = about
  recordCommand(m, line)
  await writeManifest(m)
  print(`  ◂ ${name}: ${about}`)
  return true
}

/**
 * `data template raw/<table> <dataset> --question "…{column}…" --answer "…{column}…"`:
 * the formatting step for a table. Each row fills the blanks, so a row of
 * traffic counts becomes "How many vehicles a day use 14th St NW?" → "About
 * 18,000.". No model involved: the answers are the table's own facts.
 */
async function template(rel: string, name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  const q = opts.question?.trim()
  const a = opts.answer?.trim()
  if (!/^raw\/[a-z0-9._-]+$/.test(rel ?? '') || !q || !a) {
    print('usage: data template raw/<table> <dataset> --question "…{column}…" --answer "…{column}…" [--skip 0] [--limit 300] [--seed 0]')
    return false
  }
  const raw = await readJson<{ license: string; licenseChecked?: boolean; inputs?: string[] }>(path.join(WORKSPACE, rel, 'manifest.json'))
  const text = await fs.readFile(path.join(WORKSPACE, rel, 'source.csv'), 'utf8').catch(() => null)
  if (!raw || text === null) {
    print(`${rel} isn't a table: bring one in with data raw csv first`)
    return false
  }
  const rows = parseCsv(text)
  const columns = rows[0] ? Object.keys(rows[0]) : []
  // {column}, or {column|round} for a whole number with thousands commas (18,204 rather than 18204.3349)
  const blanks = [...new Set([...`${q} ${a}`.matchAll(/\{([^{}|]+)(?:\|round)?\}/g)].map((m) => m[1]))]
  const unknown = blanks.filter((b) => !columns.includes(b))
  if (!blanks.length) {
    print('the question or the answer needs at least one {column} from the table, or every row says the same thing')
    return false
  }
  if (unknown.length) {
    print(`no column called ${unknown.map((u) => `{${u}}`).join(', ')}. columns: ${columns.join(', ')}`)
    return false
  }
  // --skip 0 (or "n/a", "-", …): a value that means "not recorded" in this table, so rows with it are left out.
  const skip = (opts.skip ?? '').split(',').map((v) => v.trim()).filter((v, i, all) => v || all.length === 1)
  const round = (v: string) => (Number.isFinite(Number(v)) && v.trim() !== '' ? Math.round(Number(v)).toLocaleString('en-US') : v)
  const fill = (t: string, r: Record<string, string>) => t.replace(/\{([^{}|]+)(\|round)?\}/g, (_, c: string, how?: string) => (how ? round(r[c].trim()) : r[c].trim()))
  // Rows with a blank in any column used would make half-empty questions; leave them out. Same question twice: keep the first.
  const seen = new Set<string>()
  const made: ChatRow[] = []
  for (const r of shuffle(rows, Number(opts.seed ?? 0))) {
    if (blanks.some((b) => !r[b]?.trim() || (skip.length && skip.includes(r[b].trim())))) continue
    const question = fill(q, r)
    if (seen.has(question)) continue
    seen.add(question)
    made.push({ messages: [{ role: 'user', content: question }, { role: 'assistant', content: fill(a, r) }] })
    if (made.length >= Number(opts.limit ?? 300)) break
  }
  const why = `the rest had blanks${opts.skip !== undefined ? ` or ${opts.skip || 'empty'}` : ''}, repeated a question, or were past the limit`
  print(`${rows.length} rows in the table · ${made.length} made into questions and answers${rows.length > made.length ? ` (${why})` : ''}`)
  if (!made.length) return false
  const first = made[0].messages
  print(`  e.g. "${first[0].content}" → "${first[1].content}"`)
  const existing = await readManifest(name)
  if (existing && existing.format === 'preference') {
    print(`${name} is a preference set; template rows are questions and answers: use a new dataset`)
    return false
  }
  const m = existing ?? (await ensureDataset(name, line))
  await fs.appendFile(path.join(dir(name), 'train.jsonl'), toJsonl(made))
  m.counts.train += made.length
  const prev = m.sources.find((x) => x.id === rel)
  if (prev) prev.rows += made.length
  else m.sources.push({ id: rel, kind: 'import', license: raw.license, licenseChecked: !!raw.licenseChecked, rows: made.length, ...(raw.inputs?.[0] && { url: raw.inputs[0] }) })
  if (!m.inputs.includes(`workspace/${rel}`)) m.inputs.push(`workspace/${rel}`)
  if (opts.about) m.about = opts.about
  recordCommand(m, line)
  await writeManifest(m)
  print(`  ◂ ${made.length} rows → workspace/data/${name}/train.jsonl · ${raw.license}`)
  return true
}

/* ---------- validate / split / count / append ---------- */

async function validate(name: string, line: string): Promise<boolean> {
  const m = await readManifest(name)
  if (!m) return missing(name)
  const { train, valid } = await allRows(name)
  const problem = problemFor(m.format ?? 'chat')
  let ok = true
  for (const [label, part] of [['train', train], ['valid', valid]] as const) {
    const problems = [...part.bad]
    part.rows.forEach((r, i) => {
      const p = problem(r)
      if (p) problems.push({ line: part.lines[i], reason: p })
    })
    print(`${label}.jsonl  ${part.rows.length + part.bad.length} rows · ${problems.length ? `${problems.length} problems` : `all valid ${m.format === 'preference' ? 'preference pairs' : 'chat rows'}`}`)
    problems.sort((a, b) => a.line - b.line)
    problems.slice(0, 8).forEach((p) => print(`  line ${p.line}: ${p.reason}`))
    if (problems.length > 8) print(`  … and ${problems.length - 8} more`)
    if (problems.length) ok = false
  }
  if (!valid.rows.length) print(`no valid.jsonl rows yet: ${m.format === 'preference' ? 'the held-out check needs some' : 'mlx-lm needs some'}. run: data split ${name}`)
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
  const problem = problemFor(m.format ?? 'chat')
  const all = [...train.rows, ...valid.rows].filter((r) => !problem(r))
  const tokens = all.map((r) => (m.format === 'preference' ? estimatePrefTokens(r as PrefRow) : estimateTokens(r as ChatRow)))
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
  const m = await ensureDataset(name, line)
  const problem = problemFor(m.format)(row)
  if (problem) {
    print(`data append: ${m.format === 'preference' ? 'pair' : 'row'} ${problem}`)
    return false
  }
  await fs.appendFile(path.join(dir(name), 'train.jsonl'), JSON.stringify(row) + '\n')
  m.counts.train += 1
  const id = opts.source ?? 'typed'
  let s = m.sources.find((x) => x.id === id)
  if (!s) {
    // chat-log pairs are answers models gave in Chat; their licenses are the models' (see workspace/chat).
    const lic = id === 'chat-log' ? { license: 'model outputs (see workspace/chat)', checked: true } : opts.source ? await modelLicense(id) : { license: 'yours', checked: true }
    s = { id, kind: id === 'chat-log' ? 'chat-log' : opts.source ? 'generated' : 'typed', license: lic.license, licenseChecked: lic.checked, rows: 0 }
    m.sources.push(s)
    if (id === 'chat-log' && !m.inputs.includes('workspace/chat')) m.inputs.push('workspace/chat')
  }
  s.rows += 1
  // A row written from a raw passage carries that source along: its license and where it came from.
  if (opts.from) {
    const raw = await readJson<{ license: string; licenseChecked?: boolean }>(path.join(WORKSPACE, opts.from, 'manifest.json'))
    if (raw && /^raw\/[a-z0-9._-]+$/.test(opts.from)) {
      if (!m.inputs.includes(`workspace/${opts.from}`)) m.inputs.push(`workspace/${opts.from}`)
      if (!m.sources.some((x) => x.id === opts.from)) m.sources.push({ id: opts.from, kind: 'import', license: raw.license, licenseChecked: !!raw.licenseChecked, rows: 0 })
      m.sources.find((x) => x.id === opts.from)!.rows += 1
    }
  }
  // Every appended row is its own command; the manifest keeps the shape of it, not every row.
  recordCommand(m, `data append ${name} '<row>'${opts.source ? ` --source ${opts.source}` : ''}${opts.from ? ` --from ${opts.from}` : ''}`)
  await writeManifest(m)
  print(`  ◂ ${name}/train.jsonl · ${m.counts.train} ${m.format === 'preference' ? 'pairs' : 'rows'}`)
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
  if (sub === 'raw') return rawCommand(pos, opts, line)
  const name = sub === 'import' ? (['example', 'hf', 'file'].includes(pos[0]) ? pos[2] : pos[1]) : sub === 'template' ? pos[1] : pos[0]
  if (!sub || !['new', 'import', 'validate', 'split', 'count', 'append', 'raw', 'describe', 'template'].includes(sub)) {
    print(HELP)
    return !sub || sub === 'help'
  }
  if (!name || !DATASET_NAME.test(name)) {
    print(`data ${sub}: dataset names are lowercase letters, digits and . _ -`)
    return false
  }
  for (const k of Object.keys(opts)) {
    const allowed: Record<string, string[]> = { new: ['format'], import: ['limit', 'category', 'seed', 'subset', 'lang', 'config', 'split', 'license', 'about'], split: ['valid', 'seed'], append: ['source', 'from'], template: ['question', 'answer', 'limit', 'seed', 'about', 'skip'] }
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
      const format = (opts.format ?? 'chat') as DataFormat
      if (format !== 'chat' && format !== 'preference') {
        print('data new: --format is chat or preference')
        return false
      }
      await ensureDataset(name, line, format)
      print(`  ◂ workspace/data/${name}/ (train.jsonl, valid.jsonl, manifest.json) · ${format}`)
      return true
    }
    case 'import':
      if (pos[0] === 'example') return importExample(pos[1] ?? '', name, line)
      if (pos[0] === 'oasst1') return importOasst1(name, opts, line)
      if (pos[0] === 'smoltalk') return importSmoltalk(name, opts, line)
      if (pos[0] === 'hf') return importHf(pos[1], name, opts, line)
      if (pos[0] === 'file') return importFile(pos[1], name, opts, line)
      if (pos[0] !== 'dolly') {
        print(`data import: sources are dolly, oasst1, smoltalk, example <name>, hf <owner/name>, and file uploads/<file>`)
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
    case 'describe':
      return describe(name, pos.slice(1), line)
    case 'template':
      return template(pos[0], name, opts, line)
  }
  return false
}
