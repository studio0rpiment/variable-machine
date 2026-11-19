/**
 * The research bot's searching, in one place: the helper's `papers` commands
 * and a package's research.js both use it. Search code finds real items, from
 * OpenAlex, Semantic Scholar, arXiv, Crossref, RSS feeds, the Internet
 * Archive (its catalogue and its full text), the Library of Congress's
 * newspapers and US patents (Google Patents pages, fetched by number only); a
 * model only writes the searches, screens and summarises. Nothing here asks a
 * model for a citation, and no field (humanities, sciences, technology) comes
 * from a model: it is read from the source's own label.
 *
 * Plain fetch and no Node modules, so it bundles for a web page and for Node.
 */

/** The three fields searches can be written for, paired. An item's fields come from its source's labels (see fieldsOf). */
export type Field = 'humanities' | 'sciences' | 'technology'
export const FIELDS: Field[] = ['humanities', 'sciences', 'technology']

/** One search that found an item: where, with what words, at which address (keys taken out), and when. */
export interface Hit {
  source: string
  search: string
  address: string
  at: string
}

/** Words copied from the item's own text, and where in it they are. */
export interface Quote {
  text: string
  where: string
}

export interface Item {
  /** what it is known by here: doi:…, arxiv:…, patent:US…, ia:<archive identifier>, or t:<normalised title> */
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
  /** a US patent's number, as US661619 */
  patent?: string
  /** an Internet Archive identifier: archive.org/details/<it> */
  archive?: string
  openalex?: string
  /** a copy anyone can read, when there is one */
  oa?: string
  /** how many works cite it, by the source that counted most */
  cited?: number
  kind: 'paper' | 'article' | 'post' | 'patent' | 'book' | 'newspaper'
  /** which sources had it */
  sources: string[]
  /** how it was found: a search, a seed's references or citations, a feed */
  found: string[]
  /** the sources' own subject labels, as "OpenAlex: Arts and Humanities" */
  labels?: string[]
  /** the fields those labels belong to; two or more make it a bridge */
  fields?: Field[]
  /** every search that found it */
  hits?: Hit[]
  /** words from its own text, with where they are: full-text search snippets, a newspaper page, your PDF's pages */
  quotes?: Quote[]
  /** your own copy, in the workspace (papers add): uploads/<file>.pdf */
  local?: string
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
  /** later: EPO Open Patent Services and Europeana, each with a free key */
  epoKey?: string
  epoSecret?: string
  europeana?: string
}

/** An address as it can be shown and kept: any key taken out. */
export const publicAddress = (url: string) => url.replace(/([?&](?:api_key|apikey|wskey|key)=)[^&]*/gi, '$1…')

/** Every search made, in order, as it is made: the caller takes them (splice) to keep a file of the searches. */
export const searchesMade: Hit[] = []
const hit = (source: string, search: string, url: string): Hit => {
  const h = { source, search, address: publicAddress(url), at: new Date().toISOString() }
  searchesMade.push(h)
  return h
}

/** A line of searches.jsonl: one search, its address and date, and what it found. */
export interface Searched extends Partial<Hit> {
  source: string
  search: string
  at: string
  found: number
  error?: string
}

/**
 * Some sources ask for a pace: the Library of Congress blocks for an hour past
 * 20 requests a minute. Each host waits its gap since its last request.
 */
const lastAt = new Map<string, number>()
async function paced(host: string, gap: number) {
  const wait = (lastAt.get(host) ?? 0) + gap - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastAt.set(host, Date.now())
}

/**
 * A GET with a time limit, so a source that never answers can't stall the
 * search. Browsers refuse to set User-Agent; it is ignored there.
 */
export async function get(url: string, headers: Record<string, string> = {}, again = true, timeout = TIMEOUT): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout) // a network request that never answers is the one thing that can't be waited out
  let res: Response
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: ctl.signal })
  } finally {
    clearTimeout(t)
  }
  // 429 is "too many, too fast": the free sources ask for a pause, so wait once and ask again
  if (res.status === 429 && again) {
    await new Promise((r) => setTimeout(r, 3000))
    return get(url, headers, false, timeout)
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

function keyOf(x: { doi?: string; arxiv?: string; patent?: string; archive?: string; title: string }) {
  if (x.doi && !/^10\.48550\/arxiv\./.test(x.doi)) return `doi:${x.doi}`
  if (x.arxiv) return `arxiv:${x.arxiv}`
  if (x.doi) return `doi:${x.doi}`
  if (x.patent) return `patent:${x.patent}`
  if (x.archive) return `ia:${x.archive}`
  return `t:${normTitle(x.title)}`
}

function item(x: Omit<Item, 'key'>): Item {
  const arxiv = x.arxiv ?? /^10\.48550\/arxiv\.(.+)$/i.exec(x.doi ?? '')?.[1]?.toLowerCase()
  const labels = x.labels?.length ? [...new Set(x.labels)] : undefined
  const fields = labels ? fieldsOf(labels) : undefined
  return { ...x, arxiv, ...(labels && { labels }), ...(fields?.length && { fields }), key: keyOf({ ...x, arxiv }) }
}

const union = <T>(a: T[] | undefined, b: T[] | undefined, same: (x: T, y: T) => boolean = (x, y) => x === y) => {
  if (!a?.length && !b?.length) return undefined
  const out = [...(a ?? [])]
  for (const y of b ?? []) if (!out.some((x) => same(x, y))) out.push(y)
  return out
}

/** One item found twice becomes one: what one source lacks (an abstract, a free copy, a citation count, a label) is taken from the other, and every place it was found is kept. */
export function merge<T extends Item>(same: T, x: Item): T {
  if (x.abstract.length > same.abstract.length) same.abstract = x.abstract
  same.doi ??= x.doi
  same.arxiv ??= x.arxiv
  same.patent ??= x.patent
  same.archive ??= x.archive
  same.openalex ??= x.openalex
  same.oa ??= x.oa
  same.year ??= x.year
  same.venue ??= x.venue
  same.local ??= x.local
  if (!same.authors.length) same.authors = x.authors
  same.cited = Math.max(same.cited ?? 0, x.cited ?? 0) || undefined
  same.sources = union(same.sources, x.sources)!
  same.found = union(same.found, x.found)!
  const labels = union(same.labels, x.labels)
  if (labels) (same.labels = labels), (same.fields = fieldsOf(labels))
  const hits = union(same.hits, x.hits, (a, b) => a.address === b.address)
  if (hits) same.hits = hits
  const quotes = union(same.quotes, x.quotes, (a, b) => a.text === b.text)
  if (quotes) same.quotes = quotes.slice(0, 8)
  return same
}

/**
 * Remove duplicates: the same DOI, arXiv id or patent number, or failing that
 * the same title once normalised. An item found in several sources is one
 * entry, with every place it was found.
 */
export function dedupe(items: Item[]): Item[] {
  const byKey = new Map<string, Item>()
  const byTitle = new Map<string, Item>()
  for (const x of items) {
    const t = normTitle(x.title)
    const same = byKey.get(x.key) ?? (x.patent ? byKey.get(`patent:${x.patent}`) : undefined) ?? (t.length > 12 ? byTitle.get(t) : undefined)
    if (!same) {
      const copy = { ...x, sources: [...x.sources], found: [...x.found] }
      byKey.set(x.key, copy)
      if (t.length > 12) byTitle.set(t, copy)
      continue
    }
    byKey.set(x.key, merge(same, x))
  }
  return [...new Set(byKey.values())]
}

/* ---------- fields, from the sources' own labels ---------- */

/**
 * Which of the three fields a source's label belongs to. A fixed table, so a
 * student can read exactly how it is decided; the model has no part in it.
 * The humanities here take in the social sciences (OpenAlex's domain), except
 * psychology, which goes with the sciences.
 */
const TECHNOLOGY = /^(engineering|chemical engineering|computer science|energy|patent)$/i
const HUMANITIES = /^(arts and humanities|social sciences|art|history|philosophy|linguistics|sociology|political science|economics|business|education|law|geography|business, management and accounting|decision sciences|economics, econometrics and finance)$/i
const SCIENCES = /^(physical sciences|life sciences|health sciences|physics|chemistry|biology|medicine|mathematics|materials science|environmental science|geology|agricultural and food sciences|psychology|neuroscience|earth and planetary sciences)$/i

export function fieldsOf(labels: string[]): Field[] {
  const out = new Set<Field>()
  for (const l of labels) {
    // "OpenAlex: Physics and Astronomy (Physical Sciences)": the field, then its domain, which decides when the field alone doesn't
    const [, word = '', domain = ''] = /^[^:]+:\s*(.*?)\s*(?:\(([^)]*)\))?$/.exec(l) ?? []
    // arXiv's categories: cs.SD, eess.AS, physics.class-ph, q-bio.NC, econ.GN
    const ax = /^arXiv:\s*([a-z-]+)\./i.exec(l)?.[1]?.toLowerCase()
    if (ax) out.add(ax === 'cs' || ax === 'eess' ? 'technology' : ax === 'econ' ? 'humanities' : 'sciences')
    else if (TECHNOLOGY.test(word)) out.add('technology')
    else if (SCIENCES.test(word)) out.add('sciences')
    else if (HUMANITIES.test(word) || HUMANITIES.test(domain)) out.add('humanities')
    else if (SCIENCES.test(domain)) out.add('sciences')
  }
  return FIELDS.filter((f) => out.has(f))
}

/** An item whose labels are in two or more fields. */
export const isBridge = (x: Pick<Item, 'fields'>) => (x.fields?.length ?? 0) >= 2

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
  topics?: { field?: { display_name?: string }; domain?: { display_name?: string } }[]
}

const OA_FIELDS = 'id,doi,title,publication_year,cited_by_count,abstract_inverted_index,open_access,primary_location,authorships,type,topics'

/** OpenAlex keeps an abstract as word → positions; put the words back in order. */
function unInvert(ix: Record<string, number[]> | null | undefined) {
  if (!ix) return ''
  const words: string[] = []
  for (const [w, ps] of Object.entries(ix)) for (const p of ps) words[p] = w
  return words.filter(Boolean).join(' ')
}

const shortOa = (id: string) => id.replace('https://openalex.org/', '')

function fromOpenAlex(w: OaWork, found: string, h?: Hit): Item | null {
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
    labels: (w.topics ?? []).flatMap((t) => (t.field?.display_name ? [`OpenAlex: ${t.field.display_name}${t.domain?.display_name ? ` (${t.domain.display_name})` : ''}`] : [])),
    ...(h && { hits: [h] }),
  })
}

async function openAlex(path: string, keys: Keys): Promise<OaWork[]> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await get(`https://api.openalex.org/${path}${keys.openalex ? `${sep}api_key=${encodeURIComponent(keys.openalex)}` : ''}`)
  if (res.status === 429) throw new Error('OpenAlex answered 429, too many requests: without a key it has a small daily budget per network (a free key raises it: papers keys)')
  if (!res.ok) throw new Error(`OpenAlex answered ${res.status}`)
  const d = (await res.json()) as { results?: OaWork[] } & OaWork
  return d.results ?? (d.id ? [d] : [])
}

/** Works whose title or abstract has the words, best matches first. */
export async function searchOpenAlex(q: string, n: number, keys: Keys = {}): Promise<Item[]> {
  const p = `works?filter=title_and_abstract.search:${encodeURIComponent(q.replace(/[,:|]/g, ' '))}&per-page=${n}&select=${OA_FIELDS}`
  const ws = await openAlex(p, keys)
  const h = hit('openalex', q, `https://api.openalex.org/${p}`)
  return ws.flatMap((w) => fromOpenAlex(w, `search: ${q}`, h) ?? [])
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
  s2FieldsOfStudy?: { category: string; source?: string }[] | null
}

/** Papers by relevance. Without a key it shares a small pool with everyone, and often answers 429 (busy). */
export async function searchSemanticScholar(q: string, n: number, keys: Keys = {}): Promise<Item[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=title,abstract,year,venue,citationCount,url,externalIds,openAccessPdf,authors,s2FieldsOfStudy`
  const res = await get(url, keys.semanticScholar ? { 'x-api-key': keys.semanticScholar } : {})
  const h = hit('semantic scholar', q, url)
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
            labels: (p.s2FieldsOfStudy ?? []).map((f) => `Semantic Scholar: ${f.category}`),
            hits: [h],
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
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(words.map((w) => `all:${w}`).join(' AND '))}&max_results=${n}`
  const res = await get(url)
  const h = hit('arxiv', q, url)
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
      labels: [...e.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => `arXiv: ${m[1]}`),
      hits: [h],
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
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${n}&select=DOI,title,abstract,author,issued,container-title,is-referenced-by-count,URL,type`
  const res = await get(url)
  const h = hit('crossref', q, url)
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
            hits: [h],
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
        hits: [hit('feed', 'every post', url)],
      }),
    ]
  })
}

/* ---------- the Internet Archive: its catalogue, and its full text ---------- */

interface IaDoc {
  identifier: string
  title?: string | string[]
  year?: number | string
  date?: string
  creator?: string | string[]
  description?: string | string[]
  subject?: string | string[]
}
const one = (v: string | string[] | number | undefined) => (Array.isArray(v) ? v[0] : v)
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : [])
const iaYear = (v: number | string | undefined) => Number(String(v ?? '').slice(0, 4)) || undefined

/**
 * Texts in the Internet Archive whose catalogue entry (title, description,
 * subject) has the words: books, journals, trade press, the Patent Office's
 * Official Gazette and the British Abridgments of specifications.
 */
export async function searchArchive(q: string, n: number): Promise<Item[]> {
  const words = q.replace(/[^\w\s-]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${words.join(' AND ')}) AND mediatype:texts`)}&fl[]=identifier&fl[]=title&fl[]=year&fl[]=date&fl[]=creator&fl[]=description&fl[]=subject&rows=${n}&output=json`
  const res = await get(url)
  if (!res.ok) throw new Error(`the Internet Archive answered ${res.status}`)
  const d = (await res.json()) as { response?: { docs?: IaDoc[] } }
  const h = hit('internet archive', q, url)
  return (d.response?.docs ?? []).flatMap((x) => {
    const title = plain(String(one(x.title) ?? ''))
    if (!title) return []
    const page = `https://archive.org/details/${x.identifier}`
    return [
      item({
        title,
        abstract: plain(many(x.description).join(' ')).slice(0, 1500),
        authors: many(x.creator).map(plain),
        year: iaYear(x.year ?? x.date),
        venue: 'Internet Archive',
        url: page,
        archive: x.identifier,
        oa: page,
        kind: 'book',
        sources: ['internet archive'],
        found: [`search: ${q}`],
        hits: [h],
      }),
    ]
  })
}

interface FtsHit {
  highlight?: { text?: string[] }
  fields?: { identifier?: string[]; meta_title?: string[]; meta_year?: number[]; meta_creator?: string[]; meta_date?: string[]; meta_mediatype?: string[] }
}

/**
 * The Internet Archive's full-text search: the words anywhere in a text's
 * scanned pages, with the passages they are in. Undocumented (the address its
 * own site uses), so it can change or stop without notice; a failure here
 * stops only this source.
 */
export async function searchArchiveText(q: string, n: number): Promise<Item[]> {
  const url = `https://be-api.us.archive.org/ia-pub-fts-api?q=${encodeURIComponent(q)}&size=${n}`
  const res = await get(url)
  if (!res.ok) throw new Error(`the Internet Archive's full-text search answered ${res.status} (it is undocumented, and may have changed)`)
  let d: { hits?: { hits?: FtsHit[] } }
  try {
    d = (await res.json()) as typeof d
  } catch {
    throw new Error("the Internet Archive's full-text search didn't answer in JSON (it is undocumented, and may have changed)")
  }
  const h = hit('internet archive full text', q, url)
  return (d.hits?.hits ?? []).flatMap((x) => {
    const id = x.fields?.identifier?.[0]
    const title = plain(x.fields?.meta_title?.[0] ?? '')
    if (!id || !title) return []
    const page = `https://archive.org/details/${id}`
    // the passages, with the matched words marked {{{so}}}: the marks out
    const passages = (x.highlight?.text ?? []).map((t) => t.replace(/\{\{\{|\}\}\}/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean)
    const inside = `${page}?q=${encodeURIComponent(q)}`
    return [
      item({
        title,
        abstract: passages.join(' … ').slice(0, 1500),
        authors: (x.fields?.meta_creator ?? []).map(plain),
        year: x.fields?.meta_year?.[0] ?? iaYear(x.fields?.meta_date?.[0]),
        venue: 'Internet Archive',
        url: page,
        archive: id,
        oa: page,
        kind: 'book',
        sources: ['internet archive full text'],
        found: [`full text: ${q}`],
        quotes: passages.slice(0, 4).map((text) => ({ text, where: `the scanned text of "${title}"; its page: search inside at ${inside}` })),
        hits: [h],
      }),
    ]
  })
}

/* ---------- the Library of Congress's newspapers (Chronicling America) ---------- */

interface LocResult {
  title?: string
  date?: string
  url?: string
  id?: string
  description?: string[]
  partof_title?: string[]
  word_coordinates_url?: string
}

/** 20 requests a minute at most, or the Library of Congress blocks for an hour: one every 3.1 seconds, across its hosts. */
const LOC_GAP = 3100

/**
 * US newspaper pages, 1756–1963, searched word by word in their scanned
 * text. Each page's own passage where the words are is fetched for the first
 * few (the page's text is long; the passage is the quote, with where it is).
 */
export async function searchNewspapers(q: string, n: number, passages = 2): Promise<Item[]> {
  const url = `https://www.loc.gov/collections/chronicling-america/?q=${encodeURIComponent(q)}&fo=json&c=${n}&at=results`
  await paced('loc.gov', LOC_GAP)
  // the Library of Congress is slow to answer a search: a minute, not 20 seconds
  const res = await get(url, {}, false, 60_000).catch((err: Error) => {
    throw new Error(err.name === 'AbortError' ? 'the Library of Congress gave no answer in a minute' : err.message)
  })
  if (res.status === 429) throw new Error('the Library of Congress answered 429: past 20 requests a minute it blocks for an hour')
  if (!res.ok) throw new Error(`the Library of Congress answered ${res.status}`)
  const d = (await res.json()) as { results?: LocResult[] }
  const h = hit('library of congress newspapers', q, url)
  const out: Item[] = []
  for (const [i, x] of (d.results ?? []).entries()) {
    if (!x.title || !x.url) continue
    // "Image 2 of New-York tribune (New York [N.Y.]), October 16, 1910"
    const m = /^Image (\d+) of (.+?), ([A-Z][a-z]+ \d{1,2}, \d{4})$/.exec(x.title)
    const paper = m?.[2] ?? x.partof_title?.[0] ?? 'a newspaper'
    const page = x.url.replace(/[?&]q=[^&]*/, '').replace(/\?$/, '')
    let quotes: Quote[] | undefined
    if (i < passages && x.word_coordinates_url) {
      try {
        await paced('loc.gov', LOC_GAP)
        const s = await get(x.word_coordinates_url, {}, false, 30_000)
        const j = s.ok ? ((await s.json()) as Record<string, { relevant_snippet?: string }>) : {}
        const snip = Object.values(j)[0]?.relevant_snippet
        if (snip) quotes = [{ text: snip.replace(/\[\[\/?tag\]\]/g, '').replace(/^\.\.\.\s*|\s*\.\.\.$/g, '').replace(/\s+/g, ' ').trim().slice(0, 600), where: `${paper}, ${m?.[3] ?? x.date}, image ${m?.[1] ?? '?'}: ${page}` }]
      } catch {
        // the passage is a nicety: the page is found without it
      }
    }
    out.push(
      item({
        title: x.title,
        abstract: plain((x.description ?? []).join(' ')).slice(0, 1500),
        authors: [],
        year: Number((x.date ?? '').slice(0, 4)) || undefined,
        venue: paper,
        url: page,
        oa: page,
        kind: 'newspaper',
        sources: ['library of congress newspapers'],
        found: [`newspapers: ${q}`],
        ...(quotes && { quotes }),
        hits: [h],
      }),
    )
  }
  return out
}

/* ---------- US patents, by number ---------- */

/**
 * Patent numbers in a text: "Patent No. 661,619", "pat. no. 1,012,345". OCR
 * reads 1 as l, I or |, and 0 as O, so those are read back as digits. The
 * numbers are taken as US ones; a page that doesn't exist on Google Patents
 * is dropped.
 */
export function patentNumbers(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\bpat(?:ent|\.)?\s*\(?\s*(?:no\.?|number|#)\s*([0-9lI|O]{1,3}(?:[,.][0-9lI|O]{3}){1,2}|[0-9]{5,8})(?![0-9])/gi)) {
    const n = Number(m[1].replace(/[lI|]/g, '1').replace(/O/g, '0').replace(/[,.]/g, ''))
    if (n >= 1 && n < 13_000_000) out.add(`US${n}`)
  }
  return [...out]
}

/** A number as given: US661619, US 661,619, 661619 → US661619. */
export const patentNumber = (given: string) => {
  const n = given.toUpperCase().replace(/[\s,.]/g, '').replace(/^US/, '').replace(/[A-Z]\d?$/, '')
  return /^\d{1,8}$/.test(n) ? `US${Number(n)}` : null
}

/**
 * A US patent's page on Google Patents, fetched by its number: title, dates,
 * inventors, and the start of its description (Google's OCR of the scan).
 * Google's robots.txt forbids automated search there, so nothing is searched:
 * the numbers come from the archives' and newspapers' text, or from you.
 */
export async function fetchPatent(number: string, found: string): Promise<Item | null> {
  for (const kind of ['A', '']) {
    const url = `https://patents.google.com/patent/${number}${kind}/en`
    await paced('patents.google.com', 1200)
    const res = await get(url)
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`Google Patents answered ${res.status}`)
    const html = await res.text()
    const meta = (p: string) => [...html.matchAll(new RegExp(`<meta name="${p}" content="([^"]*)"`, 'g'))].map((m) => plain(m[1]))
    const title = plain(/<title>[^-]*-\s*([\s\S]*?)\s*-\s*Google Patents<\/title>/.exec(html)?.[1] ?? '').replace(/\.$/, '')
    if (!title) return null
    const dates = meta('DC.date')
    const section = (k: string) => plain(new RegExp(`<section itemprop="${k}"[^>]*>([\\s\\S]*?)</section>`).exec(html)?.[1] ?? '').replace(/^(Description|Claims|Abstract)\s*/, '')
    const text = section('abstract') || section('description') || section('claims')
    return item({
      title,
      abstract: text.slice(0, 1500),
      authors: meta('DC.contributor').filter((c) => c && c !== 'Individual'),
      year: Number((dates.at(-1) ?? '').slice(0, 4)) || undefined,
      venue: `US patent ${number.slice(2)}${dates.length > 1 ? `, granted ${dates.at(-1)}` : ''}`,
      url,
      patent: number,
      oa: meta('citation_pdf_url')[0] || url,
      kind: 'patent',
      sources: ['google patents'],
      found: [found],
      labels: ['Google Patents: patent'],
      ...(text && { quotes: [{ text: text.slice(0, 300), where: `the start of the patent's text (Google's OCR of the scan): ${url}` }] }),
      hits: [hit('google patents', `the number ${number}`, url)],
    })
  }
  return null
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

/**
 * The sources besides scholarship, each its own flag on papers search, each
 * searched with the same searches: the archive's catalogue and full text, the
 * newspapers, and then US patents, whose numbers are read from what the
 * archive and the newspapers found (and from --patent).
 */
export type More = 'archive' | 'newspapers' | 'patents'
export async function searchMore(more: More[], queries: string[], per: number, opts: { patents?: string[]; say: (s: string) => void; stopped?: () => boolean; log: Searched[] }): Promise<Item[]> {
  const found: Item[] = []
  const run = async (source: string, search: string, job: () => Promise<Item[]>) => {
    if (opts.stopped?.()) throw new Error('stopped')
    searchesMade.splice(0)
    try {
      const xs = await job()
      const h = searchesMade.splice(0)
      opts.log.push({ ...(h[0] ?? {}), source, search, at: h[0]?.at ?? new Date().toISOString(), found: xs.length })
      found.push(...xs)
      return xs.length
    } catch (err) {
      opts.log.push({ source, search, at: new Date().toISOString(), found: 0, error: (err as Error).message })
      throw err
    }
  }
  const each = async (source: string, job: (q: string) => Promise<Item[]>) => {
    let n = 0
    for (const q of queries) {
      try {
        n += await run(source, q, () => job(q))
      } catch (err) {
        if ((err as Error).message === 'stopped') throw err
        opts.say(`    ${source}: ${(err as Error).message}; the rest of its searches are skipped`)
        break
      }
    }
    opts.say(`  ${source.padEnd(17)} ${n} found`)
  }
  if (more.includes('archive')) {
    await each('internet archive', (q) => searchArchive(q, per))
    await each('archive full text', (q) => searchArchiveText(q, per))
  }
  if (more.includes('newspapers')) await each('newspapers', (q) => searchNewspapers(q, Math.min(per, 20)))
  if (more.includes('patents')) {
    // the numbers: given, and read from the archive's and newspapers' passages
    const from = new Map<string, string>()
    for (const n of opts.patents ?? []) from.set(n, 'the number you gave')
    for (const x of found)
      for (const q of [...(x.quotes ?? []).map((q) => q.text), x.abstract])
        for (const n of patentNumbers(q)) if (!from.has(n)) from.set(n, `its number, in "${x.title.slice(0, 80)}" (${x.url})`)
    const numbers = [...from.keys()].slice(0, Math.max(per * 2, (opts.patents ?? []).length))
    let n = 0
    for (const num of numbers) {
      try {
        n += await run('google patents', num, async () => {
          const p = await fetchPatent(num, from.get(num)!)
          return p ? [p] : []
        })
      } catch (err) {
        if ((err as Error).message === 'stopped') throw err
        opts.say(`    google patents: ${(err as Error).message}; the rest are skipped`)
        break
      }
    }
    opts.say(`  ${'us patents'.padEnd(17)} ${n} of ${numbers.length} numbers found${from.size > numbers.length ? ` (${from.size - numbers.length} more numbers not fetched)` : ''}`)
  }
  return found
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

/** What each field's searches are written for: the words the writer model is given. */
export const FIELD_WORDS: Record<Field, string> = {
  humanities: 'the humanities and social sciences: history, art, music, philosophy, media studies',
  sciences: 'the sciences: physics, acoustics, physiology, psychology',
  technology: 'technology: engineering, computer science, inventions and patents',
}

export function queryPrompt(topic: string, seeds: Item[], n: number, field?: Field) {
  return [
    `Write ${n} short search queries (3 to 6 words each) for finding academic papers and articles about this topic in a scholarly search engine.`,
    `Topic: ${topic}`,
    ...(seeds.length ? ['Papers the researcher already knows are relevant:', ...seeds.map((s) => `- ${s.title}`)] : []),
    field
      ? `Write every one of them for finding work in ${FIELD_WORDS[field]}: the words people in that field would use for this topic. Vary them: narrower and wider. Plain keywords, no quotation marks, no names of authors, no years.`
      : 'Vary them: different words for the same idea, narrower and wider, and the fields it touches. Plain keywords, no quotation marks, no names of authors, no years.',
  ].join('\n')
}

/** The judge's standing line: the same for the stock model and a judge trained on the student's decisions. */
export const judgeSystem = (topic: string) => `You judge whether a paper or article is relevant to a research topic. Topic: ${topic}. Keep it only if someone researching this topic should read it. Answer "keep" or "skip", then a colon and one short sentence (under 25 words) saying why.`

export const judgeInput = (x: Pick<Item, 'title' | 'abstract' | 'year' | 'venue'> & { kind?: Item['kind'] }) =>
  `Title: ${x.title}${x.year ? `\nYear: ${x.year}` : ''}${x.venue ? `\nVenue: ${x.venue}` : ''}\n${x.kind === 'book' || x.kind === 'newspaper' ? 'Passages' : x.kind === 'patent' ? 'Text' : 'Abstract'}: ${x.abstract ? x.abstract.slice(0, 1800) : '(none: only the title is known)'}`

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

export const summaryPrompt = (topic: string, x: Item, text = x.abstract) =>
  [
    `Summarise what this ${x.kind === 'paper' ? 'paper' : x.kind === 'patent' ? 'patent' : 'piece'} offers someone researching: ${topic}.`,
    'Write at most 3 claims. Each claim is one short sentence, with a quote: words copied exactly from the text below that support it. Use only the text below.',
    '',
    `Title: ${x.title}`,
    `Text: ${text}`,
  ].join('\n')

/** A full text cut into passages, each with where it is: "page 4". Pages come from a PDF; a text without pages is cut every ~1,200 characters. */
export function passages(pages: string[], size = 1200): { text: string; where: string }[] {
  const out: { text: string; where: string }[] = []
  pages.forEach((p, i) => {
    const t = p.replace(/\s+/g, ' ').trim()
    for (let at = 0; at < t.length; at += size) out.push({ text: t.slice(at, at + size + 150), where: pages.length > 1 ? `page ${i + 1}` : `characters ${at + 1}–${Math.min(t.length, at + size + 150)}` })
  })
  return out.filter((p) => p.text.length > 80)
}

const squeeze = (s: string) => s.toLowerCase().replace(/[“”"‘’'`]/g, '').replace(/\s+/g, ' ').trim()

/** Keep only the claims whose quote is really in the text: a model can misquote. */
export function checkedClaims(claims: { claim: string; quote: string }[], text: string) {
  const t = squeeze(text)
  return claims.filter((c) => c.claim.trim() && c.quote.trim().length >= 12 && t.includes(squeeze(c.quote)))
}

/** Which passage a quote is in, so a claim can say where: "page 4". */
export const whereIn = (quote: string, ps: { text: string; where: string }[]) => ps.find((p) => squeeze(p.text).includes(squeeze(quote)))?.where

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
  /** the field each search was written for, when the searches were written for fields */
  queryFields?: Record<string, Field>
  /** the fields chosen (papers search --fields) */
  fields?: Field[]
  /** the sources searched besides scholarship: archive, newspapers, patents */
  more?: string[]
  /** US patent numbers given (--patent) */
  patents?: string[]
  /** a class: the research folders whose decisions are pooled (papers pool) */
  pooled?: string[]
  /** the ranker, when it isn't nomic-embed-text (papers screen --embed) */
  embed?: string
  /** your library's proxy prefix, for links in the reading list (papers list --proxy); never fetched through */
  proxy?: string
  runs: { at: string; found: number; added: number }[]
}

/** An item in the library: everything ever found for this topic, with the run that first found it. */
export type Seen = Item & { first: string; run: number }

export interface Decision {
  /** similarity to the seeds and topic, 0–1 */
  sim?: number
  /** the screen's answer: by the model, or by similarity alone when it fell below the cut (then similarity is true; older folders say so only by `by` being nomic-embed-text) */
  screen?: { decision: 'keep' | 'skip'; reason: string; by: string; similarity?: true }
  /** the student's own, which wins */
  student?: { decision: 'keep' | 'skip'; reason?: string; at: string }
  /** a second screener's answer, on the same items (papers screen --as second) */
  second?: { decision: 'keep' | 'skip'; reason: string; by: string }
  /** in a class: each student's decision, by their research folder; the pooled one is in student */
  students?: Record<string, 'keep' | 'skip'>
  /** the share of the screener's reading this item took: the field it was read for */
  readFor?: Field
  summary?: { claim: string; quote: string; from: string }[]
  /** the link checked when the list was made */
  link?: { url: string; status: number; at: string }
}

export const finalOf = (d: Decision | undefined) => d?.student?.decision ?? d?.screen?.decision

/** Did a model read this item (not skipped by similarity alone)? */
export const modelRead = (d: Decision | undefined) => !!d?.screen && !d.screen.similarity && !/embed/i.test(d.screen.by)

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

/** The text an item is compared by (nomic-embed-text wants the task named first; other rankers take the text as it is). */
export const embedText = (x: Pick<Item, 'title' | 'abstract'>, model = 'nomic-embed-text') => `${model.startsWith('nomic-embed-text') ? 'search_document: ' : ''}${x.title}. ${x.abstract.slice(0, 1500)}`
export const embedQuery = (q: string, model = 'nomic-embed-text') => `${model.startsWith('nomic-embed-text') ? 'search_query: ' : ''}${q}`

/**
 * Does a link work outside Variable Machine? A HEAD, or a GET where HEAD is
 * refused. 0 means no answer. Publishers often answer scripts 403 though the
 * page opens in a browser; that is said where it is shown.
 */
export async function checkLink(url: string): Promise<number> {
  // the Library of Congress counts these with its searches: the same pace
  if (/(^|\.)loc\.gov\//.test(new URL(url).host + '/')) await paced('loc.gov', LOC_GAP)
  for (const method of ['HEAD', 'GET']) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 15_000)
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: ctl.signal })
      res.body?.cancel().catch(() => {})
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status === 400)) continue
      return res.status
    } catch {
      if (method === 'GET') return 0
    } finally {
      clearTimeout(t)
    }
  }
  return 0
}

/** The link an item is checked and cited by: its DOI, arXiv, patent, archive or newspaper page. */
export const linkOf = (x: Item) => x.url

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
      const kind = x.kind === 'paper' ? (x.arxiv && !x.doi ? 'misc' : 'article') : x.kind === 'patent' ? 'patent' : x.kind === 'book' ? 'book' : 'online'
      const f: [string, string | undefined][] = [
        ['title', x.title],
        ['author', x.authors.length ? x.authors.join(' and ') : undefined],
        ['year', x.year ? String(x.year) : undefined],
        [kind === 'article' ? 'journal' : 'howpublished', x.venue],
        ['number', x.patent],
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
