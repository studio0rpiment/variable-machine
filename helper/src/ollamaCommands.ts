import fs from 'node:fs/promises'
import path from 'node:path'
import { OLLAMA_URL, ROOT } from './config.ts'
import { broadcast, print } from './hub.ts'
import { ollamaPost, readNdjson, type ChatChunk, type ChatMessage } from './ollama.ts'
import { appendChat, readPicture } from './chatlog.ts'
import { formatBytes, refuse, scopePath, setRunning, spawnStreamed, write } from './run.ts'
import { isPath, parseModelfile } from './shared/modelfile.ts'

/**
 * `ollama …` in the terminal. list and show run the real CLI; pull, rm,
 * create and run-once go through Ollama's API so the helper can turn their
 * progress into events the GUI draws as well. The line in the terminal is
 * still the CLI form, which does the same thing.
 */

const env = { OLLAMA_HOST: OLLAMA_URL.origin }
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`

async function errorOf(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? `${res.status} ${res.statusText}`
}

/**
 * Pull with progress. Each layer gets one terminal line, rewritten in place
 * with \r, and the same numbers go out as `ollama.progress` for the Models panel.
 */
async function pull(model: string): Promise<boolean> {
  const abort = new AbortController()
  setRunning({ abort })
  let current = ''
  let lastTotal = 0
  try {
    const res = await ollamaPost('/api/pull', { model, stream: true }, abort.signal)
    if (!res.ok || !res.body) {
      print(`ollama: ${await errorOf(res)}`)
      return false
    }
    let failed = ''
    await readNdjson(res.body, (line) => {
      const p = line as { status?: string; completed?: number; total?: number; error?: string }
      if (p.error) {
        failed = p.error
        return
      }
      const statusText = p.status ?? ''
      broadcast({ type: 'ollama.progress', model, status: statusText, completed: p.completed, total: p.total })
      const amount = (done: number, total: number) => `  ${String(Math.floor((done / total) * 100)).padStart(3)}%  ${formatBytes(done)} / ${formatBytes(total)}`
      if (statusText !== current && current) {
        // Ollama only moves to the next layer once this one is in, but small layers often never report `completed`.
        if (lastTotal) write(`\r\x1b[2K${current}${amount(lastTotal, lastTotal)}`)
        write('\n')
        lastTotal = 0
      }
      current = statusText
      if (p.total) lastTotal = p.total
      write(`\r\x1b[2K${statusText}${p.total ? amount(p.completed ?? 0, p.total) : ''}`)
    })
    write('\n')
    if (failed) {
      print(`ollama: ${failed}`)
      broadcast({ type: 'ollama.progress', model, status: `error: ${failed}` })
      return false
    }
    print(`  ◂ ${model} · pulled`)
    broadcast({ type: 'ollama.changed', model, change: 'pulled' })
    return true
  } catch (err) {
    write('\n')
    // Ollama keeps downloading a pull it has started even when we stop listening; say so.
    print(abort.signal.aborted ? `  ◂ stopped listening; Ollama may finish the download on its own` : `ollama: ${(err as Error).message}`)
    broadcast({ type: 'ollama.progress', model, status: abort.signal.aborted ? 'stopped' : 'error' })
    return false
  } finally {
    setRunning(null)
  }
}

async function remove(model: string): Promise<boolean> {
  const res = await fetch(new URL('/api/delete', OLLAMA_URL), { method: 'DELETE', body: JSON.stringify({ model }) })
  if (!res.ok) {
    print(`ollama: ${await errorOf(res)}`)
    return false
  }
  print(`deleted '${model}'`)
  broadcast({ type: 'ollama.changed', model, change: 'removed' })
  return true
}

/**
 * `ollama create <name> -f <Modelfile>`. A Modelfile whose FROM is a model tag
 * is read here and sent to /api/create as JSON (printed, dimmed, so the
 * mapping is visible). FROM or ADAPTER pointing at a file needs a blob upload,
 * which the CLI already does, so those run the real CLI.
 */
async function create(name: string, file: string, quantize?: string): Promise<boolean> {
  let text: string
  try {
    text = await fs.readFile(path.join(ROOT, file), 'utf8')
  } catch {
    print(`ollama create: no such file ${file}`)
    return false
  }
  const m = parseModelfile(text)
  if (m.errors.length) {
    m.errors.forEach((e) => print(`Modelfile ${e}`))
    return false
  }
  if (isPath(m.from!) || m.adapters.length) {
    const ok = await spawnStreamed('ollama', ['create', name, '-f', file, ...(quantize ? ['-q', quantize] : [])], env)
    if (ok) broadcast({ type: 'ollama.changed', model: name, change: 'created' })
    return ok
  }
  const body = {
    model: name,
    from: m.from,
    ...(m.system !== undefined ? { system: m.system } : {}),
    ...(m.template !== undefined ? { template: m.template } : {}),
    ...(m.license.length ? { license: m.license } : {}),
    ...(Object.keys(m.parameters).length ? { parameters: m.parameters } : {}),
    ...(m.messages.length ? { messages: m.messages } : {}),
    ...(quantize ? { quantize } : {}),
    stream: true,
  }
  const shown = JSON.stringify({ ...body, stream: undefined }, (_k, v: unknown) => (typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '…' : v))
  print(dim(`  POST /api/create ${shown}`))
  const abort = new AbortController()
  setRunning({ abort })
  try {
    const res = await ollamaPost('/api/create', body, abort.signal)
    if (!res.ok || !res.body) {
      print(`ollama: ${await errorOf(res)}`)
      return false
    }
    let failed = ''
    await readNdjson(res.body, (line) => {
      const p = line as { status?: string; error?: string }
      if (p.error) failed = p.error
      else if (p.status) print(p.status)
    })
    if (failed) {
      print(`ollama: ${failed}`)
      return false
    }
    print(`  ◂ ${name} · created`)
    broadcast({ type: 'ollama.changed', model: name, change: 'created' })
    return true
  } catch (err) {
    print(`ollama: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}

/** `ollama run-once` = one /api/chat call, streamed into the terminal and logged like a Chat exchange. */
async function runOnce(args: string[]): Promise<boolean> {
  const [model, ...rest] = args
  let system: string | undefined
  let think: boolean | undefined
  let format: unknown
  let image: { path: string; base64: string } | null = null
  const words: string[] = []
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--system') system = rest[++i]
    else if (rest[i] === '--image') {
      const rel = rest[++i] ?? ''
      image = await readPicture(rel)
      if (!image) {
        print(`ollama run-once: --image takes a .jpg, .png or .webp inside workspace/ (${rel || 'none given'})`)
        return false
      }
    }
    else if (rest[i] === '--no-think') think = false
    else if (rest[i] === '--format') {
      // "json", or a JSON schema the answer must match (Ollama structured outputs)
      const f = rest[++i] ?? ''
      try {
        format = f === 'json' ? 'json' : JSON.parse(f)
      } catch {
        print('ollama run-once: --format takes json or a JSON schema')
        return false
      }
    } else words.push(rest[i])
  }
  const prompt = words.join(' ')
  if (!model || !prompt) {
    print('usage: ollama run-once <model> [--system "<text>"] [--image workspace/images/<set>/<photo>] [--no-think] [--format json|<schema>] <prompt…>')
    return false
  }

  const messages: ChatMessage[] = [...(system ? [{ role: 'system' as const, content: system }] : []), { role: 'user', content: prompt, ...(image ? { images: [image.base64] } : {}) }]
  const abort = new AbortController()
  setRunning({ abort })
  let answer = ''
  let thinking = ''
  let last: ChatChunk | undefined
  let wasThinking = false
  try {
    const res = await ollamaPost('/api/chat', { model, messages, stream: true, ...(think === false ? { think } : {}), ...(format ? { format } : {}) }, abort.signal)
    if (!res.ok || !res.body) {
      print(`ollama: ${await errorOf(res)}`)
      return false
    }
    await readNdjson(res.body, (line) => {
      const chunk = line as ChatChunk
      last = chunk
      const t = chunk.message?.thinking ?? ''
      const c = chunk.message?.content ?? ''
      if (t) {
        if (!wasThinking) write('\x1b[2m') // dim while thinking
        wasThinking = true
        thinking += t
        write(t)
      }
      if (c) {
        if (wasThinking) write('\x1b[22m\n\n')
        wasThinking = false
        answer += c
        write(c)
      }
    })
    print('')
    const where = await appendChat({
      timestamp: new Date().toISOString(),
      model,
      prompt,
      ...(image ? { image: image.path } : {}),
      system,
      answer,
      ...(thinking ? { thinking } : {}),
      stats: { evalCount: last?.eval_count, durationMs: last?.total_duration ? Math.round(last.total_duration / 1e6) : undefined },
    })
    const secs = last?.total_duration ? `${(last.total_duration / 1e9).toFixed(1)}s` : ''
    print('  ◂ ' + [model, last?.eval_count ? `${last.eval_count} tokens` : '', secs, `workspace/${where}`].filter(Boolean).join(' · '))
    return true
  } catch (err) {
    print(abort.signal.aborted ? '\x1b[22m\r\n  ◂ stopped' : `ollama: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}

const TAG = /^[\w.\-/]+(:[\w.\-]+)?$/

export async function ollamaCommand(args: string[]): Promise<boolean> {
  const [sub, ...rest] = args
  switch (sub) {
    case 'list':
    case 'ls':
      return spawnStreamed('ollama', ['list'], env)
    case 'show':
      if (!rest[0]) {
        print('usage: ollama show <model> [--modelfile|--license|--parameters|--system|--template]')
        return false
      }
      if (rest.slice(1).some((a) => !/^--(modelfile|license|parameters|system|template|verbose)$/.test(a))) return refuse(`ollama show ${rest.join(' ')}`)
      return spawnStreamed('ollama', ['show', ...rest], env)
    case 'pull':
    case 'rm':
      if (rest.length !== 1 || !TAG.test(rest[0])) {
        print(`usage: ollama ${sub} <model>`)
        return false
      }
      return sub === 'pull' ? pull(rest[0]) : remove(rest[0])
    case 'create': {
      const [name, ...opts] = rest
      if (!name || !TAG.test(name)) {
        print('usage: ollama create <name> -f workspace/modelfiles/<name>.Modelfile [-q q4_K_M]')
        return false
      }
      let file: string | null = null
      let quantize: string | undefined
      for (let i = 0; i < opts.length; i++) {
        if (opts[i] === '-f' || opts[i] === '--file') {
          file = opts[i + 1] ? scopePath(opts[++i]) : null
          if (!file) {
            print('ollama create: the Modelfile must be inside workspace/')
            return false
          }
        } else if ((opts[i] === '-q' || opts[i] === '--quantize') && /^[\w.]+$/.test(opts[i + 1] ?? '')) quantize = opts[++i]
        else return refuse(`ollama create … ${opts[i]}`)
      }
      if (!file) {
        print('ollama create: give the Modelfile with -f workspace/modelfiles/<name>.Modelfile')
        return false
      }
      return create(name, file, quantize)
    }
    case 'run-once':
      return runOnce(rest)
    case 'run':
      print('ollama run is interactive and needs a real terminal; use ollama run-once <model> <prompt>')
      return false
    default:
      return refuse(['ollama', ...args].join(' '))
  }
}
