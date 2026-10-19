import { useCallback, useEffect, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { usePipeline } from '../hooks/usePipeline'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { runCommand } from '../lib/helper'
import { readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { HF_BASES } from '@shared/library'
import type { Quantize } from '@shared/recipes'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import PipelineSteps from './PipelineSteps'

interface AdapterManifest {
  name: string
  folder: string
  base: string
  hfBase?: string
  heldOut?: { n: number; before: number; after: number }
  data: string
  run: string
  method: string
  rank: number
  layers: number
  iters: number
  license: string
  final?: { trainLoss?: number; valLoss?: number }
}

interface FusedManifest {
  name: string
  folder: string
  adapter: string
  base: string
}

const sameTag = (a: string, b: string) => a.replace(/:latest$/, '') === b.replace(/:latest$/, '')

/**
 * Adapters (plan §3.2): the weights training made, small enough to share.
 * Export runs fuse + register as one recipe: the adapter is folded into its
 * base, and Ollama imports the result (quantized) as a model to chat with.
 */
export default function AdaptersPanel({ onChatPair }: { onChatPair: (a: string, b: string) => void }) {
  const [adapters, setAdapters] = useState<AdapterManifest[]>([])
  const [fused, setFused] = useState<FusedManifest[]>([])
  const [quantize, setQuantize] = useState<Quantize>('int8')
  const { models } = useOllamaModels()
  const pipe = usePipeline(['export', 'fuse', 'register'])
  const running = !!pipe && !pipe.done

  const load = useCallback(() => {
    void readManifests<AdapterManifest>('adapters').then((a) => setAdapters(a.sort((x, y) => (y.run ?? '').localeCompare(x.run ?? ''))))
    void readManifests<FusedManifest>('fused').then(setFused)
  }, [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path.startsWith('adapters/') || e.path.startsWith('fused/')) && e.path.endsWith('manifest.json') && load(), [load]),
  )

  return (
    <section className="panel" aria-label="adapters">
      <div className="choice" role="radiogroup" aria-label="quantize on import">
        <span className="label label--muted">ollama imports it as</span>
        {(['int8', 'int4', 'none'] as Quantize[]).map((q) => (
          <button key={q} type="button" role="radio" aria-checked={q === quantize} className={`text-button ${q === quantize ? 'is-active' : ''}`.trim()} onClick={() => setQuantize(q)}>
            {q === 'none' ? 'fp16 (no quantizing)' : q}
          </button>
        ))}
      </div>
      {pipe && <PipelineSteps p={pipe} />}

      <h2 className="panel__title label">adapters · workspace/adapters</h2>
      <div className="cards">
        {adapters.map((a) => {
          const runsAs = HF_BASES.find((b) => b.id === (a.hfBase ?? a.base))?.runsAs
          const registered = models.some((m) => sameTag(m.name, a.name))
          const baseInstalled = runsAs && models.some((m) => sameTag(m.name, runsAs))
          const cmd = joinWords(['export', a.name, '--quantize', quantize])
          return (
            <Manifest
              key={a.name}
              name={a.name}
              badges={
                <>
                  <Badge>{a.method}</Badge>
                  {registered && <Badge>runs on</Badge>}
                </>
              }
              lines={[
                `on ${a.base.split('/').at(-1)} · rank ${a.rank} · ${a.layers} layers · ${a.iters} iters`,
                a.heldOut ? `held out: prefers chosen ${Math.round(a.heldOut.before * 100)}% → ${Math.round(a.heldOut.after * 100)}%` : '',
                `data ${a.data} · run ${a.run}`,
                a.final?.trainLoss !== undefined ? `final train ${a.final.trainLoss} · val ${a.final.valLoss ?? '–'}` : '',
                a.license,
              ]}
              actions={
                <>
                  <CommandPreview command={cmd} onRun={() => void runCommand(cmd)} running={running && (pipe?.params as { adapter?: string })?.adapter === a.name} disabled={running} label="export" />
                  {registered && (
                    <button type="button" className="text-button" onClick={() => onChatPair(baseInstalled ? runsAs! : a.name, a.name)}>
                      {baseInstalled ? `chat: ${runsAs} vs ${a.name}` : `chat with ${a.name}`}
                    </button>
                  )}
                </>
              }
            />
          )
        })}
        {adapters.length === 0 && <p className="label label--muted">no adapters yet: train one</p>}
      </div>

      {fused.length > 0 && (
        <>
          <h2 className="panel__title label">fused · workspace/fused</h2>
          <div className="cards">
            {fused.map((f) => {
              const cmd = joinWords(['register', f.name, '--quantize', quantize])
              return (
                <Manifest
                  key={f.name}
                  name={f.name}
                  lines={[`adapter ${f.adapter} folded into ${f.base.split('/')[1]}`, 'full model, Hugging Face format']}
                  actions={<CommandPreview command={cmd} onRun={() => void runCommand(cmd)} disabled={running} label="register" />}
                />
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
