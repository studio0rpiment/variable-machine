import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { ollamaPost } from './ollama.ts'
import { setRunning, write } from './run.ts'
import type { DatasetManifest } from './shared/manifest.ts'
import { parseCsv } from './shared/rowShapes.ts'
import { profileTable, rolesFromProfile, tidy, wordsFor, type TableProfile } from './shared/tableProfile.ts'
import { askSystem, makeQuestions, type Made } from './shared/tableQuestions.ts'
import { canonical, describeQuery, parseQuery, phrase, prepare, runQuery, sameAnswer, toSql, type Prepared, type Query, type Result, type Role, type Roles, type Table } from './shared/tableQuery.ts'

/**
 * A table as something to ask (the Data tab's "what's in this table" and
 * "make a training set from this table"). The table stays in
 * workspace/raw/<table>/ as source.csv; next to it go profile.json (what each
 * column holds) and roles.json (what each column means in a question, which
 * the student can change). A dataset made from it teaches a model to write
 * queries; the answers come from the runner (shared/tableQuery.ts).
 *
 *   data profile raw/<table> [--again]
 *   data role raw/<table> <COLUMN> what|where|when|how much|how|id|other   ·   data role raw/<table> --noun <word>
 *   data words raw/<table> <COLUMN> <VALUE> "<word>, <word>"
 *   data questions raw/<table> <dataset> [--rows 600] [--seed 0] [--voice plain|news|caption]
 *   data rows raw/<table> <dataset> --as csv|sentence [--limit 1000]
 *   ask <model> raw/<table> "<question>"
 *   ask check <model> <dataset> [--limit 100]
 */

export const ROLES: Role[] = ['what', 'where', 'when', 'how much', 'how', 'id', 'other']
const TABLE = /^raw\/[a-z0-9][a-z0-9._-]{0,63}$/
const DATASET = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ws = (...p: string[]) => path.join(WORKSPACE, ...p)
const readJson = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return null
  }
}
const writeJson = (p: string, v: unknown) => fs.writeFile(p, JSON.stringify(v, null, 2) + '\n')
const toJsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')

interface RawManifest {
  name: string
  license: string
  licenseChecked?: boolean
  inputs?: string[]
  page?: string
  about?: string
}

/** source.csv as columns and rows of text, read once per change of the file. */
const cache = new Map<string, { mtime: number; table: Table }>()
export async function readTable(rel: string): Promise<Table | null> {
  const file = ws(rel, 'source.csv')
  const st = await fs.stat(file).catch(() => null)
  if (!st) return null
  const hit = cache.get(rel)
  if (hit && hit.mtime === st.mtimeMs) return hit.table
  const objs = parseCsv(await fs.readFile(file, 'utf8'))
  const columns = objs[0] ? Object.keys(objs[0]) : []
  const table = { columns, rows: objs.map((o) => columns.map((c) => o[c] ?? '')) }
  cache.set(rel, { mtime: st.mtimeMs, table })
  return table
}

export async function readRoles(rel: string) {
  return readJson<Roles>(ws(rel, 'roles.json'))
}

function usage(): false {
  print('usage: data profile raw/<table> [--again]\n       data role raw/<table> <COLUMN> what|where|when|"how much"|how|id|other   ·   data role raw/<table> --noun <word>\n       data words raw/<table> <COLUMN> <VALUE> "<word>, <word>"\n       data questions raw/<table> <dataset> [--rows 600] [--seed 0] [--voice plain|news|caption]\n       data rows raw/<table> <dataset> --as csv|sentence [--limit 1000]')
  return false
}

async function loadAll(rel: string) {
  if (!TABLE.test(rel ?? '')) return null
  const raw = await readJson<RawManifest>(ws(rel, 'manifest.json'))
  const table = await readTable(rel)
  if (!raw || !table) {
    print(`${rel} isn't a table here: bring one in first (search public data, or data raw csv <url> <name> --license "…")`)
    return null
  }
  return { raw, table }
}

const titleOf = (raw: RawManifest) => (raw.about ?? raw.name).split(':')[0].trim()

/** `data profile raw/<table>`: what's in it, and a first guess at each column's role. */
async function profile(rel: string, opts: Record<string, string>): Promise<boolean> {
  const got = await loadAll(rel)
  if (!got) return usage()
  const { raw, table } = got
  const p = profileTable(table, { table: rel, title: titleOf(raw), license: raw.license.replace(/ \(as stated at import\)$/, ''), ...(raw.page && { page: raw.page }), ...(raw.inputs?.[0] && { source: raw.inputs[0] }) })
  await writeJson(ws(rel, 'profile.json'), p)
  const had = await readRoles(rel)
  const roles = had && opts.again === undefined ? had : rolesFromProfile(p)
  if (!had || opts.again !== undefined) await writeJson(ws(rel, 'roles.json'), roles)
  print(`${p.title ?? rel} · ${p.rows.toLocaleString('en-US')} rows · ${p.columns.length} columns${p.range ? ` · ${p.range.from} to ${p.range.to}` : ''} · ${p.license}`)
  for (const c of p.columns) {
    const role = roles.columns.find((x) => x.name === c.name)?.role ?? c.guess
    print(`  ${c.name.padEnd(22)} ${c.type.padEnd(6)} ${String(c.distinct).padStart(6)} values ${`${Math.round(c.missing * 100)}%`.padStart(4)} missing  ${role.padEnd(8)} e.g. ${c.examples.slice(0, 2).join(' · ').slice(0, 60)}`)
  }
  print(`  ◂ ${'workspace/' + rel}/profile.json${had && opts.again === undefined ? ' (roles.json kept as you set it; --again guesses afresh)' : `, roles.json · one row is ${roles.noun === 'row' ? 'a row' : `an ${roles.noun}`.replace(/^an ([^aeiou])/, 'a $1')}`}`)
  return true
}

/** `data role raw/<table> <COLUMN> <role>`: say what a column means in a question. */
async function role(rel: string, pos: string[], opts: Record<string, string>): Promise<boolean> {
  const roles = TABLE.test(rel ?? '') ? await readRoles(rel) : null
  if (!roles) return print(`${rel}: no roles yet; run data profile ${rel}`), false
  if (opts.noun !== undefined) {
    const noun = opts.noun.trim().toLowerCase()
    if (!/^[a-z][a-z -]{0,30}$/.test(noun)) return print('data role: --noun is a word for one row, like incident or tree'), false
    roles.noun = noun
  } else {
    const [column, r] = [pos[0], pos.slice(1).join(' ')] as [string, Role]
    const c = roles.columns.find((x) => x.name === column)
    if (!c || !ROLES.includes(r)) return print(`data role: a column (${roles.columns.map((x) => x.name).join(', ')}) and a role: ${ROLES.join(', ')}`), false
    c.role = r
    if (r === 'where' && !c.place) c.place = 'area'
    // a column that now names kinds needs words for its values
    const p = await readJson<TableProfile>(ws(rel, 'profile.json'))
    if (p && !roles.words[column] && ['what', 'how', 'when'].includes(r)) Object.assign(roles.words, wordsFor(p, [c], roles.noun))
  }
  await writeJson(ws(rel, 'roles.json'), roles)
  print(`  ◂ workspace/${rel}/roles.json`)
  return true
}

/** `data words raw/<table> <COLUMN> <VALUE> "a, b"`: the words a question uses for a value. The first is the one questions use most. */
async function words(rel: string, pos: string[]): Promise<boolean> {
  const roles = TABLE.test(rel ?? '') ? await readRoles(rel) : null
  if (!roles) return print(`${rel}: no roles yet; run data profile ${rel}`), false
  const [column, value, list] = pos
  const ws_ = (list ?? '').split(',').map((w) => w.trim()).filter(Boolean)
  if (!column || !value || !ws_.length || !roles.words[column]) return print(`data words: a column with words (${Object.keys(roles.words).join(', ') || 'none yet'}), one of its values, and "word, word"`), false
  roles.words[column][value] = ws_
  await writeJson(ws(rel, 'roles.json'), roles)
  print(`  ◂ ${column} ${value}: ${ws_.join(', ')}`)
  return true
}

/** The result in a few words, for a voice dataset's question side. */
export function resultLine(r: Result): string {
  if (!r.ok) return `error: ${r.error}`
  if (r.sides) return r.sides.map((s) => `${s.label}: ${s.value}`).join('; ')
  if (r.groups) return r.groups.map((g) => `${g.label}: ${g.value}`).join('; ')
  return `${r.measure} ${r.value}`
}

/** One answer, said in a voice: plain (what the runner says), a news brief, or a caption. */
export function voiced(style: string, m: { question: string; query: Query; result: Result }, roles: Roles): string {
  const plain = phrase(m.result, m.query, roles)
  if (style === 'news' && m.result.ok) return `${roles.title ? `According to ${roles.title}, ` : 'According to the data, '}${plain.charAt(0).toLowerCase()}${plain.slice(1)}`
  if (style === 'caption' && m.result.ok) {
    const cond = describeQuery({ ...m.query, compare: undefined }, roles)
    const nums = m.result.sides ?? m.result.groups
    return nums ? `${nums.map((s) => `${tidy(s.label)} ${s.value}`).join(' / ')}${cond ? ` · ${tidy(cond)}` : ''}` : `${m.result.value} · ${tidy(cond || 'all')}`
  }
  return plain
}

async function writeDataset(name: string, m: DatasetManifest, rows: unknown[]) {
  await fs.mkdir(ws('data', name), { recursive: true })
  await fs.writeFile(ws('data', name, 'train.jsonl'), toJsonl(rows))
  await fs.writeFile(ws('data', name, 'valid.jsonl'), '')
  await writeJson(ws('data', name, 'manifest.json'), m)
}

const tableSource = (rel: string, raw: RawManifest, rows: number) => ({
  id: rel,
  kind: 'import' as const,
  license: raw.license.replace(/ \(as stated at import\)$/, ''),
  licenseChecked: !!raw.licenseChecked,
  rows,
  ...(raw.inputs?.[0] && { url: raw.inputs[0] }),
  ...(raw.page && { page: raw.page }),
  ...(raw.about && { about: raw.about }),
})

/**
 * `data questions raw/<table> <dataset>`: questions and the queries that
 * answer them, made from the roles and the table's values. The rows teach a
 * model to write the query; questions.jsonl keeps each one's kind and the
 * answer, to check the trained model against.
 */
async function questions(rel: string, name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  const got = await loadAll(rel)
  if (!got || !DATASET.test(name ?? '')) return usage()
  if (await readJson(ws('data', name, 'manifest.json'))) return print(`${name} already exists: choose another name, or trash data/${name} first`), false
  const roles = await readRoles(rel)
  const p = await readJson<TableProfile>(ws(rel, 'profile.json'))
  if (!roles || !p) return print(`${rel}: no roles yet; run data profile ${rel}`), false
  const n = Math.max(50, Math.min(3000, Number(opts.rows ?? 600)))
  const voice = opts.voice
  if (voice && !['plain', 'news', 'caption'].includes(voice)) return print('data questions: --voice is plain, news or caption'), false
  const prep = prepare(got.table, roles)
  const made = makeQuestions(prep, p, { rows: n, seed: Number(opts.seed ?? 0) })
  if (made.length < 20) return print(`only ${made.length} questions could be made: check the roles (a what, a where and a when help most)`), false
  const title = roles.title ?? titleOf(got.raw)
  const system = askSystem(title)
  const rows = made.map((x) => ({ messages: [{ role: 'system', content: system }, { role: 'user', content: x.question }, { role: 'assistant', content: canonical(x.query) }] }))
  const kinds = new Map<string, number>()
  for (const x of made) kinds.set(x.pattern, (kinds.get(x.pattern) ?? 0) + 1)
  const zeros = made.filter((x) => x.result.ok && x.result.kind === 'number' && x.result.value === 0).length
  const m: DatasetManifest = {
    name,
    kind: 'dataset',
    created: new Date().toISOString(),
    license: tableSource(rel, got.raw, 0).license,
    inputs: [`workspace/${rel}`, `workspace/${rel}/roles.json`],
    command: [line],
    format: 'chat',
    counts: { train: rows.length, valid: 0 },
    split: null,
    sources: [tableSource(rel, got.raw, rows.length)],
    about: `Questions about ${title}, each with the query that answers it. A model trained on it writes queries; the answers come from the table.`,
    table: rel,
    ask: { system, title, noun: roles.noun },
  }
  await writeDataset(name, m, rows)
  await fs.writeFile(ws('data', name, 'questions.jsonl'), toJsonl(made.map((x) => ({ question: x.question, query: x.query, pattern: x.pattern, answer: phrase(x.result, x.query, roles) }))))
  print(`${made.length} questions from ${got.table.rows.length.toLocaleString('en-US')} rows · ${zeros} with the answer none`)
  for (const [k, v] of [...kinds].sort((a, b) => b[1] - a[1])) print(`  ${k.padEnd(26)} ${v}`)
  const ex = made.find((x) => x.pattern.startsWith('near')) ?? made[0]
  print(`  e.g. "${ex.question}"`)
  print(`       → ${canonical(ex.query)}`)
  print(`       → ${phrase(ex.result, ex.query, roles)}`)
  print(`  ◂ ${rows.length} rows → workspace/data/${name}/train.jsonl · ${m.license}`)
  if (voice) {
    const vname = `${name}-voice`.slice(0, 64)
    const vrows = made.map((x) => ({ messages: [{ role: 'user', content: `Question: ${x.question}\nResult: ${resultLine(x.result)}` }, { role: 'assistant', content: voiced(voice, x, roles) }] }))
    await writeDataset(vname, { ...m, name: vname, command: [line], counts: { train: vrows.length, valid: 0 }, sources: [tableSource(rel, got.raw, vrows.length)], about: `Results from ${title} said as ${voice === 'plain' ? 'plain sentences' : voice === 'news' ? 'a news brief' : 'captions'}: a voice for answers, trained apart from the queries.`, ask: undefined, voice }, vrows)
    print(`  ◂ ${vrows.length} rows → workspace/data/${vname}/train.jsonl (the voice: ${voice})`)
  }
  return true
}

/**
 * `data rows raw/<table> <dataset> --as csv|sentence`: the rows as they are,
 * for a model that writes more rows like them. What it writes are invented
 * records, never real ones.
 */
async function asRows(rel: string, name: string, opts: Record<string, string>, line: string): Promise<boolean> {
  const got = await loadAll(rel)
  if (!got || !DATASET.test(name ?? '') || !['csv', 'sentence'].includes(opts.as ?? '')) return usage()
  if (await readJson(ws('data', name, 'manifest.json'))) return print(`${name} already exists`), false
  const roles = await readRoles(rel)
  const keep = got.table.columns.map((c, i) => [c, i] as const).filter(([c]) => !roles || !['id', 'other'].includes(roles.columns.find((x) => x.name === c)?.role ?? ''))
  const limit = Math.max(10, Math.min(5000, Number(opts.limit ?? 1000)))
  const step = Math.max(1, Math.floor(got.table.rows.length / limit))
  const pickRows = got.table.rows.filter((_, i) => i % step === 0).slice(0, limit)
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const header = keep.map(([c]) => c).join(',')
  const rows = pickRows.map((r) => ({
    text: opts.as === 'csv' ? `${header}\n${keep.map(([, i]) => cell(r[i] ?? '')).join(',')}` : keep.filter(([, i]) => (r[i] ?? '').trim()).map(([c, i]) => `${roles?.columns.find((x) => x.name === c)?.label ?? c}: ${r[i].trim()}`).join('; ') + '.',
  }))
  const title = titleOf(got.raw)
  const m: DatasetManifest = {
    name,
    kind: 'dataset',
    created: new Date().toISOString(),
    license: tableSource(rel, got.raw, 0).license,
    inputs: [`workspace/${rel}`],
    command: [line],
    format: 'text',
    counts: { train: rows.length, valid: 0 },
    split: null,
    sources: [tableSource(rel, got.raw, rows.length)],
    about: `Rows of ${title} as they are (${opts.as === 'csv' ? 'CSV lines' : 'read out as sentences'}). A model trained on it writes rows that look like these: invented records, never real ones.`,
    table: rel,
  }
  await writeDataset(name, m, rows)
  print(`${rows.length} rows of ${got.table.rows.length.toLocaleString('en-US')}, every ${step === 1 ? '' : `${step}th `}row, ${keep.length} columns (ids left out)`)
  print(`  e.g. ${rows[0].text.replace(/\n/g, ' ⏎ ').slice(0, 160)}`)
  print(`  ◂ workspace/data/${name}/train.jsonl · text · ${m.license}`)
  print('  a model trained on these writes rows that look real and are not: invented records')
  return true
}

export async function tableCommand(sub: string, pos: string[], opts: Record<string, string>, line: string): Promise<boolean> {
  const allowed: Record<string, string[]> = { profile: ['again'], role: ['noun'], words: [], questions: ['rows', 'seed', 'voice'], rows: ['as', 'limit'] }
  const bad = Object.keys(opts).find((k) => !(allowed[sub] ?? []).includes(k))
  if (bad) return print(`data ${sub}: unknown option --${bad}`), false
  if (sub === 'profile') return profile(pos[0], opts)
  if (sub === 'role') return role(pos[0], pos.slice(1), opts)
  if (sub === 'words') return words(pos[0], pos.slice(1))
  if (sub === 'questions') return questions(pos[0], pos[1], opts, line)
  if (sub === 'rows') return asRows(pos[0], pos[1], opts, line)
  return usage()
}

/* ---------- asking ---------- */

const prepared = new Map<string, { at: string; p: Prepared }>()
async function preparedFor(rel: string): Promise<Prepared | null> {
  const table = await readTable(rel)
  const roles = await readRoles(rel)
  if (!table || !roles) return null
  const key = JSON.stringify(roles)
  const hit = prepared.get(rel)
  if (hit && hit.at === key && hit.p.table === table) return hit.p
  const p = prepare(table, roles)
  prepared.set(rel, { at: key, p })
  return p
}

/** One question to a model, which writes the query: temperature 0 and JSON only, as Chat asks it. */
export async function writeQuery(model: string, system: string, question: string, signal?: AbortSignal): Promise<string> {
  const res = await ollamaPost('/api/chat', { model, messages: [{ role: 'system', content: system }, { role: 'user', content: question }], stream: false, format: 'json', options: { temperature: 0, num_predict: 200 } }, signal)
  const body = (await res.json()) as { message?: { content?: string }; error?: string }
  if (body.error) throw new Error(body.error)
  return body.message?.content ?? ''
}

function flags(words: string[]) {
  const pos: string[] = []
  const opts: Record<string, string> = {}
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('--')) opts[words[i].slice(2)] = words[++i] ?? ''
    else pos.push(words[i])
  }
  return { pos, opts }
}

/** `ask <model> raw/<table> "<question>"`, and `ask check <model> <dataset>`. */
export async function askCommand(args: string[]): Promise<boolean> {
  const { pos, opts } = flags(args)
  if (pos[0] === 'check') return check(pos[1], pos[2], opts)
  const [model, rel, ...rest] = pos
  const question = rest.join(' ').trim()
  if (!model || !TABLE.test(rel ?? '') || !question) {
    print('usage: ask <model> raw/<table> "<question>"     the model writes a query; the table answers it\n       ask check <model> <dataset> [--limit 100]   how often its queries are right, on the questions set aside')
    return false
  }
  const p = await preparedFor(rel)
  if (!p) return print(`${rel}: no table or no roles; run data profile ${rel}`), false
  const system = askSystem(p.roles.title ?? rel)
  const abort = new AbortController()
  setRunning({ abort })
  try {
    const text = await writeQuery(model, system, question, abort.signal)
    print(`  query  ${text.trim()}`)
    const parsed = parseQuery(text)
    if ('error' in parsed) return print(`  not a query the runner can read: ${parsed.error}`), false
    const result = runQuery(p, parsed.query, 5)
    if (!result.ok) return print(`  the table can't answer it: ${result.error}`), false
    print(`  SQL    ${toSql(parsed.query, p.roles).replace(/\n/g, '\n         ')}`)
    for (const n of result.notes) print(`  note   ${n}`)
    print(`  rows   ${result.matched.toLocaleString('en-US')} match`)
    print(`  ◂ ${phrase(result, parsed.query, p.roles)}`)
    return true
  } catch (err) {
    print(abort.signal.aborted ? '  ◂ stopped' : `ask: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}

/**
 * `ask check <model> <dataset>`: every question set aside at the split, asked
 * of the model. Counts how many of its queries are JSON, how many the runner
 * can run, how many are written exactly as the dataset's, and how many give
 * the same answer as the dataset's query. Saves each to check-<model>.json.
 */
async function check(model: string, name: string, opts: Record<string, string>): Promise<boolean> {
  const m = DATASET.test(name ?? '') ? await readJson<DatasetManifest>(ws('data', name, 'manifest.json')) : null
  if (!model || !m?.table || !m.ask) return print('usage: ask check <model> <dataset>   (a dataset made by data questions, split, and a model trained on it)'), false
  const p = await preparedFor(m.table)
  if (!p) return print(`${m.table}: no table here; bring it in again`), false
  const valid = (await fs.readFile(ws('data', name, 'valid.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as { messages: { role: string; content: string }[] })
  if (!valid.length) return print(`${name} has no questions set aside: data split ${name}`), false
  const kinds = new Map(((await fs.readFile(ws('data', name, 'questions.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as Made)).map((x) => [x.question, x.pattern]))
  const limit = Math.min(valid.length, Number(opts.limit ?? 100))
  const abort = new AbortController()
  setRunning({ abort })
  const out: { question: string; pattern: string; wrote: string; json: boolean; runs: boolean; exact: boolean; same: boolean; error?: string }[] = []
  try {
    for (const row of valid.slice(0, limit)) {
      const question = row.messages.find((x) => x.role === 'user')!.content
      const gold = JSON.parse(row.messages.find((x) => x.role === 'assistant')!.content) as Query
      const wrote = await writeQuery(model, m.ask.system, question, abort.signal)
      const parsed = parseQuery(wrote)
      const json = !('error' in parsed)
      const got = json ? runQuery(p, parsed.query, 0) : null
      const want = runQuery(p, gold, 0)
      out.push({ question, pattern: kinds.get(question) ?? '?', wrote: wrote.trim(), json, runs: !!got?.ok, exact: json && canonical(parsed.query) === canonical(gold), same: !!got && sameAnswer(got, want), ...(got && !got.ok && { error: got.error }), ...('error' in parsed && { error: parsed.error }) })
      write(`\r\x1b[2K${out.length} of ${limit} · same answer ${out.filter((x) => x.same).length}`)
    }
    write('\n')
  } catch (err) {
    write('\n')
    print(abort.signal.aborted ? '  ◂ stopped' : `ask check: ${(err as Error).message}`)
    if (!out.length) return false
  } finally {
    setRunning(null)
  }
  const pc = (k: keyof (typeof out)[number]) => `${Math.round((out.filter((x) => x[k]).length / out.length) * 100)}%`.padStart(4)
  print(`${model} on ${out.length} questions it never saw (${name}/valid.jsonl):`)
  print(`  ${pc('json')} wrote JSON the runner could read`)
  print(`  ${pc('runs')} ran: real columns and values`)
  print(`  ${pc('exact')} the same query as the dataset's, written exactly`)
  print(`  ${pc('same')} the same answer as the dataset's query  ← the number that matters`)
  const by = new Map<string, typeof out>()
  for (const x of out) by.set(x.pattern, [...(by.get(x.pattern) ?? []), x])
  for (const [k, xs] of [...by].sort()) print(`    ${k.padEnd(26)} ${xs.filter((x) => x.same).length}/${xs.length}`)
  const wrong = out.filter((x) => !x.same).slice(0, 3)
  for (const w of wrong) print(`  ✗ "${w.question}" → ${w.wrote.slice(0, 140)}${w.error ? ` (${w.error.slice(0, 80)})` : ''}`)
  const file = `check-${model.replace(/[^\w.-]/g, '_')}.json`
  await writeJson(ws('data', name, file), { model, dataset: name, at: new Date().toISOString(), n: out.length, json: out.filter((x) => x.json).length, runs: out.filter((x) => x.runs).length, exact: out.filter((x) => x.exact).length, same: out.filter((x) => x.same).length, questions: out })
  print(`  ◂ workspace/data/${name}/${file}`)
  return true
}
