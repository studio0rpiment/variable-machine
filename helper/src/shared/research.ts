/**
 * The research bot's searching, in one place: the helper's `papers` commands
 * and a package's research.js both use it. Search code finds real items, from
 * OpenAlex, Semantic Scholar, arXiv, Crossref and RSS feeds; a model only
 * writes the searches, judges relevance and summarises. Nothing here asks a
 * model for a citation.
 *
 * Plain fetch and no Node modules, so it bundles for a web page and for Node.
 */

export interface Item {
  /** what it is known by here: doi:…, arxiv:…, or t:<normalised title> */
  key: string
  title: string
  abstract: string
  authors: string[]
  year?: number
  venue?: string
  /** its page */
  url: string
  doi?: string
  arxiv?: string
  openalex?: string
  /** a copy anyone can read, when there is one */
  oa?: string
  /** how many works cite it, by the source that counted most */
  cited?: number
  kind: 'paper' | 'article' | 'post'
  /** which sources had it */
  sources: string[]
  /** how it was found: a search, a seed's references or citations, a feed */
  found: string[]
}

export interface Seed {
  /** as the student gave it: a DOI, an arXiv id, an OpenAlex id, or a web address */
  given: string
  item: Item | null
  problem?: string
}

const UA = 'Variable Machine research bot (https://variablemachine.orpiment.studio)'
const TIMEOUT = 20_000

export interface Keys {
  openalex?: string
  semanticScholar?: string
}

/**
 * A GET with a time limit, so a source that never answers can't stall the
 * search. Browsers refuse to set User-Agent; it is ignored there.
 */
async function get(url: string, headers: Record<string, string> = {}, again = true): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT) // a network request that never answers is the one thing that can't be waited out
  let res: Response
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: ctl.signal })
  } finally {
    clearTimeout(t)
  }
  // 429 is "too many, too fast": the free sources ask for a pause, so wait once and ask again
  if (res.status === 429 && again) {
    await new Promise((r) => setTimeout(r, 3000))
    return get(url, headers, false)
  }
  return res
}

const entities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

/** Tags out, entities in, space squeezed: JATS abstracts, feed descriptions. */
export const plain = (s: string | undefined | null) =>
  entities(entities(s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/** A title as it compares: lowercase letters and digits, single spaces. */
export const normTitle = (t: string) =>
  t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const cleanDoi = (d: string | undefined | null) => (d ? d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '').trim().toLowerCase() || undefined : undefined)

function keyOf(x: { doi?: string; arxiv?: string; title: string }) {
  if (x.doi && !/^10\.48550\/arxiv\./.test(x.doi)) return `doi:${x.doi}`
  if (x.arxiv) return `arxiv:${x.arxiv}`
  if (x.doi) return `doi:${x.doi}`
  return `t:${normTitle(x.title)}`
}

function item(x: Omit<Item, 'key'>): Item {
  const arxiv = x.arxiv ?? /^10\.48550\/arxiv\.(.+)$/i.exec(x.doi ?? '')?.[1]?.toLowerCase()
  return { ...x, arxiv, key: keyOf({ ...x, arxiv }) }
}

/**
 * Remove duplicates: the same DOI (or arXiv id), or failing that the same
 * title once normalised. What one source lacks (an abstract, a free copy, a
 * citation count) is taken from another.
 */
export function dedupe(items: Item[]): Item[] {
  const byKey = new Map<string, Item>()
  const byTitle = new Map<string, Item>()
  for (const x of items) {
    const t = normTitle(x.title)
    const same = byKey.get(x.key) ?? (t.length > 12 ? byTitle.get(t) : undefined)
    if (!same) {
      const copy = { ...x, sources: [...x.sources], found: [...x.found] }
      byKey.set(x.key, copy)
      if (t.length > 12) byTitle.set(t, copy)
      continue
    }
    if (x.abstract.length > same.abstract.length) same.abstract = x.abstract
    same.doi ??= x.doi
    same.arxiv ??= x.arxiv
    same.openalex ??= x.openalex
    same.oa ??= x.oa
    same.year ??= x.year
    same.venue ??= x.venue
    if (!same.authors.length) same.authors = x.authors
    same.cited = Math.max(same.cited ?? 0, x.cited ?? 0) || undefined
    for (const s of x.sources) if (!same.sources.includes(s)) same.sources.push(s)
    for (const f of x.found) if (!same.found.includes(f)) same.found.push(f)
    byKey.set(x.key, same)
  }
  return [...new Set(byKey.values())]
}

/* ---------- OpenAlex: search, and citations both ways ---------- */

interface OaWork {
  id: string
  doi?: string | null
  title?: string | null
  publication_year?: number | null
  cited_by_count?: number
  abstract_inverted_index?: Record<string, number[]> | null
  open_access?: { is_oa?: boolean; oa_url?: string | null }
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string | null } | null } | null
  authorships?: { author?: { display_name?: string } }[]
  ids?: { arxiv?: string }
  referenced_works?: string[]
  type?: string
}

const OA_FIELDS = 'id,doi,title,publication_year,cited_by_count,abstract_inverted_index,open_access,primary_location,authorships,type'

/** OpenAlex keeps an abstract as word → positions; put the words back in order. */
function unInvert(ix: Record<string, number[]> | null | undefined) {
  if (!ix) return ''
  const words: string[] = []
  for (const [w, ps] of Object.entries(ix)) for (const p of ps) words[p] = w
  return words.filter(Boolean).join(' ')
}

const shortOa = (id: string) => id.replace('https://openalex.org/', '')

function fromOpenAlex(w: OaWork, found: string): Item | null {
  if (!w.title) return null
  const doi = cleanDoi(w.doi)
  return item({
    title: plain(w.title),
    abstract: plain(unInvert(w.abstract_inverted_index)),
    authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
    year: w.publication_year ?? undefined,
    venue: w.primary_location?.source?.display_name ?? undefined,
    url: doi ? `https://doi.org/${doi}` : (w.primary_location?.landing_page_url ?? w.id),
    doi,
    openalex: shortOa(w.id),
    oa: w.open_access?.is_oa ? (w.open_access.oa_url ?? undefined) : undefined,
    cited: w.cited_by_count,
    kind: 'paper',
    sources: ['openalex'],
    found: [found],
  })
}

async function openAlex(path: string, keys: Keys): Promise<OaWork[]> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await get(`https://api.openalex.org/${path}${keys.openalex ? `${sep}api_key=${encodeURIComponent(keys.openalex)}` : ''}`)
  if (res.status === 429) throw new Error('OpenAlex answered 429, too many requests: without a key it has a small daily budget per network (set OPENALEX_API_KEY for more)')
  if (!res.ok) throw new Error(`OpenAlex answered ${res.status}`)
  const d = (await res.json()) as { results?: OaWork[] } & OaWork
  return d.results ?? (d.id ? [d] : [])
}

/** Works whose title or abstract has the words, best matches first. */
export async function searchOpenAlex(q: string, n: number, keys: Keys = {}): Promise<Item[]> {
  const ws = await openAlex(`works?filter=title_and_abstract.search:${encodeURIComponent(q.replace(/[,:|]/g, ' '))}&per-page=${n}&select=${OA_FIELDS}`, keys)
  return ws.flatMap((w) => fromOpenAlex(w, `search: ${q}`) ?? [])
}

/** A seed as OpenAlex knows it, with its references: a DOI, an arXiv id, an OpenAlex id, or a doi.org / arxiv.org address. */
async function openAlexWork(given: string, keys: Keys): Promise<OaWork | null> {
  const g = given.trim()
  const arxiv = /(?:arxiv\.org\/(?:abs|pdf)\/|^arxiv:)?(\d{4}\.\d{4,5})(v\d+)?/i.exec(g)
  const doi = /(10\.\d{4,9}\/[^\s?#]+)/.exec(g)?.[1]
  const wid = /(?:openalex\.org\/)?(W\d{5,})$/i.exec(g)?.[1]
  const id = wid ? wid : doi ? `doi:${doi.replace(/\.pdf$/, '')}` : arxiv ? `doi:10.48550/arXiv.${arxiv[1]}` : null
  if (!id) return null
  try {
    return (await openAlex(`works/${id}?select=${OA_FIELDS},referenced_works`, keys))[0] ?? null
  } catch {
    return null
  }
}

/** The works a seed cites (backward), up to n, most cited first. */
async function references(w: OaWork, n: number, keys: Keys): Promise<Item[]> {
  const ids = (w.referenced_works ?? []).map(shortOa)
  const out: Item[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const batch = await openAlex(`works?filter=openalex_id:${ids.slice(i, i + 50).join('|')}&per-page=50&select=${OA_FIELDS}`, keys)
    out.push(...batch.flatMap((x) => fromOpenAlex(x, `cited by the seed "${plain(w.title ?? '')}"`) ?? []))
  }
  return out.sort((a, b) => (b.cited ?? 0) - (a.cited ?? 0)).slice(0, n)
}

/** The works that cite a seed (forward), up to n, most cited first. */
async function citedBy(w: OaWork, n: number, keys: Keys): Promise<Item[]> {
  const ws = await openAlex(`works?filter=cites:${shortOa(w.id)}&sort=cited_by_count:desc&per-page=${n}&select=${OA_FIELDS}`, keys)
  return ws.flatMap((x) => fromOpenAlex(x, `cites the seed "${plain(w.title ?? '')}"`) ?? [])
}

/* ---------- Semantic Scholar ---------- */

interface S2Paper {
  paperId: string
  title?: string
  abstract?: string | null
  year?: number | null
  venue?: string | null
  citationCount?: number
  url?: string
  externalIds?: { DOI?: string; ArXiv?: string }
  openAccessPdf?: { url?: string | null } | null
  authors?: { name: string }[]
}

/** Papers by relevance. Without a key it shares a small pool with everyone, and often answers 429 (busy). */
export async function searchSemanticScholar(q: string, n: number, keys: Keys = {}): Promise<Item[]> {
  const res = await get(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=title,abstract,year,venue,citationCount,url,externalIds,openAccessPdf,authors`, keys.semanticScholar ? { 'x-api-key': keys.semanticScholar } : {})
  if (res.status === 429) throw new Error('Semantic Scholar is busy for requests without a key (429)')
  if (!res.ok) throw new Error(`Semantic Scholar answered ${res.status}`)
  const d = (await res.json()) as { data?: S2Paper[] }
  return (d.data ?? []).flatMap((p) =>
    p.title
      ? [
          item({
            title: plain(p.title),
            abstract: plain(p.abstract),
            authors: (p.authors ?? []).map((a) => a.name),
            year: p.year ?? undefined,
            venue: p.venue || undefined,
            url: p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
            doi: cleanDoi(p.externalIds?.DOI),
            arxiv: p.externalIds?.ArXiv?.toLowerCase(),
            oa: p.openAccessPdf?.url || undefined,
            cited: p.citationCount,
            kind: 'paper',
            sources: ['semantic scholar'],
            found: [`search: ${q}`],
          }),
        ]
      : [],
  )
}

/* ---------- arXiv ---------- */

const tag = (xml: string, t: string) => new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(xml)?.[1] ?? ''

/** Preprints, every one free to read. The API answers in Atom. */
export async function searchArxiv(q: string, n: number): Promise<Item[]> {
  const words = q.replace(/[^\w\s-]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const res = await get(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(words.map((w) => `all:${w}`).join(' AND '))}&max_results=${n}`)
  if (!res.ok) throw new Error(`arXiv answered ${res.status}`)
  const xml = await res.text()
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const abs = plain(tag(e, 'id'))
    const id = /abs\/(.+?)(v\d+)?$/.exec(abs)?.[1]?.toLowerCase()
    return item({
      title: plain(tag(e, 'title')),
      abstract: plain(tag(e, 'summary')),
      authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => plain(m[1])),
      year: Number(tag(e, 'published').slice(0, 4)) || undefined,
      venue: 'arXiv',
      url: id ? `https://arxiv.org/abs/${id}` : abs,
      doi: cleanDoi(tag(e, 'arxiv:doi')),
      arxiv: id,
      oa: id ? `https://arxiv.org/pdf/${id}` : undefined,
      kind: 'paper',
      sources: ['arxiv'],
      found: [`search: ${q}`],
    })
  })
}

/* ---------- Crossref ---------- */

interface CrWork {
  DOI: string
  title?: string[]
  abstract?: string
  author?: { given?: string; family?: string; name?: string }[]
  issued?: { 'date-parts'?: (number | null)[][] }
  'container-title'?: string[]
  'is-referenced-by-count'?: number
  URL?: string
  type?: string
}

/** Everything with a DOI. Abstracts only where the publisher deposited one. */
export async function searchCrossref(q: string, n: number): Promise<Item[]> {
  const res = await get(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${n}&select=DOI,title,abstract,author,issued,container-title,is-referenced-by-count,URL,type`)
  if (!res.ok) throw new Error(`Crossref answered ${res.status}${res.status === 429 ? ', too many requests' : ''}`)
  const d = (await res.json()) as { message?: { items?: CrWork[] } }
  return (d.message?.items ?? []).flatMap((w) =>
    w.title?.[0]
      ? [
          item({
            title: plain(w.title[0]),
            abstract: plain(w.abstract).replace(/^abstract\s*/i, ''),
            authors: (w.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
            year: w.issued?.['date-parts']?.[0]?.[0] ?? undefined,
            venue: w['container-title']?.[0],
            url: `https://doi.org/${w.DOI}`,
            doi: cleanDoi(w.DOI),
            cited: w['is-referenced-by-count'],
            kind: 'paper',
            sources: ['crossref'],
            found: [`search: ${q}`],
          }),
        ]
      : [],
  )
}

/* ---------- feeds: Substacks and blogs ---------- */

/**
 * A feed's posts: RSS (a Substack's is name.substack.com/feed) or Atom. There is
 * no official Substack search, so a Substack comes in by its feed address.
 */
export async function readFeed(url: string, n = 30): Promise<Item[]> {
  const res = await get(url)
  if (!res.ok) throw new Error(`the feed answered ${res.status}`)
  const xml = await res.text()
  const site = plain(tag(xml, 'title'))
  const entries = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g), ...xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g)].map((m) => m[1])
  return entries.slice(0, n).flatMap((e) => {
    const title = plain(tag(e, 'title'))
    const link = plain(tag(e, 'link')) || /<link[^>]*href="([^"]+)"/.exec(e)?.[1] || ''
    if (!title || !link) return []
    const date = tag(e, 'pubDate') || tag(e, 'published') || tag(e, 'updated')
    const body = plain(tag(e, 'description') || tag(e, 'summary') || tag(e, 'content:encoded'))
    return [
      item({
        title,
        abstract: body.slice(0, 1500),
        authors: [plain(tag(e, 'dc:creator') || tag(e, 'name'))].filter(Boolean),
        year: Number(new Date(date).getFullYear()) || undefined,
        venue: site,
        url: link,
        oa: link,
        kind: /substack/i.test(url + xml.slice(0, 2000)) ? 'post' : 'article',
        sources: ['feed'],
        found: [`feed: ${url}`],
      }),
    ]
  })
}

/** A seed that is a web page (an article, a post), by its title and description, so it can be compared with the rest. */
async function pageSeed(url: string): Promise<Item | null> {
  const res = await get(url).catch(() => null)
  if (!res?.ok) return null
  const html = (await res.text()).slice(0, 200_000)
  const meta = (p: string) => new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`, 'i').exec(html)?.[1]
  const title = plain(meta('og:title') ?? tag(html, 'title'))
  if (!title) return null
  return item({ title, abstract: plain(meta('og:description') ?? meta('description') ?? ''), authors: [], url, kind: 'article', sources: ['web page'], found: ['seed'] })
}

/** The seeds, as items to compare with, and (for papers) their references and citations. */
export async function resolveSeeds(given: string[], keys: Keys = {}): Promise<{ seeds: Seed[]; works: OaWork[] }> {
  const seeds: Seed[] = []
  const works: OaWork[] = []
  for (const g of given) {
    const w = await openAlexWork(g, keys)
    if (w) {
      works.push(w)
      seeds.push({ given: g, item: fromOpenAlex(w, 'seed') })
      continue
    }
    if (/^https?:\/\//.test(g)) {
      const p = await pageSeed(g)
      seeds.push(p ? { given: g, item: p } : { given: g, item: null, problem: "couldn't read that page" })
    } else seeds.push({ given: g, item: null, problem: 'not a DOI, an arXiv id, an OpenAlex id or a web address' })
  }
  return { seeds, works }
}

/** Follow each paper seed's citations both ways, through OpenAlex. */
export async function followCitations(works: OaWork[], n: number, keys: Keys = {}): Promise<Item[]> {
  const out: Item[] = []
  for (const w of works) out.push(...(await references(w, n, keys)), ...(await citedBy(w, n, keys)))
  return out
}

export type SourceName = 'openalex' | 'semantic scholar' | 'arxiv' | 'crossref'
export const SOURCES: SourceName[] = ['openalex', 'semantic scholar', 'arxiv', 'crossref']

export function search(source: SourceName, q: string, n: number, keys: Keys = {}): Promise<Item[]> {
  if (source === 'openalex') return searchOpenAlex(q, n, keys)
  if (source === 'semantic scholar') return searchSemanticScholar(q, n, keys)
  if (source === 'arxiv') return searchArxiv(q, n)
  return searchCrossref(q, n)
}

/* ---------- what the models are asked ---------- */

/** The model writes searches, as a JSON list, and nothing else. */
export const QUERY_SCHEMA = { type: 'object', properties: { queries: { type: 'array', items: { type: 'string' } } }, required: ['queries'] }

export function queryPrompt(topic: string, seeds: Item[], n: number) {
  return [
    `Write ${n} short search queries (3 to 6 words each) for finding academic papers and articles about this topic in a scholarly search engine.`,
    `Topic: ${topic}`,
    ...(seeds.length ? ['Papers the researcher already knows are relevant:', ...seeds.map((s) => `- ${s.title}`)] : []),
    'Vary them: different words for the same idea, narrower and wider, and the fields it touches. Plain keywords, no quotation marks, no names of authors, no years.',
  ].join('\n')
}

/** The judge's standing line: the same for the stock model and a judge trained on the student's decisions. */
export const judgeSystem = (topic: string) => `You judge whether a paper or article is relevant to a research topic. Topic: ${topic}. Keep it only if someone researching this topic should read it. Answer "keep" or "skip", then a colon and one short sentence (under 25 words) saying why.`

export const judgeInput = (x: Pick<Item, 'title' | 'abstract' | 'year' | 'venue'>) => `Title: ${x.title}${x.year ? `\nYear: ${x.year}` : ''}${x.venue ? `\nVenue: ${x.venue}` : ''}\nAbstract: ${x.abstract ? x.abstract.slice(0, 1800) : '(none: only the title is known)'}`

export const DECISION_SCHEMA = { type: 'object', properties: { decision: { type: 'string', enum: ['keep', 'skip'] }, reason: { type: 'string' } }, required: ['decision', 'reason'] }

/** "keep: …" or {"decision": "keep", "reason": "…"} → the decision and its reason; null when it is neither. */
export function parseDecision(text: string): { decision: 'keep' | 'skip'; reason: string } | null {
  try {
    const j = JSON.parse(text) as { decision?: string; reason?: string }
    if (j.decision === 'keep' || j.decision === 'skip') return { decision: j.decision, reason: (j.reason ?? '').trim() }
  } catch {
    // not JSON: a trained judge answers in a line
  }
  const m = /^\s*\**(keep|skip)\**\s*[:.\-–—]?\s*([\s\S]*)$/i.exec(text.replace(/<think>[\s\S]*?<\/think>/g, ''))
  return m ? { decision: m[1].toLowerCase() as 'keep' | 'skip', reason: m[2].trim().split('\n')[0] } : null
}

/** A summary is claims, each with the words it rests on. */
export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { claims: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, quote: { type: 'string' } }, required: ['claim', 'quote'] } } },
  required: ['claims'],
}

export const summaryPrompt = (topic: string, x: Item) =>
  [
    `Summarise what this ${x.kind === 'paper' ? 'paper' : 'piece'} offers someone researching: ${topic}.`,
    'Write at most 3 claims. Each claim is one short sentence, with a quote: words copied exactly from the text below that support it. Use only the text below.',
    '',
    `Title: ${x.title}`,
    `Text: ${x.abstract}`,
  ].join('\n')

const squeeze = (s: string) => s.toLowerCase().replace(/[“”"‘’'`]/g, '').replace(/\s+/g, ' ').trim()

/** Keep only the claims whose quote is really in the text: a model can misquote. */
export function checkedClaims(claims: { claim: string; quote: string }[], text: string) {
  const t = squeeze(text)
  return claims.filter((c) => c.claim.trim() && c.quote.trim().length >= 12 && t.includes(squeeze(c.quote)))
}

/* ---------- what workspace/research/<name>/ holds ---------- */

export interface ResearchManifest {
  name: string
  kind: 'research'
  created: string
  license: string
  inputs: string[]
  command: string[]
  topic: string
  seeds: string[]
  feeds: string[]
  queries: string[]
  runs: { at: string; found: number; added: number }[]
}

/** An item in the library: everything ever found for this topic, with the run that first found it. */
export type Seen = Item & { first: string; run: number }

export interface Decision {
  /** similarity to the seeds and topic, 0–1 */
  sim?: number
  /** the screen's answer: by the model, or by similarity alone when it fell below the cut */
  screen?: { decision: 'keep' | 'skip'; reason: string; by: string }
  /** the student's own, which wins */
  student?: { decision: 'keep' | 'skip'; reason?: string; at: string }
  summary?: { claim: string; quote: string; from: string }[]
}

export const finalOf = (d: Decision | undefined) => d?.student?.decision ?? d?.screen?.decision

/* ---------- comparing, and the outputs ---------- */

export function cosine(a: number[], b: number[]) {
  let d = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return d / (Math.sqrt(na * nb) || 1)
}

/** The text an item is compared by (nomic-embed-text wants the task named first). */
export const embedText = (x: Pick<Item, 'title' | 'abstract'>) => `search_document: ${x.title}. ${x.abstract.slice(0, 1500)}`

const bibKey = (x: Item, used: Set<string>) => {
  const who = normTitle(x.authors[0]?.split(' ').pop() ?? 'anon').replace(/ /g, '') || 'anon'
  const word = normTitle(x.title).split(' ').find((w) => w.length > 3) ?? 'item'
  let k = `${who}${x.year ?? ''}${word}`
  for (let i = 2; used.has(k); i++) k = `${who}${x.year ?? ''}${word}${i}`
  used.add(k)
  return k
}
const bibEsc = (s: string) => s.replace(/[{}\\]/g, '').replace(/([&%$#_])/g, '\\$1')

/** BibTeX for a list of items, from what the sources said (never from a model). */
export function bibtex(items: Item[]) {
  const used = new Set<string>()
  return items
    .map((x) => {
      const kind = x.kind === 'paper' ? (x.arxiv && !x.doi ? 'misc' : 'article') : 'online'
      const f: [string, string | undefined][] = [
        ['title', x.title],
        ['author', x.authors.length ? x.authors.join(' and ') : undefined],
        ['year', x.year ? String(x.year) : undefined],
        [kind === 'article' ? 'journal' : 'howpublished', x.venue],
        ['doi', x.doi],
        ['eprint', x.arxiv],
        ['archivePrefix', x.arxiv ? 'arXiv' : undefined],
        ['url', x.url],
      ]
      return `@${kind}{${bibKey(x, used)},\n${f
        .filter(([, v]) => v)
        // identifiers and addresses go in as they are: BibTeX reads them verbatim
        .map(([k, v]) => `  ${k} = {${['doi', 'url', 'eprint'].includes(k) ? v!.replace(/[{}]/g, '') : bibEsc(v!)}}`)
        .join(',\n')}\n}`
    })
    .join('\n\n')
}
