import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { listModels, showModel, type OllamaModel } from '../lib/ollama'
import { onEvent, subscribeState, getState } from '../lib/helper'
import { identifyLicense, type LicenseInfo } from '@shared/licenses'

/**
 * The runs-on inventory, shared by every panel. Re-read when the helper says
 * Ollama's list changed (pull, rm, create — typed or clicked) or Ollama comes
 * up; never on a timer.
 */
let models: OllamaModel[] = []
let error = ''
const listeners = new Set<() => void>()
let snapshot = { models, error }
const emit = () => {
  snapshot = { models, error }
  listeners.forEach((l) => l())
}

export async function reloadModels() {
  try {
    models = await listModels()
    error = ''
  } catch (e) {
    error = (e as Error).message
  }
  emit()
}

onEvent((e) => {
  if (e.type === 'ollama.changed') void reloadModels()
})
let ollamaWasUp = false
subscribeState(() => {
  const up = !!getState().status?.ollama
  if (up && !ollamaWasUp) void reloadModels()
  ollamaWasUp = up
})

export function useOllamaModels() {
  const s = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => snapshot,
  )
  useEffect(() => {
    if (!s.models.length) void reloadModels()
  }, [s.models.length])
  return { ...s, reload: reloadModels }
}

export interface ModelInfo {
  license: LicenseInfo
  /** Ollama's capability words: completion, thinking, tools, vision, embedding, insert */
  abilities: string[]
  /** how many tokens it can hold at once (its context length), when Ollama says */
  contextTokens?: number
  /** the standing instruction it carries (its Modelfile SYSTEM), if any */
  system?: string
}

/** What `ollama show` says about a model, read once per digest and shared by every card. */
const infoCache = new Map<string, Promise<ModelInfo>>()
export function useModelInfo(model: OllamaModel | undefined) {
  const [info, setInfo] = useState<ModelInfo | null>(null)
  const load = useCallback(() => {
    if (!model) return
    let p = infoCache.get(model.digest)
    if (!p) {
      p = showModel(model.name).then((s) => {
        const ctx = Object.entries(s.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))?.[1]
        return { license: identifyLicense(s.license), abilities: s.capabilities ?? ['completion'], contextTokens: typeof ctx === 'number' ? ctx : undefined, system: s.system?.trim() || undefined }
      })
      infoCache.set(model.digest, p)
    }
    p.then(setInfo, () => setInfo({ license: { name: 'license unreadable', open: false }, abilities: [] }))
  }, [model])
  useEffect(load, [load])
  return info
}

export function useLicense(model: OllamaModel | undefined) {
  return useModelInfo(model)?.license ?? null
}
