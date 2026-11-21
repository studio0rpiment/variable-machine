import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ROOT, WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { ollamaPost } from './ollama.ts'
import { setRunning } from './run.ts'
import type { DatasetManifest } from './shared/manifest.ts'
import {
  DECISION_SCHEMA,
  FIELDS,
  QUERY_SCHEMA,
  SOURCES,
  SUMMARY_SCHEMA,
  bibtex,
  checkLink,
  checkedClaims,
  cosine,
  dedupe,
  embedQuery,
  embedText,
  fieldsOf,
  followCitations,
  get,
  isBridge,
  judgeInput,
  judgeSystem,
  merge,
  modelRead,
  normTitle,
  parseDecision,
  passages,
  patentNumber,
  plain,
  queryPrompt,
  readFeed,
  resolveSeeds,
  search,
  searchMore,
  searchesMade,
  summaryPrompt,
  whereIn,
  finalOf,
  type Decision,
  type Field,
  type Item,
  type Keys,
  type More,
  type ResearchManifest,
  type Searched,
  type Seen,
} from './shared/research.ts'

/**
 * The research bot (`papers …`): papers, articles, Substack posts, archive
 * texts, newspaper pages and US patents on a topic, in
 * workspace/research/<name>/. Search code finds every item; the model writes
 * the searches, screens and summarises, and never supplies a citation. The
 * student's keep/skip decisions become a dataset for training a point of view.
 *
 *   papers search <name> --topic "…" --seed <doi|arXiv id|url> … [--feed <url>] [--archive] [--newspapers] [--patents us] [--fields a,b]   → library.jsonl, searches.jsonl
 *   papers screen <name> [--embed <model>] [--as second]   similarity to the seeds, then the model: keep or skip, and why
 *   papers decide <name> <key> keep|skip [--reason "…"]   the student's own decision, over the model's
 *   papers add <name> uploads/<file>.pdf    your own copy, read in full
 *   papers summarise <name> [--full-text]   kept items free to read: claims, each with its quote and where it is
 *   papers list <name> [--proxy <prefix>] [--bridges-first]   reading-list.md, references.bib, searches.md; every link checked
 *   papers check <name>                     the model's screen (and a second's) against the student's decisions
 *   papers pool <class> --from <name> --from <name> …   a class: several students' decisions, pooled
 *   papers judge <name> <dataset>           the decisions as a training set (and <dataset>-prefs, where the student overrode)
 *   papers keys                             the file on this Mac that holds your keys
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ws = (...p: string[]) => path.join(WORKSPACE, ...p)
const dir = (name: string, ...p: string[]) => ws('research', name, ...p)
const now = () => new Date().toISOString()
const writeJson = (p: string, v: unknown) => fs.writeFile(p, JSON.stringify(v, null, 2) + '\n')
const readJson = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return null
  }
}

export const WRITER = 'qwen3:4b'
export const EMBED = 'nomic-embed-text'

/* ---------- keys: in a file on this Mac, outside the workspace ---------- */

/**
 * Keys a source gave you live in your Library, not in the workspace, so a zip
 * or a shared folder never carries them. The environment wins over the file.
 * Never a password: a proxy's sign-in is yours, in your browser.
 */
export const KEYS_FILE = path.join(os.homedir(), 'Library', 'Application Support', 'Variable Machine', 'keys.json')
const KEY_NAMES: Record<keyof Keys, string> = {
  openalex: 'OpenAlex: openalex.org/settings/api (more requests a day)',
  semanticScholar: 'Semantic Scholar: semanticscholar.org/product/api (fewer "busy" answers)',
  epoKey: 'EPO Open Patent Services, consumer key: developers.epo.org (not used yet)',
  epoSecret: 'EPO Open Patent Services, consumer secret (not used yet)',
  europeana: 'Europeana: pro.europeana.eu/page/get-api (not used yet)',
}

async function loadKeys(): Promise<Keys> {
  const file = (await readJson<Keys>(KEYS_FILE)) ?? {}
  return {
    ...file,
    ...(process.env.OPENALEX_API_KEY && { openalex: process.env.OPENALEX_API_KEY }),
    ...(process.env.SEMANTIC_SCHOLAR_API_KEY && { semanticScholar: process.env.SEMANTIC_SCHOLAR_API_KEY }),
  }
}

async function keysCommand(): Promise<boolean> {
  const had = await readJson<Keys>(KEYS_FILE)
  if (!had) {
    await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true })
    await fs.writeFile(KEYS_FILE, JSON.stringify(Object.fromEntries(Object.keys(KEY_NAMES).map((k) => [k, ''])), null, 2) + '\n', { mode: 0o600 })
  }
  const keys = await loadKeys()
  print(`  your keys: ${KEYS_FILE}${had ? '' : ' (made now, empty)'}`)
  print('  open it in a text editor and paste each key between its quotation marks; only you can read the file')
  for (const [k, about] of Object.entries(KEY_NAMES)) print(`    ${keys[k as keyof Keys] ? '✓' : '·'} ${k.padEnd(16)} ${about}`)
  print('  the file is outside the workspace, so zips and shared folders never carry it; keys are never written into a research folder')
  return true
}

const readLibrary = async (name: string): Promise<Seen[]> =>
  (await fs.readFile(dir(name, 'library.jsonl'), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Seen)
const writeLibrary = (name: string, items: Seen[]) => fs.writeFile(dir(name, 'library.jsonl'), items.map((x) => JSON.stringify(x)).join('\n') + '\n')
const readScreen = async (name: string) => (await readJson<Record<string, Decision>>(dir(name, 'screen.json'))) ?? {}
const readSearches = async (name: string): Promise<(Searched & { run?: number })[]> =>
  (await fs.readFile(dir(name, 'searches.jsonl'), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Searched)

/** A key as a file name: doi:10.1145/… → doi_10.1145_… */
const safe = (key: string) => key.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)

/** Words after a repeatable flag: --seed a --seed b → [a, b]. */
function flags(words: string[]) {
  const pos: string[] = []
  const opts: Record<string, string[]> = {}
  for (let i = 0; i < words.length; i++) {
    if (!words[i].startsWith('--')) {
      pos.push(words[i])
      continue
    }
    // a flag with no value (--again) takes none
    const takes = words[i + 1] !== undefined && !words[i + 1].startsWith('--')
    ;(opts[words[i].slice(2)] ??= []).push(takes ? words[++i] : '')
  }
  return { pos, opts, one: (k: string) => opts[k]?.at(-1) }
}

/** A model asked for JSON in the shape given; think is off, and the schema keeps the answer clean. */
async function askJson<T>(model: string, system: string | null, prompt: string, schema: unknown, signal: AbortSignal, temperature = 0): Promise<T> {
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }]
  const res = await ollamaPost('/api/chat', { model, messages, stream: false, think: false, format: schema, options: { temperature, num_predict: 400 } }, signal)
  const body = (await res.json()) as { message?: { content?: string }; error?: string }
  if (body.error) throw new Error(`${model}: ${body.error}`)
  return JSON.parse(body.message?.content ?? '{}') as T
}

async function hasModel(model: string) {
  const res = await ollamaPost('/api/show', { model }).catch(() => null)
  return !!res?.ok
}

async function embed(model: string, texts: string[], signal: AbortSignal): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 32) {
    const res = await ollamaPost('/api/embed', { model, input: texts.slice(i, i + 32) }, signal)
    const body = (await res.json()) as { embeddings?: number[][]; error?: string }
    if (body.error || !body.embeddings) throw new Error(`${model}: ${body.error ?? 'no embeddings'}`)
    out.push(...body.embeddings)
  }
  return out
}

/** Run a job that ctrl-c can stop. */
async function stoppable(job: (signal: AbortSignal) => Promise<boolean>): Promise<boolean> {
  const abort = new AbortController()
  setRunning({ abort })
  try {
    return await job(abort.signal)
  } catch (err) {
    print(abort.signal.aborted ? '  stopped' : `papers: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}

const recordLine = async (name: string, line: string) => {
  const rec = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!rec) return
  if (rec.command.at(-1) !== line) rec.command.push(line)
  await writeJson(dir(name, 'manifest.json'), rec)
}

/* ---------- search ---------- */

const MORE: More[] = ['archive', 'newspapers', 'patents']

async function searchCommand(name: string, f: ReturnType<typeof flags>, line: string): Promise<boolean> {
  const old = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (old?.pooled) return print(`papers search: ${name} is a class's pool (papers pool); search each student's own folder, then pool again`), false
  const topic = f.one('topic') ?? old?.topic ?? ''
  const seeds = f.opts.seed ?? old?.seeds ?? []
  const feeds = f.opts.feed ?? old?.feeds ?? []
  const n = Math.max(3, Math.min(12, Number(f.one('queries') ?? 8)))
  const per = Math.max(3, Math.min(25, Number(f.one('per') ?? 10)))
  const model = f.one('model') ?? WRITER
  // the other sources: each its own flag, remembered for the next run
  const given = MORE.filter((s) => s in f.opts)
  const patentsAsked = f.one('patents')
  const more = given.length ? given : (old?.more as More[] | undefined) ?? []
  const patents = [...new Set([...(f.opts.patent ?? []).map(patentNumber).filter((x): x is string => !!x), ...(old?.patents ?? [])])]
  const fieldsAsked = f.one('fields')
  const fields = fieldsAsked !== undefined ? (fieldsAsked.split(',').map((x) => x.trim()) as Field[]) : (old?.fields ?? [])
  const badField = fields.find((x) => !FIELDS.includes(x))
  if (!topic.trim() || (!old && seeds.length < 2) || seeds.length > 5 || badField || (patentsAsked !== undefined && patentsAsked !== 'us') || (f.opts.patent ?? []).some((p) => !patentNumber(p))) {
    if (badField) print(`papers search: ${badField} isn't a field; the fields are ${FIELDS.join(', ')}`)
    if (patentsAsked !== undefined && patentsAsked !== 'us') print('papers search: --patents us is the one there is; EPO (British, German and other patents) needs a key and is not built yet')
    print('usage: papers search <name> --topic "<topic>" --seed <doi|arXiv id|address> --seed … (2 to 5 seeds) [--feed <address>]… [--archive] [--newspapers] [--patents us] [--patent <number>]… [--fields humanities,sciences,technology] [--queries 8] [--per 10]')
    print('  a seed is a paper or article you already know is relevant: a DOI (10.1145/…), an arXiv id (2504.07879), or its web address')
    print('  a feed is a Substack or a blog by its feed address: name.substack.com/feed')
    print("  --archive: the Internet Archive's catalogue and its full text · --newspapers: the Library of Congress, 1756–1963 · --patents us: US patents by number, read from what those find, and any --patent US661619")
    return false
  }
  if (patentsAsked !== undefined) more.includes('patents') || more.push('patents')
  if (patents.length && !more.includes('patents')) more.push('patents')
  const keys = await loadKeys()
  return stoppable(async (signal) => {
    await fs.mkdir(dir(name), { recursive: true })
    const run = (old?.runs.length ?? 0) + 1
    const log: Searched[] = []
    print(`  the seeds, through OpenAlex`)
    const { seeds: got, works } = await resolveSeeds(seeds, keys)
    for (const s of got) print(s.item ? `    ✓ ${s.item.title}${s.item.year ? ` (${s.item.year})` : ''}` : `    ✗ ${s.given}: ${s.problem}`)
    const known = got.flatMap((s) => (s.item ? [s.item] : []))
    if (!known.length) return print('papers: none of the seeds could be read; give a DOI, an arXiv id or a web address'), false
    await writeJson(dir(name, 'seeds.json'), got)

    // the model writes the searches: for each field when fields are chosen, each search then marked with its field; kept on a rerun, unless --queries or --fields asks for new ones
    let queries = old?.queries ?? []
    let queryFields = old?.queryFields
    const sameFields = (old?.fields ?? []).join(',') === fields.join(',')
    if (!queries.length || f.opts.queries || !sameFields) {
      queries = []
      queryFields = fields.length ? {} : undefined
      for (const field of fields.length ? fields : [undefined]) {
        const k = field ? Math.max(3, Math.ceil(n / fields.length)) : n
        print(`  ${model} writes ${k} searches${field ? ` for ${field}` : ''}   (ollama, think off, JSON: {"queries": […]})`)
        const out = await askJson<{ queries?: string[] }>(model, null, queryPrompt(topic, known, k, field), QUERY_SCHEMA, signal, 0.3)
        const qs = [...new Set((out.queries ?? []).map((q) => q.replace(/["“”]/g, '').trim()).filter((q) => q.length > 2 && !queries.includes(q)))].slice(0, k)
        queries.push(...qs)
        if (field) for (const q of qs) queryFields![q] = field
      }
      if (!queries.length) return print(`papers: ${model} wrote no searches; run it again`), false
    }
    for (const q of queries) print(`    · ${q}${queryFields?.[q] ? `   (${queryFields[q]})` : ''}`)

    const found: Item[] = []
    const failed = new Set<string>()
    for (const source of SOURCES) {
      let count = 0
      for (const q of queries) {
        if (signal.aborted) throw new Error('stopped')
        searchesMade.splice(0)
        try {
          const xs = await search(source, q, per, keys)
          const h = searchesMade.splice(0)[0]
          log.push({ ...h, source, search: q, at: h?.at ?? now(), found: xs.length })
          found.push(...xs)
          count += xs.length
        } catch (err) {
          log.push({ source, search: q, at: now(), found: 0, error: (err as Error).message })
          print(`    ${source}: ${(err as Error).message}; the rest of its searches are skipped`)
          failed.add(source)
          break
        }
      }
      print(`  ${source.padEnd(17)} ${count} found`)
    }
    for (const url of feeds) {
      try {
        const xs = await readFeed(url)
        found.push(...xs)
        log.push({ source: 'feed', search: 'every post', address: url, at: now(), found: xs.length })
        print(`  feed              ${xs.length} posts · ${url}`)
      } catch (err) {
        log.push({ source: 'feed', search: 'every post', address: url, at: now(), found: 0, error: (err as Error).message })
        print(`  feed ${url}: ${(err as Error).message}`)
      }
    }
    try {
      const cites = await followCitations(works, per * 2, keys)
      found.push(...cites)
      log.push({ source: 'openalex', search: "the seeds' references and citations", at: now(), found: cites.length })
      print(`  citations         ${cites.length}, both ways from ${works.length} seed${works.length === 1 ? '' : 's'} (OpenAlex)`)
    } catch (err) {
      print(`  citations: ${(err as Error).message}`)
    }
    if (more.length) found.push(...(await searchMore(more, queries, per, { patents, say: print, stopped: () => signal.aborted, log })))

    // remove duplicates (DOI, arXiv id, patent number, or the title once normalised), the seeds themselves, and what the library has seen
    const seedKeys = new Set(known.map((k) => k.key))
    const items = dedupe(found).filter((x) => !seedKeys.has(x.key))
    const library = await readLibrary(name)
    const byKey = new Map(library.map((x) => [x.key, x]))
    let added = 0
    for (const x of items) {
      const had = byKey.get(x.key)
      if (had) byKey.set(x.key, merge({ ...had }, x))
      else (byKey.set(x.key, { ...x, first: now(), run }), added++)
    }
    await writeLibrary(name, [...byKey.values()])
    // the file of the searches: every one, its address (keys taken out), its date and what it found
    await fs.appendFile(dir(name, 'searches.jsonl'), log.map((l) => JSON.stringify({ run, ...l })).join('\n') + '\n')
    const all = [...byKey.values()]
    const bridges = all.filter(isBridge).length
    print(`  ${found.length} found · ${items.length} once duplicates are removed · ${added} new${run > 1 ? ` since run ${run - 1}` : ''}`)
    if (fields.length) print(`  fields, from the sources' labels: ${FIELDS.map((x) => `${x} ${all.filter((i) => i.fields?.includes(x)).length}`).join(' · ')} · bridges ${bridges} · unlabelled ${all.filter((i) => !i.fields?.length).length}`)
    const m: ResearchManifest = {
      ...(old ?? {}),
      name,
      kind: 'research',
      created: old?.created ?? now(),
      license: 'metadata: OpenAlex CC0, Crossref, arXiv, Semantic Scholar terms; Internet Archive and Library of Congress items as each states; patent texts are public; abstracts and passages belong to their authors and publishers',
      inputs: [...seeds, ...feeds],
      command: [...(old?.command ?? []), line],
      topic,
      seeds,
      feeds,
      queries,
      ...(queryFields && { queryFields }),
      ...(fields.length ? { fields } : { fields: undefined }),
      ...(more.length && { more }),
      ...(patents.length && { patents }),
      runs: [...(old?.runs ?? []), { at: now(), found: items.length, added }],
    }
    await writeJson(dir(name, 'manifest.json'), m)
    print(`  ◂ workspace/research/${name}/library.jsonl, searches.jsonl · next: papers screen ${name}`)
    if (failed.size) print(`  (${[...failed].join(', ')} answered with an error this time; the other sources were searched)`)
    return true
  })
}

/* ---------- screen ---------- */

const cacheFile = (name: string, model: string) => dir(name, model === EMBED ? 'embeddings.json' : `embeddings-${safe(model)}.json`)

async function screenCommand(name: string, f: ReturnType<typeof flags>, line: string): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!m) return print(`papers: no research called ${name}; papers search ${name} first`), false
  const model = f.one('model') ?? WRITER
  const top = Math.max(1, Math.min(400, Number(f.one('top') ?? 40)))
  const again = 'again' in f.opts
  const as = f.one('as')
  if (as !== undefined && as !== 'second') return print('usage: papers screen <name> --as second --model <another model>   (a second screener reads the items the first one read)'), false
  const ranker = f.one('embed') ?? m.embed ?? EMBED
  if (!(await hasModel(ranker))) return print(`papers screen needs ${ranker}, the model that compares texts: ollama pull ${ranker}`), false
  if (!(await hasModel(model))) return print(`papers screen needs ${model}: ollama pull ${model}`), false

  // a second screener: the same items the first one read, so the two can be compared item by item
  if (as === 'second') {
    return stoppable(async (signal) => {
      const library = await readLibrary(name)
      const screen = await readScreen(name)
      const read = library.filter((x) => modelRead(screen[x.key]) && (again || !screen[x.key].second))
      if (!read.length) return print(`papers screen --as second: ${library.some((x) => screen[x.key]?.second) ? 'the second screener has read every item already (--again to read them again)' : `no item has been read by a first screener yet; papers screen ${name} first`}`), false
      const first = screen[read[0].key].screen!.by
      if (first === model) print(`  (the second screener is the same model as the first, ${model}: the two will agree on almost everything; choose another with --model)`)
      print(`  ${model}, the second screener, reads the ${read.length} items ${first} read: keep or skip, and why`)
      let differ = 0
      for (const [i, x] of read.entries()) {
        if (signal.aborted) throw new Error('stopped')
        const out = await askJson<{ decision?: string; reason?: string }>(model, judgeSystem(m.topic), judgeInput(x), DECISION_SCHEMA, signal)
        const d = parseDecision(JSON.stringify(out)) ?? { decision: 'skip' as const, reason: '(the model gave no decision)' }
        screen[x.key].second = { ...d, by: model }
        const other = screen[x.key].screen!.decision
        if (other !== d.decision) differ++
        print(`    ${String(i + 1).padStart(3)} ${d.decision}${other !== d.decision ? ` (${first}: ${other})` : ''} ${x.title.slice(0, 64)}${x.title.length > 64 ? '…' : ''}`)
        if ((i + 1) % 5 === 0) await writeJson(dir(name, 'screen.json'), screen)
      }
      await writeJson(dir(name, 'screen.json'), screen)
      await recordLine(name, line)
      print(`  ◂ the two screeners differ on ${differ} of ${read.length} · decide those yourself, then papers check ${name}`)
      return true
    })
  }

  return stoppable(async (signal) => {
    const library = await readLibrary(name)
    const screen = await readScreen(name)
    const seeds = ((await readJson<{ item: Item | null }[]>(dir(name, 'seeds.json'))) ?? []).flatMap((s) => (s.item ? [s.item] : []))
    // similarity: each item against the seeds and the topic, averaged into one point
    const cache = (await readJson<Record<string, number[]>>(cacheFile(name, ranker))) ?? {}
    const want = library.filter((x) => !cache[x.key])
    print(`  ${ranker} compares ${library.length} items with the ${seeds.length} seeds and the topic${want.length < library.length ? ` (${library.length - want.length} already compared)` : ''}`)
    const vs = await embed(
      ranker,
      want.map((x) => embedText(x, ranker)),
      signal,
    )
    want.forEach((x, k) => (cache[x.key] = vs[k]))
    await writeJson(cacheFile(name, ranker), cache)
    const anchors = await embed(ranker, [embedQuery(m.topic, ranker), ...seeds.map((s) => embedText(s, ranker))], signal)
    const centre = anchors[0].map((_, i) => anchors.reduce((s, v) => s + v[i], 0) / anchors.length)
    for (const x of library) (screen[x.key] ??= {}).sim = Math.round(cosine(cache[x.key], centre) * 1000) / 1000

    // the model screens the closest; with fields, each field has its own share of them (by the sources' labels), and the rest go to the closest of any
    const todo = library.filter((x) => again || !screen[x.key].screen || screen[x.key].screen!.similarity || /embed/i.test(screen[x.key].screen!.by)).sort((a, b) => screen[b.key].sim! - screen[a.key].sim!)
    const chosen = new Set<string>()
    const fields = m.fields ?? []
    if (fields.length) {
      const share = Math.floor(top / fields.length)
      for (const field of fields) {
        const mine = todo.filter((x) => x.fields?.includes(field) && !chosen.has(x.key)).slice(0, share)
        for (const x of mine) (chosen.add(x.key), (screen[x.key].readFor = field))
        print(`  ${field}: ${mine.length} of its ${share} places filled (the closest labelled ${field})`)
      }
    }
    for (const x of todo) {
      if (chosen.size >= top) break
      if (!chosen.has(x.key)) (chosen.add(x.key), delete screen[x.key].readFor)
    }
    const judged = todo.filter((x) => chosen.has(x.key))
    const rest = todo.filter((x) => !chosen.has(x.key))
    const cut = judged.length ? Math.min(...judged.map((x) => screen[x.key].sim!)) : 1
    print(`  ${model} screens ${judged.length}${fields.length ? '' : ' closest'}: keep or skip, and why   (ollama, think off, JSON: {"decision", "reason"})`)
    let kept = 0
    for (const [i, x] of judged.entries()) {
      if (signal.aborted) throw new Error('stopped')
      const out = await askJson<{ decision?: string; reason?: string }>(model, judgeSystem(m.topic), judgeInput(x), DECISION_SCHEMA, signal)
      const d = parseDecision(JSON.stringify(out)) ?? { decision: 'skip' as const, reason: '(the model gave no decision)' }
      screen[x.key].screen = { ...d, by: model }
      if (d.decision === 'keep') kept++
      print(`    ${String(i + 1).padStart(3)} ${d.decision} ${screen[x.key].sim!.toFixed(2)} ${x.title.slice(0, 70)}${x.title.length > 70 ? '…' : ''}`)
      if ((i + 1) % 5 === 0) await writeJson(dir(name, 'screen.json'), screen)
    }
    for (const x of rest) screen[x.key].screen = { decision: 'skip', reason: `far from the seeds: similarity ${screen[x.key].sim!.toFixed(2)}, ${fields.length ? `not among the ${top} the model read (each field's closest, then the closest of any)` : `below the ${cut.toFixed(2)} of the ${top} the model read`}`, by: ranker, similarity: true }
    await writeJson(dir(name, 'screen.json'), screen)
    const rec = (await readJson<ResearchManifest>(dir(name, 'manifest.json')))!
    if (rec.command.at(-1) !== line) rec.command.push(line)
    if (ranker !== EMBED) rec.embed = ranker
    else delete rec.embed
    await writeJson(dir(name, 'manifest.json'), rec)
    print(`  ◂ ${kept} kept, ${judged.length - kept} skipped by ${model}; ${rest.length} skipped by similarity · change any you disagree with, then papers list ${name}`)
    return true
  })
}

/* ---------- the student's decisions ---------- */

async function decideCommand(name: string, key: string, decision: string, reason: string | undefined): Promise<boolean> {
  if (decision !== 'keep' && decision !== 'skip' && decision !== 'undo') return print('usage: papers decide <name> <key> keep|skip|undo [--reason "…"]'), false
  const library = await readLibrary(name)
  const x = library.find((i) => i.key === key)
  if (!x) return print(`papers: ${name} has no item ${key}`), false
  const screen = await readScreen(name)
  const d = (screen[key] ??= {})
  if (decision === 'undo') delete d.student
  else d.student = { decision, ...(reason?.trim() && { reason: reason.trim() }), at: now() }
  await writeJson(dir(name, 'screen.json'), screen)
  const was = d.screen ? ` (the screen said ${d.screen.decision})` : ''
  print(`  ◂ ${decision === 'undo' ? `back to the screen's ${d.screen?.decision ?? 'nothing'}` : decision}${decision === 'undo' ? '' : was}: ${x.title.slice(0, 80)}`)
  return true
}

/* ---------- your own copies: PDFs, read in full ---------- */

/** A PDF's text, page by page: pypdf, in a throwaway environment uv keeps in its cache (nothing installed in the project). */
export function pdfPages(file: string): Promise<{ title: string; author: string; pages: string[] }> {
  return new Promise((resolve, reject) =>
    execFile('uv', ['run', '--no-project', '--quiet', '--with', 'pypdf>=5', 'python', path.join(ROOT, 'python', 'variable_machine', 'pdf_text.py'), file], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, timeout: 300_000 }, (err, out, errOut) => {
      if (err) return reject(new Error(`reading the PDF: ${(errOut || err.message).trim().split('\n').at(-1)}`))
      try {
        resolve(JSON.parse(out))
      } catch {
        reject(new Error('reading the PDF: no text came back'))
      }
    }),
  )
}

const DOI_IN = /\b(10\.\d{4,9}\/[^\s"<>,;]+[^\s"<>,;.)\]])/

async function addCommand(name: string, file: string, f: ReturnType<typeof flags>, line: string): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!m) return print(`papers: no research called ${name}; papers search ${name} first`), false
  const rel = file.replace(/^workspace\//, '')
  if (!/^uploads\/[^/]+\.pdf$/i.test(rel)) return print('usage: papers add <name> uploads/<file>.pdf [--title "…"]   (drop the PDF on the Files tab first: it goes to workspace/uploads)'), false
  const abs = ws(rel)
  if (!(await fs.stat(abs).catch(() => null))) return print(`papers add: workspace/${rel} isn't there`), false
  return stoppable(async () => {
    print(`  reading workspace/${rel}, every page   (pypdf, through uv)`)
    const pdf = await pdfPages(abs)
    const text = pdf.pages.join('\n')
    if (text.replace(/\s/g, '').length < 200) return print('papers add: the PDF has almost no text in it (a scan without a text layer?); nothing was added'), false
    // what it is: its DOI if the first pages give one, then OpenAlex's record of it
    const doi = DOI_IN.exec(pdf.pages.slice(0, 2).join('\n'))?.[1]?.toLowerCase()
    const keys = await loadKeys()
    const known = doi ? (await resolveSeeds([doi], keys)).seeds[0]?.item : null
    const firstLine = pdf.pages[0].split('\n').map((l) => l.trim()).find((l) => l.length > 8) ?? path.basename(rel, '.pdf')
    const title = f.one('title') ?? known?.title ?? (pdf.title.trim() || firstLine)
    const abstract = /abstract[\s.:—-]*([\s\S]{80,1500}?)(?:\n\s*\n|introduction|keywords)/i.exec(text)?.[1] ?? text.slice(0, 1500)
    const mine: Item = {
      ...(known ?? {}),
      key: known?.key ?? (doi ? `doi:${doi}` : `t:${normTitle(title)}`),
      title,
      abstract: known?.abstract || plain(abstract),
      authors: known?.authors.length ? known.authors : pdf.author ? pdf.author.split(/[,;]| and /).map((a) => a.trim()).filter(Boolean) : [],
      url: known?.url ?? (doi ? `https://doi.org/${doi}` : `workspace/${rel}`),
      ...(doi && { doi }),
      kind: 'paper',
      sources: [...(known?.sources ?? []), 'your pdf'],
      found: [`your own copy: workspace/${rel}`],
      hits: [{ source: 'your pdf', search: 'papers add', address: `workspace/${rel}`, at: now() }],
      local: `workspace/${rel}`,
    }
    mine.fields = mine.labels ? fieldsOf(mine.labels) : undefined
    await fs.mkdir(dir(name, 'texts'), { recursive: true })
    await writeJson(dir(name, 'texts', `${safe(mine.key)}.json`), { from: `workspace/${rel}`, pages: pdf.pages })
    const library = await readLibrary(name)
    const had = library.find((x) => x.key === mine.key || normTitle(x.title) === normTitle(mine.title))
    if (had) merge(had, mine)
    else library.push({ ...mine, first: now(), run: m.runs.length })
    await writeLibrary(name, library)
    await recordLine(name, line)
    print(`  ${pdf.pages.length} pages · ${doi ? `DOI ${doi}${known ? ', and OpenAlex knows it' : ''}` : 'no DOI found in its first pages: the reading list links it by its file only'}`)
    print(`  ◂ ${had ? 'joined to the item the library had' : 'added to the library'}: ${title.slice(0, 80)} · its key: ${mine.key}`)
    print(`  papers screen ${name} reads it with the rest; papers summarise ${name} --full-text reads every page`)
    return true
  })
}

/* ---------- summaries ---------- */

/** The full text of an item, as pages: your own copy, an archive text, a patent, or the free copy (a PDF or a page); never through a proxy. */
async function fullText(name: string, x: Item): Promise<{ pages: string[]; from: string } | null> {
  const cached = await readJson<{ pages: string[]; from: string }>(dir(name, 'texts', `${safe(x.key)}.json`))
  if (cached) return cached
  let got: { pages: string[]; from: string } | null = null
  if (x.archive) {
    const url = `https://archive.org/download/${x.archive}/${x.archive}_djvu.txt`
    const res = await get(url, {}, true, 60_000)
    if (res.ok) got = { pages: (await res.text()).split('\f'), from: `the Internet Archive's text of the scan: ${url}` }
  } else if (x.patent) {
    const res = await get(x.url)
    if (res.ok) {
      const html = await res.text()
      const part = (k: string) => plain(new RegExp(`<section itemprop="${k}"[^>]*>([\\s\\S]*?)</section>`).exec(html)?.[1] ?? '')
      got = { pages: [part('description'), part('claims')].filter(Boolean), from: `Google Patents' OCR of the patent: ${x.url}` }
    }
  } else if (x.oa && /^https?:/.test(x.oa)) {
    const res = await get(x.oa, {}, true, 60_000)
    if (res.ok) {
      const type = res.headers.get('content-type') ?? ''
      if (type.includes('pdf') || /\.pdf($|\?)/i.test(x.oa)) {
        await fs.mkdir(dir(name, 'texts'), { recursive: true })
        const file = dir(name, 'texts', `${safe(x.key)}.pdf`)
        await fs.writeFile(file, Buffer.from(await res.arrayBuffer()))
        got = { pages: (await pdfPages(file)).pages, from: `the free copy (PDF): ${x.oa}` }
      } else if (type.includes('html') || type.includes('text')) got = { pages: [plain((await res.text()).replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, ' '))], from: `the free copy (web page): ${x.oa}` }
    }
  }
  if (got && got.pages.join('').replace(/\s/g, '').length > 300) {
    await fs.mkdir(dir(name, 'texts'), { recursive: true })
    await writeJson(dir(name, 'texts', `${safe(x.key)}.json`), got)
    return got
  }
  return null
}

async function summariseCommand(name: string, f: ReturnType<typeof flags>, line: string): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!m) return print(`papers: no research called ${name}`), false
  const model = f.one('model') ?? WRITER
  const full = 'full-text' in f.opts
  const ranker = m.embed ?? EMBED
  if (!(await hasModel(model))) return print(`papers summarise needs ${model}: ollama pull ${model}`), false
  if (full && !(await hasModel(ranker))) return print(`papers summarise --full-text needs ${ranker}, to find the passages closest to the topic: ollama pull ${ranker}`), false
  return stoppable(async (signal) => {
    const library = await readLibrary(name)
    const screen = await readScreen(name)
    const kept = library.filter((x) => finalOf(screen[x.key]) === 'keep')
    const again = 'again' in f.opts
    if (!full) {
      // free to read and kept: the summary is of the abstract the source gave (no paywalled full text)
      const todo = kept.filter((x) => x.oa && x.abstract.length > 80 && (again || !screen[x.key].summary))
      const closed = kept.filter((x) => !x.oa).length
      print(`  ${model} summarises ${todo.length} kept item${todo.length === 1 ? '' : 's'} that are free to read, from their abstracts; every claim must quote the text${closed ? ` (${closed} kept but not free to read: no summary)` : ''}`)
      let dropped = 0
      for (const x of todo) {
        if (signal.aborted) throw new Error('stopped')
        const out = await askJson<{ claims?: { claim: string; quote: string }[] }>(model, null, summaryPrompt(m.topic, x), SUMMARY_SCHEMA, signal)
        const claims = out.claims ?? []
        const ok = checkedClaims(claims, x.abstract)
        dropped += claims.length - ok.length
        const from = `${x.kind === 'book' || x.kind === 'newspaper' ? 'the passages found' : x.kind === 'patent' ? "the start of the patent's text" : 'abstract'}, via ${x.sources[0]}: ${x.url}`
        screen[x.key].summary = ok.map((c) => ({ claim: c.claim.trim(), quote: c.quote.trim(), from }))
        print(`    ${ok.length}/${claims.length} claims quote the text · ${x.title.slice(0, 70)}`)
      }
      await writeJson(dir(name, 'screen.json'), screen)
      await recordLine(name, line)
      print(`  ◂ ${dropped} claim${dropped === 1 ? '' : 's'} left out because the quote isn't in the text · next: papers list ${name}`)
      return true
    }

    // the full text: your copy, the archive's text, the patent, or the free copy; the passages closest to the topic are what the model reads
    const todo = kept.filter((x) => again || !screen[x.key].summary?.some((c) => /full text|page|characters/.test(c.from)))
    print(`  ${model} summarises ${todo.length} kept item${todo.length === 1 ? '' : 's'} from their full text where there is one free to read (or your own copy); every claim must quote the text, and says where`)
    const [topicVec] = await embed(ranker, [embedQuery(m.topic, ranker)], signal)
    let dropped = 0
    let none = 0
    for (const x of todo) {
      if (signal.aborted) throw new Error('stopped')
      const t = await fullText(name, x).catch(() => null)
      if (!t) {
        none++
        print(`    no full text free to read · ${x.title.slice(0, 70)}${x.oa ? '' : ' (add your copy: papers add)'}`)
        continue
      }
      const ps = passages(t.pages)
      const vecs = await embed(
        ranker,
        ps.map((p) => embedText({ title: x.title, abstract: p.text }, ranker)),
        signal,
      )
      const best = ps
        .map((p, i) => ({ ...p, s: cosine(vecs[i], topicVec) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
        .sort((a, b) => ps.indexOf(a) - ps.indexOf(b))
      const text = best.map((p) => `[${p.where}] ${p.text}`).join('\n\n')
      const out = await askJson<{ claims?: { claim: string; quote: string }[] }>(model, null, summaryPrompt(m.topic, x, text), SUMMARY_SCHEMA, signal)
      const claims = out.claims ?? []
      const ok = checkedClaims(claims, best.map((p) => p.text).join(' '))
      dropped += claims.length - ok.length
      screen[x.key].summary = ok.map((c) => ({ claim: c.claim.trim(), quote: c.quote.trim(), from: `${whereIn(c.quote, best) ?? 'the full text'} of ${t.from}` }))
      print(`    ${ok.length}/${claims.length} claims quote the full text (${t.pages.length} page${t.pages.length === 1 ? '' : 's'}, the ${best.length} passages closest to the topic) · ${x.title.slice(0, 60)}`)
      await writeJson(dir(name, 'screen.json'), screen)
    }
    await writeJson(dir(name, 'screen.json'), screen)
    await recordLine(name, line)
    print(`  ◂ ${dropped} claim${dropped === 1 ? '' : 's'} left out because the quote isn't in the text; ${none} with no full text free to read · next: papers list ${name}`)
    return true
  })
}

/* ---------- the reading list, BibTeX and the searches, every item verifiable ---------- */

const linkWords = (status: number) => (status >= 200 && status < 400 ? `works (${status})` : status === 403 || status === 401 || status === 503 ? `answered ${status}: the site refuses scripts, or is busy; open it in your browser to check` : status ? `answered ${status}` : 'gave no answer')

async function listCommand(name: string, f: ReturnType<typeof flags>, line: string): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!m) return print(`papers: no research called ${name}`), false
  const proxyAsked = f.one('proxy')
  if (proxyAsked !== undefined && proxyAsked !== 'none' && !/^https:\/\/\S+$/.test(proxyAsked)) return print('papers list: --proxy takes your library\'s prefix, as https://login.proxy.example.edu/login?url= (or --proxy none to stop)'), false
  const proxy = proxyAsked === 'none' ? undefined : (proxyAsked ?? m.proxy)
  const bridgesFirst = 'bridges-first' in f.opts
  const library = await readLibrary(name)
  const screen = await readScreen(name)
  const kept = library
    .filter((x) => finalOf(screen[x.key]) === 'keep')
    .sort((a, b) => (bridgesFirst ? Number(isBridge(b)) - Number(isBridge(a)) : 0) || (screen[b.key].sim ?? 0) - (screen[a.key].sim ?? 0))
  const last = m.runs.length
  const day = now().slice(0, 10)
  const searches = await readSearches(name)
  return stoppable(async () => {
    // every link checked, now, from outside Variable Machine's own pages
    print(`  checking ${kept.length} link${kept.length === 1 ? '' : 's'}…`)
    const todo = kept.filter((x) => /^https?:/.test(x.url))
    // six at a time, except the Library of Congress's pages, one at a time at its pace
    const loc = todo.filter((x) => /loc\.gov\//.test(x.url))
    for (const x of loc) screen[x.key].link = { url: x.url, status: await checkLink(x.url), at: now() }
    const others = todo.filter((x) => !loc.includes(x))
    for (let i = 0; i < others.length; i += 6)
      await Promise.all(
        others.slice(i, i + 6).map(async (x) => {
          screen[x.key].link = { url: x.url, status: await checkLink(x.url), at: now() }
        }),
      )
    const broken = todo.filter((x) => !(screen[x.key].link!.status >= 200 && screen[x.key].link!.status < 400))
    const pool = m.pooled
    const decidedBy = (d: Decision) => {
      if (pool && d.students) {
        const ks = Object.values(d.students)
        return `the class: ${ks.filter((k) => k === 'keep').length} of ${ks.length} who decided kept it (${Object.entries(d.students).map(([s, k]) => `${s} ${k}`).join(', ')})`
      }
      if (d.student) return d.screen && d.student.decision !== d.screen.decision ? `you, over the screener (${d.screen.by} said ${d.screen.decision})` : `you${d.screen ? `, agreeing with the screener (${d.screen.by})` : ''}`
      return d.screen ? `the screener, ${d.screen.by}; you left it` : 'no one yet'
    }
    const md = [
      `# Reading list: ${m.topic}`,
      '',
      `${kept.length} kept of ${library.length} seen, from ${m.runs.length} run${m.runs.length === 1 ? '' : 's'} (the last on ${m.runs.at(-1)?.at.slice(0, 10)}). Every item was found by search code (${[...new Set(library.flatMap((x) => x.sources))].join(', ')}); a model wrote the searches, screened, and wrote any summaries. No model named an item.`,
      '',
      `**To check any item outside Variable Machine:** each has a link (checked on ${day}), the source and the search that found it (its address and date), words from its own text with where they are, and who decided to keep it. Every search is in searches.md.${broken.length ? ` ${broken.length} link${broken.length === 1 ? '' : 's'} didn't work for a script; see each.` : ''}`,
      ...(proxy ? ['', `**Through your library:** each paper not free to read has a second link through your library's proxy (${proxy}); you sign in yourself, in your browser. Variable Machine never fetches through it.`] : []),
      ...(m.fields?.length ? ['', `**Fields**, from the sources' own labels: ${FIELDS.map((x) => `${x} ${kept.filter((i) => i.fields?.includes(x)).length}`).join(' · ')} · bridges (two or more fields) ${kept.filter(isBridge).length}${bridgesFirst ? ', listed first' : ''}.`] : []),
      '',
      ...kept.flatMap((x) => {
        const d = screen[x.key]
        const overrode = d.student && d.student.decision !== d.screen?.decision
        const why = d.student?.reason ?? (overrode ? `kept by you (the screen said ${d.screen?.decision ?? 'nothing'}${d.screen?.reason ? `: ${d.screen.reason}` : ''})` : `${d.screen?.reason ?? ''}${d.student ? ' (you agreed)' : ''}`)
        const first = x.hits?.[0]
        const link = d.link ? ` (link checked ${d.link.at.slice(0, 10)}: ${linkWords(d.link.status)})` : x.local && !/^https?:/.test(x.url) ? ' (your own copy: no link outside Variable Machine; add its DOI to make one)' : ''
        return [
          `## ${isBridge(x) ? '⇄ ' : ''}${x.title}${x.run === last && last > 1 ? ' (new)' : ''}`,
          '',
          `${[x.authors.slice(0, 3).join(', ') + (x.authors.length > 3 ? ' et al.' : ''), x.year, x.venue].filter(Boolean).join(' · ')}`,
          '',
          `- **Why:** ${why}`,
          `- **Decided by:** ${decidedBy(d)}`,
          `- **Where:** ${x.url}${link}${x.oa && x.oa !== x.url ? ` · free to read: ${x.oa}` : x.oa ? ' · free to read' : ' · the full text may be paywalled'}${proxy && !x.oa && /^https?:/.test(x.url) ? ` · through your library: ${proxy}${x.url}` : ''}`,
          `- **Found:** in ${x.sources.join(', ')}${first ? `; by the search "${first.search}" in ${first.source}, ${first.at.slice(0, 10)}: ${first.address}` : `; ${x.found.slice(0, 2).join('; ')}`}${(x.hits?.length ?? 0) > 1 ? ` (and ${x.hits!.length - 1} more search${x.hits!.length === 2 ? '' : 'es'}: searches.md)` : ''}${x.cited ? ` · cited ${x.cited} times` : ''}`,
          ...(x.labels?.length ? [`- **Fields:** ${x.fields?.length ? x.fields.join(', ') : 'none of the three'}${isBridge(x) ? ' (a bridge)' : ''}, from ${x.labels.slice(0, 4).join('; ')}`] : []),
          ...(x.quotes?.length ? ['- **In its own words:**', ...x.quotes.slice(0, 2).map((q) => `  > “${q.text.slice(0, 300)}${q.text.length > 300 ? '…' : ''}” (${q.where})`)] : []),
          ...(d.summary?.length ? ['', ...d.summary.map((c) => `- ${c.claim} > “${c.quote}” (${c.from})`)] : []),
          '',
        ]
      }),
    ].join('\n')
    await fs.writeFile(dir(name, 'reading-list.md'), md)
    await fs.writeFile(dir(name, 'references.bib'), bibtex(kept) + '\n')
    const sm = [
      `# Searches: ${m.topic}`,
      '',
      `Every search the research bot made for this research, in order: the source, the words, the address (keys taken out) and when. Open an address to run the search again yourself; sources change, so it may find more or fewer now.`,
      '',
      '| run | when | source | search | found | address |',
      '|---|---|---|---|---|---|',
      ...searches.map((s) => `| ${s.run ?? ''} | ${s.at.slice(0, 16).replace('T', ' ')} | ${s.source} | ${s.search.replace(/\|/g, '/')} | ${s.error ? `error: ${s.error.replace(/\|/g, '/')}` : s.found} | ${s.address ?? ''} |`),
      '',
    ].join('\n')
    await fs.writeFile(dir(name, 'searches.md'), sm)
    await writeJson(dir(name, 'screen.json'), screen)
    const rec = (await readJson<ResearchManifest>(dir(name, 'manifest.json')))!
    if (rec.command.at(-1) !== line) rec.command.push(line)
    if (proxy) rec.proxy = proxy
    else delete rec.proxy
    await writeJson(dir(name, 'manifest.json'), rec)
    print(`  links: ${todo.length - broken.length} work, ${broken.length} didn't answer a script with a page${broken.length ? ' (see each in the list)' : ''}`)
    print(`  ◂ workspace/research/${name}/reading-list.md, references.bib and searches.md: ${kept.length} kept${bridgesFirst ? `, ${kept.filter(isBridge).length} bridges first` : ''}`)
    return true
  })
}

/* ---------- the model's screen (and a second's) against the student's decisions ---------- */

/** Agreement beyond chance (Cohen's kappa) between two lists of keep/skip. */
function kappa(pairs: ['keep' | 'skip', 'keep' | 'skip'][]) {
  const n = pairs.length
  if (!n) return null
  const po = pairs.filter(([a, b]) => a === b).length / n
  const ak = pairs.filter(([a]) => a === 'keep').length / n
  const bk = pairs.filter(([, b]) => b === 'keep').length / n
  const pe = ak * bk + (1 - ak) * (1 - bk)
  return pe === 1 ? 1 : Math.round(((po - pe) / (1 - pe)) * 100) / 100
}

async function checkCommand(name: string): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  const screen = await readScreen(name)
  const rows = Object.values(screen).filter((d) => d.student && modelRead(d))
  if (!rows.length) return print(`papers check: no item has both the model's decision and yours yet. Decide some (keep or skip) on the Data tab, or with papers decide.`), false
  const agree = rows.filter((d) => d.screen!.decision === d.student!.decision).length
  const tp = rows.filter((d) => d.screen!.decision === 'keep' && d.student!.decision === 'keep').length
  const saidKeep = rows.filter((d) => d.screen!.decision === 'keep').length
  const youKeep = rows.filter((d) => d.student!.decision === 'keep').length
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–')
  const you = m?.pooled ? 'the class' : 'you'
  // the screen by similarity alone, cut where it keeps as many as you did: does the model add anything?
  const bySim = [...rows].sort((a, b) => (b.sim ?? 0) - (a.sim ?? 0))
  const simAgree = bySim.filter((d, i) => (i < youKeep ? 'keep' : 'skip') === d.student!.decision).length
  const first = rows[0].screen!.by
  print(`  on ${rows.length} items ${first} read and ${you} decided:`)
  print(`    ${first} agrees with ${you} on ${agree} (${pct(agree, rows.length)})`)
  print(`    of the ${saidKeep} it kept, ${you} kept ${tp} (${pct(tp, saidKeep)}); of the ${youKeep} ${you} kept, it kept ${tp} (${pct(tp, youKeep)})`)
  print(`    similarity alone, keeping the closest ${youKeep}: agrees on ${simAgree} (${pct(simAgree, rows.length)})`)

  // a second screener: each against you, and the two against each other
  const both = Object.values(screen).filter((d) => modelRead(d) && d.second)
  let second: Record<string, unknown> | undefined
  if (both.length) {
    const by = both[0].second!.by
    const withYou = both.filter((d) => d.student)
    const secondAgree = withYou.filter((d) => d.second!.decision === d.student!.decision).length
    const firstAgree = withYou.filter((d) => d.screen!.decision === d.student!.decision).length
    const same = both.filter((d) => d.second!.decision === d.screen!.decision).length
    const k = kappa(both.map((d) => [d.screen!.decision, d.second!.decision]))
    const disputed = withYou.filter((d) => d.second!.decision !== d.screen!.decision)
    const sidedFirst = disputed.filter((d) => d.student!.decision === d.screen!.decision).length
    second = { by, n: both.length, agreeEachOther: same, kappa: k, decided: withYou.length, firstAgreesYou: firstAgree, secondAgreesYou: secondAgree, disputed: disputed.length, youSidedFirst: sidedFirst }
    print(`  two screeners, on the ${both.length} items both read:`)
    print(`    ${first} and ${by} agree on ${same} (${pct(same, both.length)}); beyond chance (Cohen's kappa) ${k ?? '–'}`)
    if (withYou.length) {
      print(`    with ${you}, on ${withYou.length}: ${first} ${pct(firstAgree, withYou.length)}, ${by} ${pct(secondAgree, withYou.length)}`)
      print(`    where they disagreed and ${you} decided (${disputed.length}): ${you} sided with ${first} on ${sidedFirst}, with ${by} on ${disputed.length - sidedFirst}`)
    } else print(`    decide some of the items they disagree on, and this shows which ${you === 'you' ? 'you side with' : 'the class sides with'}`)
  }

  // a class: each student against the pooled decision
  let students: Record<string, { n: number; agree: number }> | undefined
  if (m?.pooled) {
    students = {}
    for (const d of Object.values(screen)) {
      if (!d.students || !d.student) continue
      for (const [s, k] of Object.entries(d.students)) {
        const r = (students[s] ??= { n: 0, agree: 0 })
        r.n++
        if (k === d.student.decision) r.agree++
      }
    }
    print('  each student against the pooled decision:')
    for (const [s, r] of Object.entries(students)) print(`    ${s.padEnd(24)} agrees on ${r.agree} of ${r.n} (${pct(r.agree, r.n)})`)
  }
  const result = { at: now(), n: rows.length, agree, keepPrecision: saidKeep ? tp / saidKeep : null, keepRecall: youKeep ? tp / youKeep : null, similarityAgree: simAgree, youKept: youKeep, modelKept: saidKeep, ...(second && { second }), ...(students && { students }) }
  await writeJson(dir(name, 'check.json'), result)
  print(`  ◂ workspace/research/${name}/check.json`)
  return true
}

/* ---------- a class: several students' decisions, pooled into one point of view ---------- */

async function poolCommand(name: string, from: string[], line: string): Promise<boolean> {
  const names = [...new Set(from)]
  if (names.length < 2 || names.some((n) => !NAME.test(n)) || names.includes(name)) return print("usage: papers pool <class> --from <research> --from <research> …   (two or more students' research folders, each brought in with unzip; the class's own name differs from theirs)"), false
  const old = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (old && !old.pooled) return print(`papers pool: ${name} is a student's own research; choose another name for the class`), false
  const ms: ResearchManifest[] = []
  for (const n of names) {
    const mm = await readJson<ResearchManifest>(dir(n, 'manifest.json'))
    if (!mm) return print(`papers pool: no research called ${n} (bring it in: unzip shared/research-${n}.zip)`), false
    ms.push(mm)
  }
  const topics = [...new Set(ms.map((x) => x.topic.trim()))]
  if (topics.length > 1) print(`  (the students' topics differ; the class's is the first: "${ms[0].topic}")`)
  const byKey = new Map<string, Seen>()
  const screen: Record<string, Decision> = {}
  for (const n of names) {
    const s = await readScreen(n)
    for (const x of await readLibrary(n)) {
      const had = byKey.get(x.key)
      byKey.set(x.key, had ? merge(had, x) : { ...x })
      const d = s[x.key]
      const p = (screen[x.key] ??= {})
      if (d?.student) (p.students ??= {})[n] = d.student.decision
      // the screener's answer and similarity from the first student whose model read it
      if (modelRead(d) && !modelRead(p)) (p.screen = d!.screen), (p.sim = d!.sim)
      p.sim ??= d?.sim
      if (!p.screen && d?.screen) p.screen = d.screen
    }
  }
  // the pooled decision: what most of the students who decided said; a tie is left undecided
  let ties = 0
  for (const d of Object.values(screen)) {
    if (!d.students) continue
    const ks = Object.values(d.students)
    const keep = ks.filter((k) => k === 'keep').length
    if (keep * 2 === ks.length) {
      ties++
      continue
    }
    const decision = keep * 2 > ks.length ? 'keep' : 'skip'
    d.student = { decision, reason: `${decision === 'keep' ? keep : ks.length - keep} of the ${ks.length} students who decided ${decision === 'keep' ? 'kept' : 'skipped'} it`, at: now() }
  }
  await fs.mkdir(dir(name), { recursive: true })
  await writeLibrary(name, [...byKey.values()])
  await writeJson(dir(name, 'screen.json'), screen)
  const seeds = await readJson(dir(names[0], 'seeds.json'))
  if (seeds) await writeJson(dir(name, 'seeds.json'), seeds)
  const decided = Object.values(screen).filter((d) => d.student).length
  const m: ResearchManifest = {
    name,
    kind: 'research',
    created: old?.created ?? now(),
    license: ms[0].license,
    inputs: names.map((n) => `workspace/research/${n}`),
    command: [...(old?.command ?? []), line],
    topic: ms[0].topic,
    seeds: [...new Set(ms.flatMap((x) => x.seeds))],
    feeds: [...new Set(ms.flatMap((x) => x.feeds))],
    queries: [...new Set(ms.flatMap((x) => x.queries))],
    pooled: names,
    runs: [{ at: now(), found: byKey.size, added: byKey.size }],
  }
  await writeJson(dir(name, 'manifest.json'), m)
  print(`  ${names.length} students · ${byKey.size} items once duplicates are removed · ${decided} with a pooled decision${ties ? ` · ${ties} tied, left undecided` : ''}`)
  print(`  ◂ workspace/research/${name}: the class's decisions · next: papers check ${name} (each student against the pool), then papers judge ${name} <dataset>`)
  return true
}

/* ---------- the decisions as a training set ---------- */

async function judgeCommand(name: string, dataset: string, line: string): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!m) return print(`papers: no research called ${name}`), false
  if (!NAME.test(dataset)) return print('usage: papers judge <name> <dataset>'), false
  const prefs = `${dataset}-prefs`.slice(0, 64)
  for (const d of [dataset, prefs]) if (await readJson(ws('data', d, 'manifest.json'))) return print(`papers judge: ${d} already exists; trash data/${d} first, or choose another name`), false
  const library = await readLibrary(name)
  const screen = await readScreen(name)
  const system = judgeSystem(m.topic)
  const decided = library.filter((x) => screen[x.key]?.student || modelRead(screen[x.key]))
  const line1 = (d: Decision) => (d.student ? `${d.student.decision}: ${d.student.reason && !m.pooled ? d.student.reason : d.student.decision === d.screen?.decision ? d.screen.reason : d.student.decision === 'keep' ? 'it is about the topic' : 'it is not about the topic'}` : `${d.screen!.decision}: ${d.screen!.reason}`)
  const sft = decided.map((x) => ({ messages: [{ role: 'system', content: system }, { role: 'user', content: judgeInput(x) }, { role: 'assistant', content: line1(screen[x.key]) }] }))
  // a pair where the student (or the class) overrode the model: their decision chosen, the model's rejected
  const overrode = decided.filter((x) => screen[x.key].student && modelRead(screen[x.key]) && screen[x.key].student!.decision !== screen[x.key].screen!.decision)
  const pairs = overrode.map((x) => ({ prompt: `${system}\n\n${judgeInput(x)}`, chosen: line1(screen[x.key]), rejected: `${screen[x.key].screen!.decision}: ${screen[x.key].screen!.reason}` }))
  if (sft.length < 10) return print(`papers judge: ${sft.length} decided items; a point of view needs at least 10 (screen more, or decide more)`), false
  const yours = decided.filter((x) => screen[x.key].student).length
  const who = m.pooled ? `the class (${m.pooled.length} students, pooled)` : 'you'
  const base = {
    kind: 'dataset' as const,
    created: now(),
    license: 'abstracts and passages belong to their authors and publishers (for study); metadata OpenAlex CC0',
    inputs: [`workspace/research/${name}`],
    command: [line],
    split: null,
    research: { folder: name, topic: m.topic },
  }
  const source = (rows: number) => ({ id: `research/${name}`, kind: 'import' as const, license: 'abstracts and passages belong to their authors and publishers (for study)', licenseChecked: false, rows, about: `keep/skip decisions on "${m.topic}"${m.pooled ? `, pooled from ${m.pooled.join(', ')}` : ''}` })
  const write = async (n: string, mf: DatasetManifest, rows: unknown[]) => {
    await fs.mkdir(ws('data', n), { recursive: true })
    await fs.writeFile(ws('data', n, 'train.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
    await fs.writeFile(ws('data', n, 'valid.jsonl'), '')
    await writeJson(ws('data', n, 'manifest.json'), mf)
  }
  await write(dataset, { ...base, name: dataset, format: 'chat', counts: { train: sft.length, valid: 0 }, sources: [source(sft.length)], about: `Keep or skip, with a line why, for items on "${m.topic}": ${yours} decided by ${who}, ${sft.length - yours} by the screener. Train teaches a small model a point of view: relevance as ${who === 'you' ? 'you see it' : 'the class sees it'}.` }, sft)
  print(`  ◂ ${sft.length} rows → workspace/data/${dataset}/train.jsonl (${yours} decided by ${who}, ${sft.length - yours} the screener's that were left)`)
  if (pairs.length) {
    await write(prefs, { ...base, name: prefs, format: 'preference', counts: { train: pairs.length, valid: 0 }, sources: [source(pairs.length)], about: `Where ${who} overrode the screener on "${m.topic}": that decision chosen, the model's rejected. Prefer trains a point of view from these alone.` }, pairs)
    print(`  ◂ ${pairs.length} pairs → workspace/data/${prefs}/train.jsonl (where ${who} overrode the screener)`)
  } else print(`  no preference pairs: ${who} didn't override the screener anywhere`)
  print(`  next: data split ${dataset} --valid 0.2, then train it`)
  return true
}

export async function papersCommand(args: string[], line: string): Promise<boolean> {
  const [sub, ...rest] = args
  const f = flags(rest)
  const name = f.pos[0] ?? ''
  if (sub === 'keys') return keysCommand()
  const allowed: Record<string, string[]> = {
    search: ['topic', 'seed', 'feed', 'queries', 'per', 'model', 'archive', 'newspapers', 'patents', 'patent', 'fields'],
    screen: ['model', 'top', 'again', 'embed', 'as'],
    decide: ['reason'],
    add: ['title'],
    summarise: ['model', 'full-text', 'again'],
    list: ['proxy', 'bridges-first'],
    check: [],
    pool: ['from'],
    judge: [],
  }
  if (!sub || !(sub in allowed) || !NAME.test(name)) {
    print('papers search <name> --topic "…" --seed <doi|arXiv id|address> … [--feed <address>] [--archive] [--newspapers] [--patents us] [--fields humanities,sciences,technology]   find items')
    print('papers screen <name> [--top 40] [--embed <model>] [--as second --model <model>]   compare with the seeds, then the model: keep or skip, and why')
    print('papers decide <name> <key> keep|skip|undo [--reason "…"]   your decision, over the model\'s')
    print('papers add <name> uploads/<file>.pdf      your own copy, read in full')
    print('papers summarise <name> [--full-text]    kept items free to read: claims, each quoting the text, with where')
    print('papers list <name> [--proxy <prefix>] [--bridges-first]   reading-list.md, references.bib, searches.md; every link checked')
    print('papers check <name>                      the model\'s screen (and a second\'s) against your decisions')
    print('papers pool <class> --from <name> --from <name> …   a class: several students\' decisions, pooled')
    print('papers judge <name> <dataset>            the decisions as a training set, for a point of view')
    print('papers keys                              the file on this Mac that holds your keys')
    return sub === 'help'
  }
  const bad = Object.keys(f.opts).find((k) => !allowed[sub].includes(k))
  if (bad) return print(`papers ${sub}: unknown option --${bad}`), false
  if (sub === 'search') return searchCommand(name, f, line)
  if (sub === 'screen') return screenCommand(name, f, line)
  if (sub === 'decide') return decideCommand(name, f.pos[1] ?? '', f.pos[2] ?? '', f.one('reason'))
  if (sub === 'add') return addCommand(name, f.pos[1] ?? '', f, line)
  if (sub === 'summarise') return summariseCommand(name, f, line)
  if (sub === 'list') return listCommand(name, f, line)
  if (sub === 'check') return checkCommand(name)
  if (sub === 'pool') return poolCommand(name, f.opts.from ?? [], line)
  return judgeCommand(name, f.pos[1] ?? '', line)
}
