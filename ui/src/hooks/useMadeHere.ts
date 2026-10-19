import { useCallback, useEffect, useState } from 'react'
import { useHelperEvent } from './useHelper'
import { listDir, readFile } from '../lib/workspace'

interface AdapterInfo {
  method?: string
  data?: string
  base?: string
  hfBase?: string
  a?: string
  b?: string
  ratio?: number
}

const short = (id: string) => id.split('/').at(-1) ?? id

/**
 * How the models made in this workspace came about, in a sentence each, read
 * from the workspace's own records. Every model this app creates has a
 * Modelfile in workspace/modelfiles: those from training, preference tuning
 * or blending name the adapter they came from (and its manifest says how it
 * was made); variants from the Modelfile tab name the model they change.
 */
async function describe(text: string): Promise<string | null> {
  const made = /^# made by Variable Machine from adapter (\S+) on (\S+)/m.exec(text)
  if (made) {
    const [, adapter, base] = made
    for (const dir of ['adapters', 'merges']) {
      const raw = await readFile(`${dir}/${adapter}/manifest.json`)
      if (!raw) continue
      const m = JSON.parse(raw) as AdapterInfo
      const on = ` It starts from ${short(m.hfBase ?? base)}.`
      if (dir === 'merges' && m.a && m.b) {
        const t = m.ratio ?? 0.5
        const mix = t === 0.5 ? 'half and half' : `${Math.round((1 - t) * 100)}% ${m.a}, ${Math.round(t * 100)}% ${m.b}`
        return `Made here by blending two adapters, ${m.a} and ${m.b}, ${mix}.${on}`
      }
      if (m.method === 'dpo') return `Made here by preference tuning: it leans toward the answers chosen in ${m.data}.${on}`
      return `Made here by training: it imitates the examples in ${m.data}.${on}`
    }
    return `Made here from the adapter ${adapter}.`
  }
  const from = /^FROM\s+(\S+)/m.exec(text)?.[1]
  if (!from || from.startsWith('.') || from.startsWith('/')) return null
  const system = /^SYSTEM\s+"""([\s\S]*?)"""/m.exec(text)?.[1]?.trim()
  const told = system ? ` It is told: "${system.length > 110 ? system.slice(0, 107) + '…' : system}"` : ''
  return `Made here: ${from} with new instructions and no training.${told}`
}

export function useMadeHere() {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    const files = (await listDir('modelfiles')).filter((f) => f.name.endsWith('.Modelfile'))
    const out: Record<string, string> = {}
    for (const f of files) {
      const name = f.name.replace(/\.Modelfile$/, '')
      const text = await readFile(`modelfiles/${f.name}`)
      const d = text && (await describe(text))
      if (d) out[name] = d
    }
    setNotes(out)
  }, [])
  useEffect(() => void load(), [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => /^(modelfiles|adapters|merges)\//.test(e.path) && void load(), [load]),
  )
  /** The note for an installed model's name, with or without ":latest". */
  return (model: string) => notes[model.replace(/:latest$/, '')]
}
