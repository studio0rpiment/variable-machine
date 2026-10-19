/**
 * A small Modelfile reader, shared by the helper (to send /api/create) and the
 * UI (to mark which lines are weights). No imports so both can load it.
 *
 * FROM and ADAPTER name weights. SYSTEM, PARAMETER, TEMPLATE, MESSAGE and
 * LICENSE travel with the weights but change none of them.
 */

export type Instruction = 'FROM' | 'ADAPTER' | 'SYSTEM' | 'PARAMETER' | 'TEMPLATE' | 'MESSAGE' | 'LICENSE' | 'REQUIRES'

export const WEIGHTS: ReadonlySet<Instruction> = new Set(['FROM', 'ADAPTER'])

export interface Line {
  /** 0-based first line of this instruction in the text */
  start: number
  /** number of text lines it spans (triple-quoted values span several) */
  span: number
  kind: Instruction | 'comment' | 'blank' | 'unknown'
  args: string
}

export interface Parsed {
  lines: Line[]
  from?: string
  adapters: string[]
  system?: string
  template?: string
  license: string[]
  parameters: Record<string, string | number | boolean | string[]>
  messages: { role: string; content: string }[]
  errors: string[]
}

const KINDS = new Set<string>(['FROM', 'ADAPTER', 'SYSTEM', 'PARAMETER', 'TEMPLATE', 'MESSAGE', 'LICENSE', 'REQUIRES'])

function unquote(v: string): string {
  const t = v.trim()
  if (t.startsWith('"""') && t.endsWith('"""') && t.length >= 6) return t.slice(3, -3)
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t.slice(1, -1)
  return t
}

function coerce(v: string): string | number | boolean {
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v === 'true' || v === 'false') return v === 'true'
  return v
}

export function parseModelfile(text: string): Parsed {
  const src = text.split('\n')
  const out: Parsed = { lines: [], adapters: [], license: [], parameters: {}, messages: [], errors: [] }
  for (let i = 0; i < src.length; i++) {
    const raw = src[i]
    const trimmed = raw.trim()
    if (!trimmed) {
      out.lines.push({ start: i, span: 1, kind: 'blank', args: '' })
      continue
    }
    if (trimmed.startsWith('#')) {
      out.lines.push({ start: i, span: 1, kind: 'comment', args: trimmed })
      continue
    }
    const m = /^(\S+)\s*(.*)$/.exec(trimmed)!
    const word = m[1].toUpperCase()
    let args = m[2]
    let span = 1
    // A value opened with """ runs until the closing """, possibly lines later.
    if (args.includes('"""') && (args.match(/"""/g) ?? []).length === 1) {
      while (i + span < src.length && !src[i + span].includes('"""')) span++
      if (i + span < src.length) span++
      else out.errors.push(`line ${i + 1}: """ is never closed`)
      args = [args, ...src.slice(i + 1, i + span)].join('\n')
    }
    const kind = KINDS.has(word) ? (word as Instruction) : 'unknown'
    if (kind === 'unknown') out.errors.push(`line ${i + 1}: unknown instruction ${m[1]}`)
    out.lines.push({ start: i, span, kind, args })
    i += span - 1

    switch (kind) {
      case 'FROM':
        out.from = args.trim()
        break
      case 'ADAPTER':
        out.adapters.push(args.trim())
        break
      case 'SYSTEM':
        out.system = unquote(args)
        break
      case 'TEMPLATE':
        out.template = unquote(args)
        break
      case 'LICENSE':
        out.license.push(unquote(args))
        break
      case 'MESSAGE': {
        const mm = /^(\S+)\s+([\s\S]*)$/.exec(args.trim())
        if (mm) out.messages.push({ role: mm[1], content: unquote(mm[2]) })
        break
      }
      case 'PARAMETER': {
        const pm = /^(\S+)\s+([\s\S]*)$/.exec(args.trim())
        if (!pm) {
          out.errors.push(`line ${i + 1}: PARAMETER needs a name and a value`)
          break
        }
        const [, key, value] = pm
        const v = coerce(unquote(value))
        if (key === 'stop') out.parameters.stop = [...((out.parameters.stop as string[]) ?? []), String(v)]
        else out.parameters[key] = v
        break
      }
    }
  }
  if (!out.from) out.errors.push('a Modelfile needs a FROM line')
  return out
}

/** A FROM or ADAPTER value that names a file rather than an Ollama model tag. */
export function isPath(v: string) {
  return /^(\.{1,2}\/|\/|~\/)/.test(v) || /\.(gguf|safetensors|bin)$/i.test(v)
}
