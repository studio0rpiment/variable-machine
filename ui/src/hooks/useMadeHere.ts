import { useCallback, useEffect, useState } from 'react'
import { useHelperEvent } from './useHelper'
import { listDir, readFile } from '../lib/workspace'
import { HF_BASES } from '@shared/library'

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

export interface MadeHere {
  /** how it came about, in a sentence */
  text: string
  /** the installed model it is a variation of (an Ollama name), for grouping */
  parent?: string
}

/** A training base's untouched Ollama model: what something trained on it is a variation of. */
const runsAs = (hfId: string) => HF_BASES.find((b) => b.id === hfId)?.runsAs

/**
 * How the models made in this workspace came about, in a sentence each, read
 * from the workspace's own records. Every model this app creates has a
 * Modelfile in workspace/modelfiles: those from training, preference tuning
 * or blending name the adapter they came from (and its manifest says how it
 * was made); variants from the Modelfile tab name the model they change.
 */
async function describe(text: string): Promise<MadeHere | null> {
  const made = /^# made by Variable Machine from adapter (\S+) on (\S+)/m.exec(text)
  if (made) {
    const [, adapter, base] = made
    for (const dir of ['adapters', 'merges']) {
      const raw = await readFile(`${dir}/${adapter}/manifest.json`)
      if (!raw) continue
      const m = JSON.parse(raw) as AdapterInfo
      const root = m.hfBase ?? base
      const on = ` It starts from ${short(root)}.`
      const parent = runsAs(root)
      if (dir === 'merges' && m.a && m.b) {
        const t = m.ratio ?? 0.5
        const mix = t === 0.5 ? 'half and half' : `${Math.round((1 - t) * 100)}% ${m.a}, ${Math.round(t * 100)}% ${m.b}`
        return { text: `Made here by blending two adapters, ${m.a} and ${m.b}, ${mix}.${on}`, parent }
      }
      if (m.method === 'dpo') return { text: `Made here by preference tuning: it leans toward the answers chosen in ${m.data}.${on}`, parent }
      return { text: `Made here by training: it imitates the examples in ${m.data}.${on}`, parent }
    }
    return { text: `Made here from the adapter ${adapter}.`, parent: runsAs(base) }
  }
  const from = /^FROM\s+(\S+)/m.exec(text)?.[1]
  if (!from || from.startsWith('.') || from.startsWith('/')) return null
  const system = /^SYSTEM\s+"""([\s\S]*?)"""/m.exec(text)?.[1]?.trim()
  const told = system ? ` It is told: "${system.length > 110 ? system.slice(0, 107) + '…' : system}"` : ''
  return { text: `Made here: ${from} with new instructions and no training.${told}`, parent: from }
}

export function useMadeHere() {
  const [notes, setNotes] = useState<Record<string, MadeHere>>({})
  const load = useCallback(async () => {
    const files = (await listDir('modelfiles')).filter((f) => f.name.endsWith('.Modelfile'))
    const out: Record<string, MadeHere> = {}
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
  /** The record for an installed model's name, with or without ":latest". */
  return (model: string): MadeHere | undefined => notes[model.replace(/:latest$/, '')]
}
