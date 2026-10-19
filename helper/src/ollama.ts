import { OLLAMA_URL } from './config.ts'
import { markOllama } from './status.ts'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  thinking?: string
}

export interface ChatChunk {
  model: string
  message?: ChatMessage
  done: boolean
  eval_count?: number
  total_duration?: number
  error?: string
}

/** Read an NDJSON body chunk by chunk and hand each parsed line on. */
export async function readNdjson(body: ReadableStream<Uint8Array>, onLine: (line: unknown) => void) {
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) onLine(JSON.parse(line))
    }
  }
  if (buf.trim()) onLine(JSON.parse(buf))
}

/** POST to Ollama's API directly (helper-side callers; the browser goes through the /ollama proxy). */
export async function ollamaPost(pathname: string, body: unknown, signal?: AbortSignal) {
  try {
    const res = await fetch(new URL(pathname, OLLAMA_URL), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    markOllama(true)
    return res
  } catch (err) {
    if (!signal?.aborted) markOllama(false)
    throw err
  }
}
