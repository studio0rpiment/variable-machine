import fs from 'node:fs/promises'
import { createReadStream, createWriteStream, realpathSync } from 'node:fs'
import path from 'node:path'
import { print } from './hub.ts'
import type http from 'node:http'
import { WORKSPACE } from './config.ts'
import { readAudioSet, writeAudioSet } from './voice.ts'
import { receiveExamples } from './gestures.ts'

/**
 * Read-only access to workspace/ for the UI, which renders from these files:
 *   GET /api/workspace/list?dir=modelfiles     → [{name, dir, size, modified}]
 *   GET /api/workspace/file?path=modelfiles/x  → the file
 *   GET /api/workspace/manifests?dir=hf        → every <dir>/*\/manifest.json, parsed
 *   GET /api/workspace/file?path=shared/x.zip&download=1 → the same, as a download
 *   POST /api/workspace/upload?name=x.zip     → a zip into workspace/shared
 *   POST /api/workspace/upload?name=x.csv      → a .csv, .jsonl or .json into workspace/uploads (for data import file)
 *   POST /api/workspace/upload?name=x.jpg&set=s → a photo into workspace/images/<set>/ (the set's manifest lists it)
 *   POST /api/workspace/output?path=outputs/s/x.png → a picture a page run made (look …); the run records it
 *   POST /api/workspace/upload?name=x.wav&audio=s → a recording from the page into workspace/audio/<set>/ (the set's manifest lists it)
 *   POST /api/workspace/gesture?name=s&label=l → recorded gesture examples (points, not pictures) into workspace/gestures/<set>/
 * Every other write is a command, so it shows in the terminal; an upload is
 * announced there too, and unpacking it is the `unzip` command.
 */
function inside(rel: string): string | null {
  const p = path.resolve(WORKSPACE, rel)
  const within = (x: string, root: string) => {
    const r = path.relative(root, x)
    return !(r.startsWith('..') || path.isAbsolute(r))
  }
  if (!within(p, WORKSPACE)) return null
  // and where it really leads: a link inside the workspace mustn't reach outside it
  try {
    return within(realpathSync(p), realpathSync(WORKSPACE)) ? p : null
  } catch {
    return p // doesn't exist (yet): nothing to follow
  }
}

/** Photos and outputs are shown by the page, and tool models are loaded by it; everything else is read as text. */
const TYPES: Record<string, string> = {
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.onnx': 'application/octet-stream',
  '.task': 'application/octet-stream',
  '.json': 'application/json',
}

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
}

/** A shared zip or a data file; bigger than this isn't a class's material, and would fill the disk. */
const MAX_UPLOAD = 200 * 1024 * 1024

const SET = /^[a-z0-9][a-z0-9._-]{0,63}$/
const PHOTO = /^[\w.-]+\.(jpe?g|png|webp)$/i

/** Write the request body to dest, through a .part file, up to MAX_UPLOAD. False if it was too big. */
async function receive(req: http.IncomingMessage, res: http.ServerResponse, dest: string): Promise<boolean> {
  if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD) {
    json(res, 413, { error: `larger than ${MAX_UPLOAD / 1024 / 1024}MB` })
    return false
  }
  const ok = await new Promise<boolean>((resolve, reject) => {
    const out = createWriteStream(dest + '.part')
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      // no content-length, or a wrong one: stop at the limit all the same
      if (size > MAX_UPLOAD) {
        req.unpipe(out)
        out.destroy()
        req.destroy()
        resolve(false)
      }
    })
    req.pipe(out)
    out.on('finish', () => resolve(true))
    out.on('error', reject)
    req.on('error', reject)
  })
  if (!ok) {
    await fs.rm(dest + '.part', { force: true })
    return false
  }
  await fs.rename(dest + '.part', dest)
  return true
}

/** A photo into images/<set>/. The set's manifest says where its photos came from and under what license. */
async function uploadPhoto(req: http.IncomingMessage, res: http.ServerResponse, name: string, set: string, license: string) {
  const folder = path.join(WORKSPACE, 'images', set)
  await fs.mkdir(folder, { recursive: true })
  const dest = path.join(folder, name)
  try {
    await fs.access(dest)
    return json(res, 409, { error: `workspace/images/${set}/${name} exists` })
  } catch {
    // free
  }
  if (!(await receive(req, res, dest))) return
  const mfile = path.join(folder, 'manifest.json')
  const now = new Date().toISOString()
  let m: { name: string; kind: string; created: string; license: string; inputs: string[]; command: string }
  try {
    m = JSON.parse(await fs.readFile(mfile, 'utf8'))
  } catch {
    m = { name: set, kind: 'images', created: now, license, inputs: [], command: 'uploaded from the browser (Look tab)' }
  }
  if (!m.inputs.includes(name)) m.inputs.push(name)
  await fs.writeFile(mfile, JSON.stringify(m, null, 2) + '\n')
  print(`▸ received workspace/images/${set}/${name} (from the browser · ${m.license})`)
  json(res, 200, { path: `images/${set}/${name}` })
}

/** A picture a page run made. Only into outputs/<set>/; replacing is fine (running a tool again). */
async function uploadOutput(req: http.IncomingMessage, res: http.ServerResponse, rel: string | null) {
  const parts = (rel ?? '').split('/')
  if (req.method !== 'POST' || parts.length !== 3 || parts[0] !== 'outputs' || !SET.test(parts[1]) || !/^[\w.-]+\.png$/.test(parts[2])) {
    return json(res, 400, { error: 'POST a .png with ?path=outputs/<set>/<file>.png' })
  }
  await fs.mkdir(path.join(WORKSPACE, 'outputs', parts[1]), { recursive: true })
  if (await receive(req, res, path.join(WORKSPACE, ...parts))) json(res, 200, { path: rel })
}

/** A recording from the page's microphone, as WAV, into audio/<set>/. Its manifest entry says it was recorded, and whose voice it is. */
async function uploadAudio(req: http.IncomingMessage, res: http.ServerResponse, name: string, set: string, license: string) {
  if (!SET.test(set) || !/^[\w.-]+\.wav$/i.test(name)) return json(res, 400, { error: 'POST a .wav with ?name=<file>.wav&audio=<set>' })
  const folder = path.join(WORKSPACE, 'audio', set)
  await fs.mkdir(folder, { recursive: true })
  const dest = path.join(folder, name)
  try {
    await fs.access(dest)
    return json(res, 409, { error: `workspace/audio/${set}/${name} exists` })
  } catch {
    // free
  }
  if (!(await receive(req, res, dest))) return
  const m = await readAudioSet(set)
  if (!m.command.length) m.command.push('recorded in the browser (Voice tab)')
  m.files[name] = { made: 'recorded', license }
  await writeAudioSet(m)
  print(`▸ received workspace/audio/${set}/${name} (recorded in the browser · ${license})`)
  json(res, 200, { path: `audio/${set}/${name}` })
}

async function upload(req: http.IncomingMessage, res: http.ServerResponse, name: string | null, set: string | null, license: string | null, audio?: string | null) {
  if (req.method === 'POST' && name && audio) return uploadAudio(req, res, name, audio, license?.trim() || 'your own voice')
  if (req.method === 'POST' && name && set && PHOTO.test(name)) {
    if (!SET.test(set)) return json(res, 400, { error: 'a set name is lowercase letters, digits, . _ -' })
    return uploadPhoto(req, res, name, set, license?.trim() || 'your own work')
  }
  // A zip is something shared (unzip puts it back); a table or JSON file is data to bring in.
  const kind = name && /^[\w.-]+\.zip$/.test(name) ? 'shared' : name && /^[\w.-]+\.(csv|jsonl|json)$/.test(name) ? 'uploads' : null
  if (req.method !== 'POST' || !name || !kind) return json(res, 400, { error: 'POST a .zip, .csv, .jsonl or .json with ?name=<file>, or a photo with ?name=<file>&set=<set>' })
  const dest = path.join(WORKSPACE, kind, name)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  try {
    await fs.access(dest)
    return json(res, 409, { error: `workspace/${kind}/${name} exists` })
  } catch {
    // free
  }
  if (!(await receive(req, res, dest))) return
  print(`▸ received workspace/${kind}/${name} (uploaded from the browser)`)
  json(res, 200, { path: `${kind}/${name}` })
}

export async function serveWorkspaceApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x')
  const what = url.pathname.replace('/api/workspace/', '')
  const fail = (err: Error) => json(res, 500, { error: err.message })
  if (what === 'upload') return upload(req, res, url.searchParams.get('name'), url.searchParams.get('set'), url.searchParams.get('license'), url.searchParams.get('audio')).catch(fail)
  if (what === 'gesture') return receiveExamples(req, res, url.searchParams.get('name'), url.searchParams.get('label')).catch(fail)
  if (what === 'output') return uploadOutput(req, res, url.searchParams.get('path')).catch(fail)
  const target = inside(url.searchParams.get(what === 'file' ? 'path' : 'dir') ?? '')
  if (!target) return json(res, 403, { error: 'outside workspace/' })
  try {
    if (what === 'list') {
      const entries = await fs.readdir(target, { withFileTypes: true })
      const rows = await Promise.all(
        entries
          .filter((e) => !e.name.startsWith('.'))
          .map(async (e) => {
            const st = await fs.stat(path.join(target, e.name))
            return { name: e.name, dir: e.isDirectory(), size: st.size, modified: st.mtime.toISOString() }
          }),
      )
      return json(res, 200, rows)
    }
    if (what === 'manifests') {
      const dirs = (await fs.readdir(target, { withFileTypes: true })).filter((e) => e.isDirectory())
      const out = []
      for (const d of dirs) {
        try {
          out.push({ folder: d.name, ...JSON.parse(await fs.readFile(path.join(target, d.name, 'manifest.json'), 'utf8')) })
        } catch {
          // a folder still being written, or not an artifact
        }
      }
      return json(res, 200, out)
    }
    if (what === 'file') {
      const st = await fs.stat(target)
      const download = url.searchParams.get('download') === '1'
      res.writeHead(200, {
        'content-type': TYPES[path.extname(target).toLowerCase()] ?? 'text/plain; charset=utf-8',
        'content-length': String(st.size),
        'cache-control': 'no-store',
        ...(download ? { 'content-disposition': `attachment; filename="${path.basename(target)}"` } : {}),
      })
      createReadStream(target).pipe(res)
      return
    }
    json(res, 404, { error: 'unknown' })
  } catch (err) {
    json(res, (err as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500, { error: (err as Error).message })
  }
}
