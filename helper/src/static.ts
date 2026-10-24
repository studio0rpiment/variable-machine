import fs from 'node:fs'
import path from 'node:path'
import type http from 'node:http'
import { ROOT, UI_DIST } from './config.ts'
import { restoreSync } from './conflicts.ts'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
}

/**
 * Runtimes the page loads its own files from (the image tools' onnxruntime-web
 * WebAssembly, the trackers' MediaPipe WebAssembly), served from node_modules
 * so nothing comes from a CDN.
 */
const VENDOR: Record<string, string> = {
  '/vendor/ort/': path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist'),
  // the Move tab's trackers (MediaPipe Tasks Vision): its WebAssembly, 39MB, not bundled
  '/vendor/mediapipe/': path.join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
}

/**
 * Cross-origin isolation, so onnxruntime-web may use threads (SharedArrayBuffer).
 * Everything the page loads is from here, so requiring it costs nothing.
 */
const ISOLATED = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' }

function serveVendor(urlPath: string, res: http.ServerResponse): boolean {
  const prefix = Object.keys(VENDOR).find((p) => urlPath.startsWith(p))
  if (!prefix) return false
  const root = VENDOR[prefix]
  const file = path.join(root, path.normalize(urlPath.slice(prefix.length)))
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end()
    return true
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=86400', ...ISOLATED })
  fs.createReadStream(file).pipe(res)
  return true
}

/** Serve ui/dist. Unknown paths fall back to index.html; hashed assets are cached for good. */
export function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  if (serveVendor(urlPath, res)) return
  let file = path.join(UI_DIST, path.normalize(urlPath))
  if (!file.startsWith(UI_DIST)) {
    res.writeHead(403).end()
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(UI_DIST, 'index.html')
  // A sync service may have renamed the page to "index [conflicted].html" during a rebuild: put it back.
  if (!fs.existsSync(file) && file.endsWith('index.html')) restoreSync(UI_DIST, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' }).end('ui not built yet: npm run build')
    return
  }
  const immutable = file.includes(`${path.sep}assets${path.sep}`)
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...ISOLATED,
  })
  fs.createReadStream(file).pipe(res)
}
