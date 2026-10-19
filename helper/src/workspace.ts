import fs from 'node:fs/promises'
import path from 'node:path'
import type http from 'node:http'
import { WORKSPACE } from './config.ts'

/**
 * Read-only access to workspace/ for the UI, which renders from these files:
 *   GET /api/workspace/list?dir=modelfiles     → [{name, dir, size, modified}]
 *   GET /api/workspace/file?path=modelfiles/x  → the file
 *   GET /api/workspace/manifests?dir=hf        → every <dir>/*\/manifest.json, parsed
 * Writes never come through here: they are commands, so they show in the terminal.
 */
function inside(rel: string): string | null {
  const p = path.resolve(WORKSPACE, rel)
  const r = path.relative(WORKSPACE, p)
  return r.startsWith('..') || path.isAbsolute(r) ? null : p
}

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
}

export async function serveWorkspaceApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x')
  const what = url.pathname.replace('/api/workspace/', '')
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
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(await fs.readFile(target))
    }
    json(res, 404, { error: 'unknown' })
  } catch (err) {
    json(res, (err as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500, { error: (err as Error).message })
  }
}
