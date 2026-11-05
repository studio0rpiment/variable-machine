import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { spawnStreamed } from './run.ts'

/**
 * `look museum "<search>" <set> [--limit 40]`: public-domain artworks from the
 * Art Institute of Chicago into workspace/images/<set>/, one curl per picture,
 * with a manifest that credits each one (title, artist, date, its page).
 *
 * The museum's API needs no key. It marks the works whose images are public
 * domain (is_public_domain), and states that its data is CC0 except the
 * description field, which isn't used here. Images come at 843 pixels wide,
 * the size the museum suggests, from its IIIF image server.
 */

const SET = /^[a-z0-9][a-z0-9._-]{0,63}$/
const API = 'https://api.artic.edu/api/v1/artworks/search'
// the museum asks callers to say who they are; no contact details are sent
const HEADERS = { 'AIC-User-Agent': 'variable-machine (localhost teaching tool)' }

interface Work {
  id: number
  title: string
  artist_title: string | null
  date_display: string | null
  image_id: string | null
  is_public_domain: boolean
}

export async function museumCommand(args: string[], line: string): Promise<boolean> {
  const words: string[] = []
  let limit = 40
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') limit = Number(args[++i])
    else words.push(args[i])
  }
  const [search, set] = words
  if (!search || !set || !SET.test(set) || words.length !== 2 || !(limit >= 1 && limit <= 100)) {
    print('usage: look museum "<search>" <set> [--limit 40]   (public-domain artworks from the Art Institute of Chicago, CC0, into workspace/images/<set>/)')
    return false
  }
  const dir = path.join(WORKSPACE, 'images', set)
  if (await fs.access(dir).then(() => true, () => false)) return print(`workspace/images/${set} is already here; choose another set name`), false
  const url = `${API}?q=${encodeURIComponent(search)}&query[term][is_public_domain]=true&fields=id,title,artist_title,date_display,image_id,is_public_domain&limit=${Math.min(100, limit * 2)}`
  print(`GET ${url}`)
  const res = await fetch(url, { headers: HEADERS }).catch(() => null)
  if (!res?.ok) return print(`look museum: the museum's API answered ${res?.status ?? 'nothing'}`), false
  const body = (await res.json()) as { data: Work[]; pagination?: { total: number }; info?: { license_text?: string } }
  const works = body.data.filter((w) => w.is_public_domain && w.image_id).slice(0, limit)
  print(`  ${body.pagination?.total ?? '?'} public-domain works match "${search}"; taking ${works.length}`)
  if (!works.length) return false
  await fs.mkdir(dir, { recursive: true })
  const credits: { file: string; title: string; author: string; date?: string; license: string; url: string; image: string }[] = []
  for (const w of works) {
    const file = `aic-${w.id}.jpg`
    const image = `https://www.artic.edu/iiif/2/${w.image_id}/full/843,/0/default.jpg`
    print(`▸ curl -sfL -o workspace/images/${set}/${file} ${image}`)
    if (!(await spawnStreamed('curl', ['-sfL', '-H', `AIC-User-Agent: ${HEADERS['AIC-User-Agent']}`, '-o', `workspace/images/${set}/${file}`, image]))) {
      print(`  ${file} didn't download; skipped`)
      continue
    }
    credits.push({ file, title: w.title, author: w.artist_title ?? 'unknown', ...(w.date_display && { date: w.date_display }), license: 'CC0 (public domain, Art Institute of Chicago)', url: `https://www.artic.edu/artworks/${w.id}`, image })
  }
  const manifest = {
    name: set,
    kind: 'images',
    created: new Date().toISOString(),
    license: 'CC0 (public domain, Art Institute of Chicago)',
    inputs: [url],
    command: [line],
    about: `public-domain artworks from the Art Institute of Chicago matching "${search}"`,
    note: body.info?.license_text,
    credits,
  }
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  broadcast({ type: 'workspace.changed', path: `images/${set}/manifest.json`, kind: 'add' })
  print(`  ◂ workspace/images/${set}: ${credits.length} pictures, each credited in its manifest · CC0`)
  return credits.length > 0
}
