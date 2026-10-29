import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { ollamaPost } from './ollama.ts'
import { setRunning } from './run.ts'
import type { DatasetManifest } from './shared/manifest.ts'
import {
  DECISION_SCHEMA,
  QUERY_SCHEMA,
  SOURCES,
  SUMMARY_SCHEMA,
  bibtex,
  checkedClaims,
  cosine,
  dedupe,
  embedText,
  followCitations,
  judgeInput,
  judgeSystem,
  parseDecision,
  queryPrompt,
  readFeed,
  resolveSeeds,
  search,
  summaryPrompt,
  finalOf,
  type Decision,
  type Item,
  type Keys,
  type ResearchManifest,
  type Seen,
} from './shared/research.ts'

/**
 * The research bot (`papers …`): papers, articles and Substack posts on a
 * topic, in workspace/research/<name>/. Search code finds every item; the
 * model writes the searches, screens and summarises, and never supplies a
 * citation. The student's keep/skip decisions become a dataset for training a
 * relevance judge.
 *
 *   papers search <name> --topic "…" --seed <doi|arXiv id|url> … [--feed <url>] …   searches → library.jsonl
 *   papers screen <name>                  nomic-embed-text similarity to the seeds, then the model: keep or skip, and why
 *   papers decide <name> <key> keep|skip [--reason "…"]   the student's own decision, over the model's
 *   papers summarise <name>               kept items that are free to read: claims, each with its quote
 *   papers list <name>                    reading-list.md and references.bib
 *   papers check <name>                   the model's screen against the student's decisions
 *   papers judge <name> <dataset>         the decisions as a training set (and <dataset>-prefs, where the student overrode)
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
/** keys, when the student has them: without, OpenAlex has a small daily budget per network and Semantic Scholar is often busy */
const KEYS: Keys = { openalex: process.env.OPENALEX_API_KEY, semanticScholar: process.env.SEMANTIC_SCHOLAR_API_KEY }


const readLibrary = async (name: string): Promise<Seen[]> =>
  (await fs.readFile(dir(name, 'library.jsonl'), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Seen)
const writeLibrary = (name: string, items: Seen[]) => fs.writeFile(dir(name, 'library.jsonl'), items.map((x) => JSON.stringify(x)).join('\n') + '\n')
const readScreen = async (name: string) => (await readJson<Record<string, Decision>>(dir(name, 'screen.json'))) ?? {}

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

async function embed(texts: string[], signal: AbortSignal): Promise<number[][]> {
  const res = await ollamaPost('/api/embed', { model: EMBED, input: texts }, signal)
  const body = (await res.json()) as { embeddings?: number[][]; error?: string }
  if (body.error || !body.embeddings) throw new Error(`${EMBED}: ${body.error ?? 'no embeddings'}`)
  return body.embeddings
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

/* ---------- search ---------- */

async function searchCommand(name: string, f: ReturnType<typeof flags>, line: string): Promise<boolean> {
  const old = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  const topic = f.one('topic') ?? old?.topic ?? ''
  const seeds = f.opts.seed ?? old?.seeds ?? []
  const feeds = f.opts.feed ?? old?.feeds ?? []
  const n = Math.max(3, Math.min(12, Number(f.one('queries') ?? 8)))
  const per = Math.max(3, Math.min(25, Number(f.one('per') ?? 10)))
  const model = f.one('model') ?? WRITER
  if (!topic.trim() || (!old && seeds.length < 2) || seeds.length > 5) {
    print('usage: papers search <name> --topic "<topic>" --seed <doi|arXiv id|address> --seed … (2 to 5 seeds) [--feed <address>]… [--queries 8] [--per 10]')
    print('  a seed is a paper or article you already know is relevant: a DOI (10.1145/…), an arXiv id (2504.07879), or its web address')
    print('  a feed is a Substack or a blog by its feed address: name.substack.com/feed')
    return false
  }
  return stoppable(async (signal) => {
    await fs.mkdir(dir(name), { recursive: true })
    print(`  the seeds, through OpenAlex`)
    const { seeds: got, works } = await resolveSeeds(seeds, KEYS)
    for (const s of got) print(s.item ? `    ✓ ${s.item.title}${s.item.year ? ` (${s.item.year})` : ''}` : `    ✗ ${s.given}: ${s.problem}`)
    const known = got.flatMap((s) => (s.item ? [s.item] : []))
    if (!known.length) return print('papers: none of the seeds could be read; give a DOI, an arXiv id or a web address'), false
    await writeJson(dir(name, 'seeds.json'), got)

    // the model writes the searches; on a rerun they are kept, unless --queries asks for new ones
    let queries = old?.queries ?? []
    if (!queries.length || f.opts.queries) {
      print(`  ${model} writes ${n} searches   (ollama, think off, JSON: {"queries": […]})`)
      const out = await askJson<{ queries?: string[] }>(model, null, queryPrompt(topic, known, n), QUERY_SCHEMA, signal, 0.3)
      queries = [...new Set((out.queries ?? []).map((q) => q.replace(/["“”]/g, '').trim()).filter((q) => q.length > 2))].slice(0, n)
      if (!queries.length) return print(`papers: ${model} wrote no searches; run it again`), false
    }
    for (const q of queries) print(`    · ${q}`)

    const found: Item[] = []
    const failed = new Set<string>()
    for (const source of SOURCES) {
      let count = 0
      for (const q of queries) {
        if (signal.aborted) throw new Error('stopped')
        try {
          const xs = await search(source, q, per, KEYS)
          found.push(...xs)
          count += xs.length
        } catch (err) {
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
        print(`  feed              ${xs.length} posts · ${url}`)
      } catch (err) {
        print(`  feed ${url}: ${(err as Error).message}`)
      }
    }
    try {
      const cites = await followCitations(works, per * 2, KEYS)
      found.push(...cites)
      print(`  citations         ${cites.length}, both ways from ${works.length} seed${works.length === 1 ? '' : 's'} (OpenAlex)`)
    } catch (err) {
      print(`  citations: ${(err as Error).message}`)
    }

    // remove duplicates (DOI, arXiv id, or the title once normalised), the seeds themselves, and what the library has seen
    const seedKeys = new Set(known.map((k) => k.key))
    const items = dedupe(found).filter((x) => !seedKeys.has(x.key))
    const library = await readLibrary(name)
    const run = (old?.runs.length ?? 0) + 1
    const byKey = new Map(library.map((x) => [x.key, x]))
    let added = 0
    for (const x of items) {
      const had = byKey.get(x.key)
      if (had) byKey.set(x.key, { ...had, ...x, first: had.first, run: had.run, found: [...new Set([...had.found, ...x.found])], sources: [...new Set([...had.sources, ...x.sources])] })
      else (byKey.set(x.key, { ...x, first: now(), run }), added++)
    }
    await writeLibrary(name, [...byKey.values()])
    print(`  ${found.length} found · ${items.length} once duplicates are removed · ${added} new${run > 1 ? ` since run ${run - 1}` : ''}`)
    const m: ResearchManifest = {
      name,
      kind: 'research',
      created: old?.created ?? now(),
      license: 'metadata: OpenAlex CC0, Crossref, arXiv, Semantic Scholar terms; abstracts belong to their authors and publishers',
      inputs: [...seeds, ...feeds],
      command: [...(old?.command ?? []), line],
      topic,
      seeds,
      feeds,
      queries,
      runs: [...(old?.runs ?? []), { at: now(), found: items.length, added }],
    }
    await writeJson(dir(name, 'manifest.json'), m)
    print(`  ◂ workspace/research/${name}/library.jsonl · next: papers screen ${name}`)
    if (failed.size) print(`  (${[...failed].join(', ')} answered with an error this time; the other sources were searched)`)
    return true
  })
}

/* ---------- screen ---------- */

async function screenCommand(name: string, f: ReturnType<typeof flags>, line: string): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!m) return print(`papers: no research called ${name}; papers search ${name} first`), false
  const model = f.one('model') ?? WRITER
  const top = Math.max(1, Math.min(400, Number(f.one('top') ?? 40)))
  const again = 'again' in f.opts
  if (!(await hasModel(EMBED))) return print(`papers screen needs ${EMBED} (274 MB), the model that compares texts: ollama pull ${EMBED}`), false
  if (!(await hasModel(model))) return print(`papers screen needs ${model}: ollama pull ${model}`), false
  return stoppable(async (signal) => {
    const library = await readLibrary(name)
    const screen = await readScreen(name)
    const seeds = ((await readJson<{ item: Item | null }[]>(dir(name, 'seeds.json'))) ?? []).flatMap((s) => (s.item ? [s.item] : []))
    // similarity: each item against the seeds and the topic, averaged into one point
    const cache = (await readJson<Record<string, number[]>>(dir(name, 'embeddings.json'))) ?? {}
    const want = library.filter((x) => !cache[x.key])
    print(`  ${EMBED} compares ${library.length} items with the ${seeds.length} seeds and the topic${want.length < library.length ? ` (${library.length - want.length} already compared)` : ''}`)
    for (let i = 0; i < want.length; i += 32) {
      const vs = await embed(
        want.slice(i, i + 32).map((x) => embedText(x)),
        signal,
      )
      want.slice(i, i + 32).forEach((x, k) => (cache[x.key] = vs[k]))
    }
    await writeJson(dir(name, 'embeddings.json'), cache)
    const anchors = await embed([`search_query: ${m.topic}`, ...seeds.map((s) => embedText(s))], signal)
    const centre = anchors[0].map((_, i) => anchors.reduce((s, v) => s + v[i], 0) / anchors.length)
    for (const x of library) (screen[x.key] ??= {}).sim = Math.round(cosine(cache[x.key], centre) * 1000) / 1000

    // the model screens the closest; the rest are skipped by similarity, and say so
    const todo = library.filter((x) => again || !screen[x.key].screen).sort((a, b) => screen[b.key].sim! - screen[a.key].sim!)
    const judged = todo.slice(0, top)
    const cut = judged.at(-1) ? screen[judged.at(-1)!.key].sim! : 1
    print(`  ${model} screens the ${judged.length} closest: keep or skip, and why   (ollama, think off, JSON: {"decision", "reason"})`)
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
    for (const x of todo.slice(top)) screen[x.key].screen = { decision: 'skip', reason: `far from the seeds: similarity ${screen[x.key].sim!.toFixed(2)}, below the ${cut.toFixed(2)} of the ${top} the model read`, by: EMBED }
    await writeJson(dir(name, 'screen.json'), screen)
    const rec = (await readJson<ResearchManifest>(dir(name, 'manifest.json')))!
    if (rec.command.at(-1) !== line) rec.command.push(line)
    await writeJson(dir(name, 'manifest.json'), rec)
    print(`  ◂ ${kept} kept, ${judged.length - kept} skipped by ${model}; ${Math.max(0, todo.length - top)} skipped by similarity · change any you disagree with, then papers list ${name}`)
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

/* ---------- summaries ---------- */

async function summariseCommand(name: string, f: ReturnType<typeof flags>): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!m) return print(`papers: no research called ${name}`), false
  const model = f.one('model') ?? WRITER
  return stoppable(async (signal) => {
    const library = await readLibrary(name)
    const screen = await readScreen(name)
    // free to read and kept: the summary is of the abstract the source gave (no paywalled full text)
    const todo = library.filter((x) => finalOf(screen[x.key]) === 'keep' && x.oa && x.abstract.length > 80 && !screen[x.key].summary)
    const closed = library.filter((x) => finalOf(screen[x.key]) === 'keep' && !x.oa).length
    print(`  ${model} summarises ${todo.length} kept item${todo.length === 1 ? '' : 's'} that are free to read, from their abstracts; every claim must quote the text${closed ? ` (${closed} kept but not free to read: no summary)` : ''}`)
    let dropped = 0
    for (const x of todo) {
      if (signal.aborted) throw new Error('stopped')
      const out = await askJson<{ claims?: { claim: string; quote: string }[] }>(model, null, summaryPrompt(m.topic, x), SUMMARY_SCHEMA, signal)
      const claims = out.claims ?? []
      const ok = checkedClaims(claims, x.abstract)
      dropped += claims.length - ok.length
      const from = `abstract, via ${x.sources[0]}: ${x.url}`
      screen[x.key].summary = ok.map((c) => ({ claim: c.claim.trim(), quote: c.quote.trim(), from }))
      print(`    ${ok.length}/${claims.length} claims quote the abstract · ${x.title.slice(0, 70)}`)
    }
    await writeJson(dir(name, 'screen.json'), screen)
    print(`  ◂ ${dropped} claim${dropped === 1 ? '' : 's'} left out because the quote isn't in the text · next: papers list ${name}`)
    return true
  })
}

/* ---------- the reading list and BibTeX ---------- */

async function listCommand(name: string): Promise<boolean> {
  const m = await readJson<ResearchManifest>(dir(name, 'manifest.json'))
  if (!m) return print(`papers: no research called ${name}`), false
  const library = await readLibrary(name)
  const screen = await readScreen(name)
  const kept = library.filter((x) => finalOf(screen[x.key]) === 'keep').sort((a, b) => (screen[b.key].sim ?? 0) - (screen[a.key].sim ?? 0))
  const last = m.runs.length
  const md = [
    `# Reading list: ${m.topic}`,
    '',
    `${kept.length} kept of ${library.length} seen, from ${m.runs.length} run${m.runs.length === 1 ? '' : 's'} (the last on ${m.runs.at(-1)?.at.slice(0, 10)}). Every item was found by search code in OpenAlex, Semantic Scholar, arXiv, Crossref or a feed; the model wrote the searches, judged relevance and wrote the summaries. Summaries are from abstracts, and each claim quotes the text it rests on.`,
    '',
    ...kept.flatMap((x) => {
      const d = screen[x.key]
      const overrode = d.student && d.student.decision !== d.screen?.decision
      const why = d.student?.reason ?? (overrode ? `kept by you (the screen said ${d.screen?.decision ?? 'nothing'}${d.screen?.reason ? `: ${d.screen.reason}` : ''})` : `${d.screen?.reason ?? ''}${d.student ? ' (you agreed)' : ''}`)
      return [
        `## ${x.title}${x.run === last && last > 1 ? ' (new)' : ''}`,
        '',
        `${[x.authors.slice(0, 3).join(', ') + (x.authors.length > 3 ? ' et al.' : ''), x.year, x.venue].filter(Boolean).join(' · ')}`,
        '',
        `- **Why:** ${why}`,
        `- **Where:** ${x.url}${x.oa && x.oa !== x.url ? ` · free to read: ${x.oa}` : x.oa ? ' · free to read' : ' · abstract only here: the full text may be paywalled'}`,
        `- **Found by:** ${x.found.slice(0, 3).join('; ')}${x.cited ? ` · cited ${x.cited} times` : ''}`,
        ...(d.summary?.length ? ['', ...d.summary.map((c) => `- ${c.claim} > “${c.quote}” (${c.from})`)] : []),
        '',
      ]
    }),
  ].join('\n')
  await fs.writeFile(dir(name, 'reading-list.md'), md)
  await fs.writeFile(dir(name, 'references.bib'), bibtex(kept) + '\n')
  print(`  ◂ workspace/research/${name}/reading-list.md and references.bib: ${kept.length} kept`)
  return true
}

/* ---------- the model's screen against the student's decisions ---------- */

async function checkCommand(name: string): Promise<boolean> {
  const screen = await readScreen(name)
  const rows = Object.values(screen).filter((d) => d.student && d.screen && d.screen.by !== EMBED)
  if (!rows.length) return print(`papers check: no item has both the model's decision and yours yet. Decide some (keep or skip) on the Data tab, or with papers decide.`), false
  const agree = rows.filter((d) => d.screen!.decision === d.student!.decision).length
  const tp = rows.filter((d) => d.screen!.decision === 'keep' && d.student!.decision === 'keep').length
  const saidKeep = rows.filter((d) => d.screen!.decision === 'keep').length
  const youKeep = rows.filter((d) => d.student!.decision === 'keep').length
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–')
  // the screen by similarity alone, cut where it keeps as many as you did: does the model add anything?
  const bySim = [...rows].sort((a, b) => (b.sim ?? 0) - (a.sim ?? 0))
  const simAgree = bySim.filter((d, i) => (i < youKeep ? 'keep' : 'skip') === d.student!.decision).length
  const result = { at: now(), n: rows.length, agree, keepPrecision: saidKeep ? tp / saidKeep : null, keepRecall: youKeep ? tp / youKeep : null, similarityAgree: simAgree, youKept: youKeep, modelKept: saidKeep }
  await writeJson(dir(name, 'check.json'), result)
  print(`  on ${rows.length} items the model read and you decided:`)
  print(`    the model agrees with you on ${agree} (${pct(agree, rows.length)})`)
  print(`    of the ${saidKeep} it kept, you kept ${tp} (${pct(tp, saidKeep)}); of the ${youKeep} you kept, it kept ${tp} (${pct(tp, youKeep)})`)
  print(`    similarity alone, keeping the closest ${youKeep}: agrees on ${simAgree} (${pct(simAgree, rows.length)})`)
  print(`  ◂ workspace/research/${name}/check.json`)
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
  const decided = library.filter((x) => screen[x.key]?.student || (screen[x.key]?.screen && screen[x.key].screen!.by !== EMBED))
  const line1 = (d: Decision) => (d.student ? `${d.student.decision}: ${d.student.reason ?? (d.student.decision === d.screen?.decision ? d.screen.reason : d.student.decision === 'keep' ? 'it is about the topic' : 'it is not about the topic')}` : `${d.screen!.decision}: ${d.screen!.reason}`)
  const sft = decided.map((x) => ({ messages: [{ role: 'system', content: system }, { role: 'user', content: judgeInput(x) }, { role: 'assistant', content: line1(screen[x.key]) }] }))
  // a pair where the student overrode the model: their decision chosen, the model's rejected
  const overrode = decided.filter((x) => screen[x.key].student && screen[x.key].screen && screen[x.key].screen!.by !== EMBED && screen[x.key].student!.decision !== screen[x.key].screen!.decision)
  const pairs = overrode.map((x) => ({ prompt: `${system}\n\n${judgeInput(x)}`, chosen: line1(screen[x.key]), rejected: `${screen[x.key].screen!.decision}: ${screen[x.key].screen!.reason}` }))
  if (sft.length < 10) return print(`papers judge: ${sft.length} decided items; a judge needs at least 10 (screen more, or decide more)`), false
  const yours = decided.filter((x) => screen[x.key].student).length
  const base = {
    kind: 'dataset' as const,
    created: now(),
    license: 'abstracts belong to their authors and publishers (for study); metadata OpenAlex CC0',
    inputs: [`workspace/research/${name}`],
    command: [line],
    split: null,
    research: { folder: name, topic: m.topic },
  }
  const source = (rows: number) => ({ id: `research/${name}`, kind: 'import' as const, license: 'abstracts belong to their authors and publishers (for study)', licenseChecked: false, rows, about: `keep/skip decisions on "${m.topic}"` })
  const write = async (n: string, mf: DatasetManifest, rows: unknown[]) => {
    await fs.mkdir(ws('data', n), { recursive: true })
    await fs.writeFile(ws('data', n, 'train.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
    await fs.writeFile(ws('data', n, 'valid.jsonl'), '')
    await writeJson(ws('data', n, 'manifest.json'), mf)
  }
  await write(dataset, { ...base, name: dataset, format: 'chat', counts: { train: sft.length, valid: 0 }, sources: [source(sft.length)], about: `Keep or skip, with a line why, for papers and articles on "${m.topic}": ${yours} decided by you, ${sft.length - yours} by the screen. Train teaches a small model to judge relevance the way you do.` }, sft)
  print(`  ◂ ${sft.length} rows → workspace/data/${dataset}/train.jsonl (${yours} your decisions, ${sft.length - yours} the screen's that you left)`)
  if (pairs.length) {
    await write(prefs, { ...base, name: prefs, format: 'preference', counts: { train: pairs.length, valid: 0 }, sources: [source(pairs.length)], about: `Where you overrode the screen on "${m.topic}": your decision chosen, the model's rejected. Prefer leans a judge toward your taste.` }, pairs)
    print(`  ◂ ${pairs.length} pairs → workspace/data/${prefs}/train.jsonl (where you overrode the screen)`)
  } else print(`  no preference pairs: you didn't override the screen anywhere`)
  print(`  next: data split ${dataset} --valid 0.2, then train it`)
  return true
}

export async function papersCommand(args: string[], line: string): Promise<boolean> {
  const [sub, ...rest] = args
  const f = flags(rest)
  const name = f.pos[0] ?? ''
  const allowed: Record<string, string[]> = { search: ['topic', 'seed', 'feed', 'queries', 'per', 'model'], screen: ['model', 'top', 'again'], decide: ['reason'], summarise: ['model'], list: [], check: [], judge: [] }
  if (!sub || !(sub in allowed) || !NAME.test(name)) {
    print('papers search <name> --topic "…" --seed <doi|arXiv id|address> … [--feed <address>] …   find papers and articles')
    print('papers screen <name> [--top 40]          compare with the seeds, then the model: keep or skip, and why')
    print('papers decide <name> <key> keep|skip|undo [--reason "…"]   your decision, over the model\'s')
    print('papers summarise <name>                  kept items free to read: claims, each quoting the abstract')
    print('papers list <name>                       reading-list.md and references.bib')
    print('papers check <name>                      the model\'s screen against your decisions')
    print('papers judge <name> <dataset>            your decisions as a training set, for a relevance judge')
    return sub === 'help'
  }
  const bad = Object.keys(f.opts).find((k) => !allowed[sub].includes(k))
  if (bad) return print(`papers ${sub}: unknown option --${bad}`), false
  if (sub === 'search') return searchCommand(name, f, line)
  if (sub === 'screen') return screenCommand(name, f, line)
  if (sub === 'decide') return decideCommand(name, f.pos[1] ?? '', f.pos[2] ?? '', f.one('reason'))
  if (sub === 'summarise') return summariseCommand(name, f)
  if (sub === 'list') return listCommand(name)
  if (sub === 'check') return checkCommand(name)
  return judgeCommand(name, f.pos[1] ?? '', line)
}
