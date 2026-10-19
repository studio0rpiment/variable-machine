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

/** License per model, read from `ollama show` once per digest. */
const licenseCache = new Map<string, Promise<LicenseInfo>>()
export function useLicense(model: OllamaModel | undefined) {
  const [info, setInfo] = useState<LicenseInfo | null>(null)
  const load = useCallback(() => {
    if (!model) return
    let p = licenseCache.get(model.digest)
    if (!p) {
      p = showModel(model.name).then((s) => identifyLicense(s.license))
      licenseCache.set(model.digest, p)
    }
    p.then(setInfo, () => setInfo({ name: 'license unreadable', open: false }))
  }, [model])
  useEffect(load, [load])
  return info
}
