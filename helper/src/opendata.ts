import type http from 'node:http'

/**
 * Search public open-data portals for tables (plan §8: raw material with its
 * license). Read-only, like the workspace API: nothing is downloaded until the
 * student brings a table in with `data raw csv`, which shows in the terminal.
 *
 *   GET /api/opendata/search?source=dc&q=traffic       → DC Open Data (opendata.dc.gov, an ArcGIS Hub)
 *   GET /api/opendata/search?source=datagov&q=traffic  → data.gov's catalog
 *
 * Each result says what it is, who published it, the license the portal
 * states (or null, when it states none), its page, and a CSV address when
 * there is one.
 */

export interface OpenDataResult {
  id: string
  title: string
  about: string
  publisher: string
  license: string | null
  page: string
  csv: string | null
}

const strip = (html: string | undefined) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t)

/** Names for the licenses portals use (ids or web addresses), as people say them. */
function licenseName(id: string | undefined | null): string | null {
  if (!id) return null
  const v = id.trim().toLowerCase()
  if (!v || v === 'none' || v === 'other' || v === 'notspecified') return null
  if (/publicdomain\/zero|cc-zero|cc0/.test(v)) return 'CC0 1.0'
  if (/publicdomain\/label|us-pd|public domain/.test(v)) return 'U.S. public domain'
  if (/by-sa[/-]4|cc-by-sa-4/.test(v)) return 'CC BY-SA 4.0'
  if (/licenses\/by\/4|cc-by-4/.test(v)) return 'CC BY 4.0'
  if (/licenses\/by\/3|cc-by-3/.test(v)) return 'CC BY 3.0'
  if (/odbl/.test(v)) return 'ODbL'
  if (/odc-by/.test(v)) return 'ODC-BY'
  if (/odc-pddl|pddl/.test(v)) return 'PDDL'
  // Anything else (a portal's own terms page, say): keep what it said, so the student can look it up.
  return id.trim()
}

async function searchDc(q: string): Promise<OpenDataResult[]> {
  const url = `https://opendata.dc.gov/api/search/v1/collections/dataset/items?q=${encodeURIComponent(q)}&limit=12`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`DC Open Data answered ${res.status}`)
  const d = (await res.json()) as { features: { id: string; properties: Record<string, unknown> }[] }
  return d.features.map(({ id, properties: p }) => {
    // Hub datasets that are tables or map layers can be downloaded as CSV; documents and apps can't.
    const tabular = ['Feature Service', 'Map Service', 'Table', 'CSV'].includes(String(p.type))
    return {
      id,
      title: String(p.title ?? id),
      about: clip(strip(String(p.snippet ?? p.description ?? '')), 280),
      publisher: String(p.source ?? p.owner ?? 'DC Open Data'),
      license: licenseName(p.license as string),
      page: `https://opendata.dc.gov/datasets/${id}`,
      csv: tabular ? `https://opendata.dc.gov/api/download/v1/items/${id}/csv?layers=0` : null,
    }
  })
}

async function searchDataGov(q: string): Promise<OpenDataResult[]> {
  // The catalog's own search page answers in JSON; its old CKAN API is gone.
  const res = await fetch(`https://catalog.data.gov/search?q=${encodeURIComponent(q)}&format=json`)
  if (!res.ok) throw new Error(`data.gov answered ${res.status}`)
  const d = (await res.json()) as { results: { slug?: string; title?: string; publisher?: string | { name?: string }; dcat?: Record<string, unknown> }[] }
  return d.results.slice(0, 12).map((r) => {
    const dcat = r.dcat ?? {}
    const dist = (dcat.distribution as { downloadURL?: string; mediaType?: string; format?: string }[] | undefined) ?? []
    const csv = dist.find((x) => /csv/i.test(x.mediaType ?? '') || /csv/i.test(x.format ?? '') || /\.csv(\?|$)/i.test(x.downloadURL ?? ''))?.downloadURL ?? null
    const pub = (dcat.publisher as { name?: string } | undefined)?.name ?? (typeof r.publisher === 'string' ? r.publisher : r.publisher?.name) ?? 'data.gov'
    return {
      id: r.slug ?? String(dcat.identifier ?? r.title),
      title: String(dcat.title ?? r.title ?? 'untitled'),
      about: clip(strip(String(dcat.description ?? '')), 280),
      publisher: pub,
      license: licenseName(dcat.license as string),
      page: r.slug ? `https://catalog.data.gov/dataset/${r.slug}` : String(dcat.landingPage ?? 'https://catalog.data.gov'),
      csv,
    }
  })
}

export async function serveOpenData(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x')
  const send = (code: number, body: unknown) => res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
  const source = url.searchParams.get('source')
  const q = (url.searchParams.get('q') ?? '').trim()
  if (url.pathname !== '/api/opendata/search' || !q || (source !== 'dc' && source !== 'datagov')) return send(400, { error: 'GET /api/opendata/search?source=dc|datagov&q=<words>' })
  try {
    send(200, { results: source === 'dc' ? await searchDc(q) : await searchDataGov(q) })
  } catch (err) {
    send(502, { error: (err as Error).message })
  }
}
