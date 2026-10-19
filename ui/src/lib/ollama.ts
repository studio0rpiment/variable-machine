/** Browser-side Ollama calls, always through the helper's /ollama proxy. */

export interface OllamaModel {
  name: string
  size: number
  digest: string
  modified_at: string
  details?: { family?: string; parameter_size?: string; quantization_level?: string; parent_model?: string; format?: string }
}

export interface ShowResult {
  license?: string | string[]
  modelfile: string
  parameters?: string
  system?: string
  template?: string
  details?: OllamaModel['details']
}

/** /api/show, quietly (a read the GUI does on its own; actions the person takes go through runCommand). */
export async function showModel(model: string): Promise<ShowResult> {
  const res = await fetch('/ollama/api/show', { method: 'POST', body: JSON.stringify({ model }) })
  if (!res.ok) throw new Error(`ollama show ${model}: ${res.status}`)
  return res.json()
}

export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch('/ollama/api/tags')
  if (!res.ok) throw new Error(`ollama: ${res.status}`)
  const { models } = (await res.json()) as { models: OllamaModel[] }
  return models.sort((a, b) => a.name.localeCompare(b.name))
}

export interface ChatDelta {
  content: string
  thinking: string
  done: boolean
  evalCount?: number
  durationMs?: number
  error?: string
}

/**
 * One prompt, one streamed answer. The helper echoes this call into the
 * terminal as `ollama run-once …` and, because of the header, logs it to
 * workspace/chat/<date>.jsonl when it finishes.
 */
export async function chatOnce(model: string, prompt: string, onDelta: (d: ChatDelta) => void, signal: AbortSignal) {
  const res = await fetch('/ollama/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-variable-machine-source': 'chat' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: true }),
    signal,
  })
  if (!res.body) throw new Error(`ollama: ${res.status}`)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const c = JSON.parse(line) as {
        message?: { content?: string; thinking?: string }
        done: boolean
        eval_count?: number
        total_duration?: number
        error?: string
      }
      onDelta({
        content: c.message?.content ?? '',
        thinking: c.message?.thinking ?? '',
        done: c.done,
        evalCount: c.eval_count,
        durationMs: c.total_duration ? Math.round(c.total_duration / 1e6) : undefined,
        error: c.error,
      })
    }
  }
}
