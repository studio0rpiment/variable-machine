import http from 'node:http'
import { OLLAMA_URL } from './config.ts'
import { echo, print } from './hub.ts'
import { markOllama } from './status.ts'
import { joinWords } from './shared/quote.ts'
import { appendChat } from './chatlog.ts'
import type { ChatChunk, ChatMessage } from './ollama.ts'

const PREFIX = '/ollama'

interface ChatRequest {
  model: string
  messages: ChatMessage[]
  options?: Record<string, unknown>
}

/** The CLI form of a one-prompt chat call, as the terminal would accept it back. */
export function runOnceLine(req: ChatRequest): string {
  const system = req.messages.find((m) => m.role === 'system')?.content
  const prompt = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? ''
  return joinWords(['ollama', 'run-once', req.model, ...(system ? ['--system', system] : []), prompt])
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Summarise a finished /api/chat stream and, for the Chat panel, append it to the chat log. */
async function finishChat(chat: ChatRequest, raw: string, log: boolean, stopped: boolean) {
  let answer = ''
  let thinking = ''
  let last: ChatChunk | undefined
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const chunk = JSON.parse(line) as ChatChunk
      answer += chunk.message?.content ?? ''
      thinking += chunk.message?.thinking ?? ''
      last = chunk
    } catch {
      // a half line from an aborted stream
    }
  }
  if (last?.error) return print(`  ◂ ${chat.model} · error: ${last.error}`)
  const tokens = last?.eval_count ? `${last.eval_count} tokens` : ''
  const secs = last?.total_duration ? `${(last.total_duration / 1e9).toFixed(1)}s` : ''
  let where = ''
  if (log && answer) {
    where = await appendChat({
      timestamp: new Date().toISOString(),
      model: chat.model,
      prompt: chat.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '',
      system: chat.messages.find((m) => m.role === 'system')?.content,
      answer,
      ...(thinking ? { thinking } : {}),
      ...(chat.options ? { options: chat.options } : {}),
      stats: { evalCount: last?.eval_count, durationMs: last?.total_duration ? Math.round(last.total_duration / 1e6) : undefined },
    })
    where = `workspace/${where}`
  }
  print('  ◂ ' + [chat.model, stopped ? 'stopped' : '', tokens, secs, where].filter(Boolean).join(' · '))
}

/**
 * /ollama/* → Ollama (plan §3.1.2). Same origin as the page, so Ollama's own
 * OLLAMA_ORIGINS check never fires; the helper does that check instead
 * (isAllowedOrigin in server.ts) and forwards without Origin.
 *
 * Responses are piped, so /api/chat, /api/pull and /api/create stream through.
 * /api/chat is also echoed as `ollama run-once …`, and when the Chat panel sends
 * `x-retension-source: chat` the exchange is appended to workspace/chat/<date>.jsonl.
 */
export async function proxyOllama(req: http.IncomingMessage, res: http.ServerResponse) {
  const upstreamPath = (req.url ?? '/').slice(PREFIX.length) || '/'
  const isChat = req.method === 'POST' && upstreamPath.split('?')[0] === '/api/chat'
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)

  let chat: ChatRequest | undefined
  if (isChat && body) {
    try {
      chat = JSON.parse(body.toString('utf8')) as ChatRequest
      echo(runOnceLine(chat))
    } catch {
      // not JSON; let Ollama answer with its own error
    }
  }
  const log = req.headers['x-retension-source'] === 'chat'

  const headers = { ...req.headers }
  delete headers.origin
  delete headers.referer
  delete headers['x-retension-source']
  headers.host = OLLAMA_URL.host
  if (body) headers['content-length'] = String(body.length)

  const upstream = http.request(
    { host: OLLAMA_URL.hostname, port: OLLAMA_URL.port, path: upstreamPath, method: req.method, headers },
    (up) => {
      markOllama(true)
      res.writeHead(up.statusCode ?? 502, up.headers)
      let raw = ''
      if (chat) up.on('data', (c: Buffer) => (raw += c.toString('utf8')))
      up.pipe(res)
      // A stopped answer is shown but not logged: the log keeps whole exchanges only.
      up.on('close', () => chat && void finishChat(chat, raw, log && up.complete, !up.complete))
    },
  )
  upstream.on('error', (err) => {
    if (res.headersSent) return res.end()
    markOllama(false)
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: `ollama not reachable at ${OLLAMA_URL.origin}: ${err.message}` }))
  })
  // Browser stopped reading (Stop, or the tab closed): stop Ollama generating too.
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy()
  })
  upstream.end(body)
}
