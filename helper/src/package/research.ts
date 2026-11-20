/**
 * research.js in a package: the source. `package <judge>` bundles this with
 * the search code (shared/research.ts) into one file for Node:
 *
 *   node research.js                 search again with the saved searches; judge what's new
 *   node research.js --new-queries   the writer model writes new searches first
 *   node research.js --top 60        how many of the closest new items the judge reads
 *
 * The whole loop: the searches → OpenAlex, Semantic Scholar, arXiv, Crossref
 * and the feeds (and, when research.json names them, the Internet Archive,
 * the Library of Congress's newspapers and US patents by number) → the seeds'
 * citations both ways → duplicates removed → what
 * the library has seen dropped → nomic-embed-text ranks the rest by closeness
 * to the seeds → the judge (the model in this package) answers keep or skip →
 * reading-<date>.md, references.bib, and library.jsonl updated. The judge never
 * names a paper; search code finds them all.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DECISION_SCHEMA, bibtex, cosine, dedupe, embedQuery, embedText, followCitations, judgeInput, judgeSystem, parseDecision, QUERY_SCHEMA, queryPrompt, readFeed, resolveSeeds, search, searchMore, SOURCES, type Item, type Keys, type More } from '../shared/research.ts'

/** Keys, as Variable Machine keeps them: a file in your Library on a Mac (never in this folder), or the environment. */
function loadKeys(): Keys {
  let file: Keys = {}
  try {
    file = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Library', 'Application Support', 'Variable Machine', 'keys.json'), 'utf8')) as Keys
  } catch {
    // no file: the free budgets
  }
  return { ...file, ...(process.env.OPENALEX_API_KEY && { openalex: process.env.OPENALEX_API_KEY }), ...(process.env.SEMANTIC_SCHOLAR_API_KEY && { semanticScholar: process.env.SEMANTIC_SCHOLAR_API_KEY }) }
}


export interface ResearchConfig {
  topic: string
  /** this package's model: keep or skip, and why */
  judge: string
  /** the model that writes searches (only with --new-queries) */
  writer: string
  /** the model that compares texts */
  embed: string
  ollama: string
  seeds: string[]
  feeds: string[]
  queries: string[]
  /** how many of the closest new items the judge reads */
  top: number
  /** results per search, per source */
  per: number
  /** the other sources searched: archive, newspapers, patents (older packages have none) */
  more?: More[]
  /** US patent numbers to fetch every run */
  patents?: string[]
}

type Entry = Item & { first: string; run: number; decision?: 'keep' | 'skip'; reason?: string; by?: string; sim?: number }

const say = (s: string) => process.stdout.write(s + '\n')

async function post<T>(cfg: ResearchConfig, p: string, body: unknown): Promise<T> {
  const res = await fetch(`${cfg.ollama.replace(/\/$/, '')}${p}`, { method: 'POST', body: JSON.stringify(body) })
  const out = (await res.json()) as T & { error?: string }
  if (out.error) throw new Error(`Ollama: ${out.error} (is it running? has it got the model? see README.md)`)
  return out
}

async function embed(cfg: ResearchConfig, texts: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 32) out.push(...(await post<{ embeddings: number[][] }>(cfg, '/api/embed', { model: cfg.embed, input: texts.slice(i, i + 32) })).embeddings)
  return out
}

/** The whole loop, once. Returns the new items, each with the judge's decision. */
export async function run(dir: string, opts: { newQueries?: boolean; top?: number } = {}): Promise<Entry[]> {
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'research.json'), 'utf8')) as ResearchConfig
  const keys = loadKeys()
  const libFile = path.join(dir, 'library.jsonl')
  const library: Entry[] = fs.existsSync(libFile) ? fs.readFileSync(libFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Entry) : []
  const runNo = Math.max(0, ...library.map((x) => x.run)) + 1
  say(`research: ${cfg.topic}`)

  const { seeds, works } = await resolveSeeds(cfg.seeds, keys)
  const known = seeds.flatMap((s) => (s.item ? [s.item] : []))
  let queries = cfg.queries
  if (opts.newQueries || !queries.length) {
    say(`  ${cfg.writer} writes searches`)
    const out = await post<{ message: { content: string } }>(cfg, '/api/chat', { model: cfg.writer, messages: [{ role: 'user', content: queryPrompt(cfg.topic, known, 8) }], stream: false, think: false, format: QUERY_SCHEMA, options: { temperature: 0.3 } })
    queries = ((JSON.parse(out.message.content) as { queries?: string[] }).queries ?? []).filter((q) => q.trim().length > 2).slice(0, 8)
    fs.writeFileSync(path.join(dir, 'research.json'), JSON.stringify({ ...cfg, queries }, null, 2) + '\n')
  }
  for (const q of queries) say(`    · ${q}`)

  const found: Item[] = []
  for (const source of SOURCES) {
    let n = 0
    for (const q of queries) {
      try {
        const xs = await search(source, q, cfg.per, keys)
        found.push(...xs)
        n += xs.length
      } catch (err) {
        say(`    ${source}: ${(err as Error).message}`)
        break
      }
    }
    say(`  ${source.padEnd(17)} ${n}`)
  }
  for (const url of cfg.feeds) found.push(...(await readFeed(url).catch((err: Error) => (say(`  feed ${url}: ${err.message}`), []))))
  if (cfg.more?.length) found.push(...(await searchMore(cfg.more, queries, cfg.per, { patents: cfg.patents, say, log: [] }).catch((err: Error) => (say(`  ${err.message}`), []))))
  found.push(...(await followCitations(works, cfg.per * 2, keys).catch((err: Error) => (say(`  citations: ${err.message}`), []))))

  const seen = new Set([...library.map((x) => x.key), ...known.map((k) => k.key)])
  const fresh = dedupe(found).filter((x) => !seen.has(x.key))
  say(`  ${fresh.length} new, of ${dedupe(found).length} found (the library has ${library.length})`)
  if (!fresh.length) return []

  const [centreish, ...anchors] = await embed(cfg, [embedQuery(cfg.topic, cfg.embed), ...known.map((k) => embedText(k, cfg.embed))])
  const all = [centreish, ...anchors]
  const centre = centreish.map((_, i) => all.reduce((s, v) => s + v[i], 0) / all.length)
  const vs = await embed(
    cfg,
    fresh.map((x) => embedText(x, cfg.embed)),
  )
  const ranked: Entry[] = fresh.map((x, i) => ({ ...x, first: new Date().toISOString(), run: runNo, sim: Math.round(cosine(vs[i], centre) * 1000) / 1000 })).sort((a, b) => b.sim! - a.sim!)
  const top = opts.top ?? cfg.top
  say(`  ${cfg.judge} reads the ${Math.min(top, ranked.length)} closest`)
  for (const [i, x] of ranked.entries()) {
    if (i >= top) {
      Object.assign(x, { decision: 'skip', reason: `far from the seeds (similarity ${x.sim!.toFixed(2)})`, by: cfg.embed })
      continue
    }
    const ask = { model: cfg.judge, messages: [{ role: 'system', content: judgeSystem(cfg.topic) }, { role: 'user', content: judgeInput(x) }], stream: false, options: { temperature: 0, num_predict: 80 } }
    // the judge was trained to answer "keep: …" or "skip: …"; a model that wasn't (one that thinks out loud first) is asked again for JSON in that shape
    const plain = await post<{ message: { content: string } }>(cfg, '/api/chat', ask)
    const d =
      parseDecision(plain.message.content) ??
      parseDecision((await post<{ message: { content: string } }>(cfg, '/api/chat', { ...ask, think: false, format: DECISION_SCHEMA, options: { temperature: 0, num_predict: 200 } })).message.content) ?? { decision: 'skip' as const, reason: `(no decision: "${plain.message.content.slice(0, 60)}")` }
    Object.assign(x, d, { by: cfg.judge })
    say(`    ${d.decision} ${x.sim!.toFixed(2)} ${x.title.slice(0, 72)}`)
  }

  fs.writeFileSync(libFile, [...library, ...ranked].map((x) => JSON.stringify(x)).join('\n') + '\n')
  const kept = ranked.filter((x) => x.decision === 'keep')
  const day = new Date().toISOString().slice(0, 10)
  const md = [
    `# New on ${day}: ${cfg.topic}`,
    '',
    `${kept.length} kept of ${ranked.length} new. Found by search code; kept or skipped by ${cfg.judge}, the judge named in research.json. Abstracts only: check each before you cite it.`,
    '',
    ...kept.flatMap((x) => [
      `## ${x.title}`,
      '',
      [x.authors.slice(0, 3).join(', '), x.year, x.venue].filter(Boolean).join(' · '),
      '',
      `- **Why:** ${x.reason}`,
      `- **Decided by:** ${x.by}`,
      `- **Where:** ${x.url}${x.oa && x.oa !== x.url ? ` · free to read: ${x.oa}` : ''}`,
      `- **Found:** in ${x.sources.join(', ')}${x.hits?.[0] ? `; by the search "${x.hits[0].search}", ${x.hits[0].at.slice(0, 10)}: ${x.hits[0].address}` : ''}`,
      ...(x.quotes?.length ? [`  > “${x.quotes[0].text.slice(0, 300)}” (${x.quotes[0].where})`] : []),
      '',
    ]),
  ].join('\n')
  fs.writeFileSync(path.join(dir, `reading-${day}.md`), md)
  fs.writeFileSync(path.join(dir, 'references.bib'), bibtex([...library, ...ranked].filter((x) => x.decision === 'keep')) + '\n')
  say(`  ◂ reading-${day}.md (${kept.length} kept), references.bib, library.jsonl (${library.length + ranked.length} seen)`)
  return ranked
}

export async function cli(args: string[], dir: string) {
  const at = args.indexOf('--top')
  await run(dir, { newQueries: args.includes('--new-queries'), ...(at >= 0 && { top: Number(args[at + 1]) }) })
}

// run from the command line: node research.js
if (require.main === module) cli(process.argv.slice(2), __dirname).catch((e: Error) => (console.error(e.message), process.exit(1)))
