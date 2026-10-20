import fs from 'node:fs/promises'
import { createReadStream, createWriteStream, realpathSync } from 'node:fs'
import path from 'node:path'
import { print } from './hub.ts'
import type http from 'node:http'
import { WORKSPACE } from './config.ts'

/**
 * Read-only access to workspace/ for the UI, which renders from these files:
 *   GET /api/workspace/list?dir=modelfiles     → [{name, dir, size, modified}]
 *   GET /api/workspace/file?path=modelfiles/x  → the file
 *   GET /api/workspace/manifests?dir=hf        → every <dir>/*\/manifest.json, parsed
 *   GET /api/workspace/file?path=shared/x.zip&download=1 → the same, as a download
 *   POST /api/workspace/upload?name=x.zip     → a zip into workspace/shared
 *   POST /api/workspace/upload?name=x.csv      → a .csv, .jsonl or .json into workspace/uploads (for data import file)
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

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
}

/** A shared zip or a data file; bigger than this isn't a class's material, and would fill the disk. */
const MAX_UPLOAD = 200 * 1024 * 1024

async function upload(req: http.IncomingMessage, res: http.ServerResponse, name: string | null) {
  // A zip is something shared (unzip puts it back); a table or JSON file is data to bring in.
  const kind = name && /^[\w.-]+\.zip$/.test(name) ? 'shared' : name && /^[\w.-]+\.(csv|jsonl|json)$/.test(name) ? 'uploads' : null
  if (req.method !== 'POST' || !name || !kind) return json(res, 400, { error: 'POST a .zip, .csv, .jsonl or .json with ?name=<file>' })
  const dest = path.join(WORKSPACE, kind, name)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  try {
    await fs.access(dest)
    return json(res, 409, { error: `workspace/${kind}/${name} exists` })
  } catch {
    // free
  }
  if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD) return json(res, 413, { error: `larger than ${MAX_UPLOAD / 1024 / 1024}MB` })
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
    return
  }
  await fs.rename(dest + '.part', dest)
  print(`▸ received workspace/${kind}/${name} (uploaded from the browser)`)
  json(res, 200, { path: `${kind}/${name}` })
}

export async function serveWorkspaceApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x')
  const what = url.pathname.replace('/api/workspace/', '')
  if (what === 'upload') return upload(req, res, url.searchParams.get('name')).catch((err: Error) => json(res, 500, { error: err.message }))
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
        'content-type': target.endsWith('.zip') ? 'application/zip' : 'text/plain; charset=utf-8',
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
