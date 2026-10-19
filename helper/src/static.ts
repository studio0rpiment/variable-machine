import fs from 'node:fs'
import path from 'node:path'
import type http from 'node:http'
import { UI_DIST } from './config.ts'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

/** Serve ui/dist. Unknown paths fall back to index.html; hashed assets are cached for good. */
export function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  let file = path.join(UI_DIST, path.normalize(urlPath))
  if (!file.startsWith(UI_DIST)) {
    res.writeHead(403).end()
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(UI_DIST, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' }).end('ui not built yet: npm run build')
    return
  }
  const immutable = file.includes(`${path.sep}assets${path.sep}`)
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  fs.createReadStream(file).pipe(res)
}
