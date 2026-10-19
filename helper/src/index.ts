import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { HOST, PORT, WORKSPACE, WORKSPACE_DIRS } from './config.ts'
import { addClient, broadcast, send } from './hub.ts'
import { probe, status } from './status.ts'
import { proxyOllama } from './proxy.ts'
import { serveStatic } from './static.ts'
import { watchWorkspace } from './watcher.ts'
import { handleCommand, handleLine, saveModelfile, stopRunning } from './terminal.ts'
import { serveWorkspaceApi } from './workspace.ts'
import { ollamaPost } from './ollama.ts'
import type { ClientEvent } from './shared/events.ts'

for (const dir of WORKSPACE_DIRS) fs.mkdirSync(path.join(WORKSPACE, dir), { recursive: true })

const ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`])

/**
 * The helper runs commands for whoever talks to it, so only this page may.
 * Browsers always send Origin on cross-site requests and WebSocket upgrades;
 * tools like curl send none and are already local.
 */
function isAllowedOrigin(origin: string | undefined) {
  return origin === undefined || ORIGINS.has(origin)
}

const server = http.createServer((req, res) => {
  if (!isAllowedOrigin(req.headers.origin)) {
    res.writeHead(403).end()
    return
  }
  if (req.url?.startsWith('/ollama/')) {
    void proxyOllama(req, res)
    return
  }
  if (req.url?.startsWith('/api/workspace')) {
    void serveWorkspaceApi(req, res)
    return
  }
  serveStatic(req, res)
})

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws' || !isAllowedOrigin(req.headers.origin)) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
})

const alive = new WeakMap<WebSocket, boolean>()

wss.on('connection', (ws) => {
  addClient(ws)
  alive.set(ws, true)
  ws.on('pong', () => alive.set(ws, true))
  send(ws, { type: 'status', ...status })
  ws.on('message', (data) => {
    let event: ClientEvent
    try {
      event = JSON.parse(String(data)) as ClientEvent
    } catch {
      return
    }
    switch (event.type) {
      case 'terminal.input':
        void handleLine(event.line)
        break
      case 'command':
        handleCommand(event.id, event.line)
        break
      case 'modelfile.save':
        saveModelfile(event.name, event.text)
        break
      case 'terminal.stop':
        stopRunning()
        break
      case 'ollama.unload':
        void ollamaPost('/api/generate', { model: event.model, keep_alive: 0 }).catch(() => {})
        break
      case 'pipeline.run':
      case 'pipeline.stop':
        send(ws, { type: 'terminal.output', text: 'pipelines arrive in milestone 4\r\n' })
        break
    }
  })
})

/**
 * The one timer in Variable Machine. Everything else is event-driven, but a half-open
 * socket (laptop slept, network dropped) produces no event at all, so the only
 * way to notice it is to ask: every 15s each client is pinged, and one that
 * didn't answer the previous ping is closed. The `heartbeat` event lets the
 * page know the helper is still there.
 */
const HEARTBEAT_MS = 15_000
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate()
      continue
    }
    alive.set(ws, false)
    ws.ping()
  }
  broadcast({ type: 'heartbeat', at: Date.now() })
}, HEARTBEAT_MS)

watchWorkspace()
void probe()

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') throw err
  console.error(`\nport ${PORT} is taken: Variable Machine (or something else) is already running there.`)
  console.error(`open http://localhost:${PORT}, stop the other copy, or run with VARIABLE_MACHINE_PORT=<another port>.\n`)
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`
  console.log(`Variable Machine → ${url}`)
  if (process.env.VARIABLE_MACHINE_OPEN === '1') {
    import('node:child_process').then(({ spawn }) => spawn('open', [url], { stdio: 'ignore', detached: true }).unref())
  }
})
