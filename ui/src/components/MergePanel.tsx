import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { usePipeline } from '../hooks/usePipeline'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { runCommand } from '../lib/helper'
import { readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { HF_BASES } from '@shared/library'
import { mergeArgs, mergeLine } from '@shared/recipes'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import PipelineSteps from './PipelineSteps'
import { Explained } from '../explain/Explained'

interface AdapterManifest {
  name: string
  base: string
  method: string
  rank: number
  layers: number
  data: string
  license: string
}

interface MergeManifest extends AdapterManifest {
  a: string
  b: string
  ratio: number
  created: string
}

const sameTag = (a: string, b: string) => a.replace(/:latest$/, '') === b.replace(/:latest$/, '')
/** Adapters merge only when their tensors line up: same base, type, rank and layers. A Prefer (DPO) adapter is LoRA underneath. */
const tensors = (m: AdapterManifest) => (m.method === 'dpo' ? 'lora' : m.method)
const compatible = (x: AdapterManifest, y: AdapterManifest) => x.base === y.base && tensors(x) === tensors(y) && x.rank === y.rank && x.layers === y.layers

/**
 * Merge (plan §3.2): blend two adapters trained on the same base into a
 * third, out = (1 − t)·A + t·B. The merge is an adapter like any other:
 * export it, then chat with A, B and the blend side by side.
 */
export default function MergePanel({ onChatModels }: { onChatModels: (models: string[]) => void }) {
  const [adapters, setAdapters] = useState<AdapterManifest[]>([])
  const [merges, setMerges] = useState<MergeManifest[]>([])
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [t, setT] = useState(0.5)
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const { models } = useOllamaModels()
  const pipe = usePipeline(['merge', 'export'])
  const running = !!pipe && !pipe.done

  const load = useCallback(() => {
    void readManifests<AdapterManifest>('adapters').then(setAdapters)
    void readManifests<MergeManifest>('merges').then((m) => setMerges(m.sort((x, y) => y.created.localeCompare(x.created))))
  }, [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path.startsWith('adapters/') || e.path.startsWith('merges/')) && e.path.endsWith('manifest.json') && load(), [load]),
  )

  const A = adapters.find((x) => x.name === a)
  const partners = useMemo(() => adapters.filter((x) => x.name !== a && (!A || compatible(A, x))), [adapters, a, A])
  useEffect(() => {
    if (!a && adapters.length) setA(adapters[0].name)
  }, [adapters, a])
  useEffect(() => {
    if (!partners.some((x) => x.name === b)) setB(partners[0]?.name ?? '')
  }, [partners, b])
  useEffect(() => {
    if (!touched && a && b) setName(`${a.replace(/-360m|-1\.7b/, '')}-x-${b.replace(/-360m|-1\.7b/, '')}-${Math.round(t * 100)}`.slice(0, 64))
  }, [a, b, t, touched])

  const taken = merges.some((m) => m.name === name) || adapters.some((m) => m.name === name)
  const valid = !!a && !!b && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(name) && !taken
  const line = joinWords(mergeLine(name, a, b, t))

  return (
    <section className="panel" aria-label="merge">
      <div className="merge-form">
        <label className="field">
          <span className="label label--muted">a · weight {(1 - t).toFixed(2)}</span>
          <Explained id="merge.a">
            <select value={a} onChange={(e) => setA(e.target.value)}>
              {adapters.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name}
                </option>
              ))}
            </select>
          </Explained>
          {A && <span className="label label--muted">{A.data} · {A.base.split('/')[1]} · r{A.rank} · {A.layers} layers</span>}
        </label>
        <label className="slider merge-form__ratio">
          <span className="label label--muted">
            t <span className="label">{t.toFixed(2)}</span>
          </span>
          <Explained id="merge.t">
            <input type="range" min={0} max={1} step={0.05} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="ratio: 0 is all A, 1 is all B" />
          </Explained>
          <span className="merge-form__ends label label--muted">
            <span>all a</span>
            <span>all b</span>
          </span>
        </label>
        <label className="field">
          <span className="label label--muted">b · weight {t.toFixed(2)}</span>
          <Explained id="merge.b">
            <select value={b} onChange={(e) => setB(e.target.value)} disabled={!partners.length}>
              {partners.length === 0 && <option value="">no adapter with the same base, type, rank and layers</option>}
              {partners.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name}
                </option>
              ))}
            </select>
          </Explained>
          {b && <span className="label label--muted">{adapters.find((x) => x.name === b)?.data}</span>}
        </label>
      </div>
      <div className="inline-fields">
        <label className="field">
          <span className="label label--muted">merge name</span>
          <input type="text" value={name} onChange={(e) => (setTouched(true), setName(e.target.value.toLowerCase()))} spellCheck={false} />
        </label>
        <div className="choice">
          <span className="label label--muted">method</span>
          <span className="text-button is-active">linear</span>
          <span className="label label--muted">(SLERP later)</span>
        </div>
      </div>
      {taken && <span className="label label--muted">that name is taken</span>}
      <Explained id="merge.run">
        <CommandPreview command={line} onRun={() => void runCommand(line)} disabled={!valid || running} running={running && pipe?.recipe === 'merge'} label="merge" />
      </Explained>
      <details className="real-command">
        <summary className="label label--muted">which runs</summary>
        <code>{joinWords(mergeArgs(a, b, t, name))}</code>
      </details>
      {pipe && <PipelineSteps p={pipe} />}

      <h2 className="panel__title label">merges · workspace/merges</h2>
      <div className="cards">
        {merges.map((m) => {
          const registered = models.some((x) => sameTag(x.name, m.name))
          const trio = [m.a, m.b, m.name]
          const allRun = trio.every((n) => models.some((x) => sameTag(x.name, n)))
          const runsAs = HF_BASES.find((x) => x.id === m.base)?.runsAs
          const cmd = joinWords(['export', m.name, '--quantize', 'int8'])
          return (
            <Manifest
              key={m.name}
              name={m.name}
              badges={
                <>
                  <Badge>linear · t {m.ratio}</Badge>
                  {registered && <Badge>runs on</Badge>}
                </>
              }
              lines={[`${(1 - m.ratio).toFixed(2)} × ${m.a} + ${m.ratio.toFixed(2)} × ${m.b}`, `on ${m.base.split('/')[1]} · r${m.rank} · ${m.layers} layers`, m.license]}
              actions={
                <>
                  {!registered && (
                    <Explained id="adapters.export">
                      <CommandPreview command={cmd} onRun={() => void runCommand(cmd)} disabled={running} label="export" />
                    </Explained>
                  )}
                  {registered && (
                    <Explained id="merge.chat">
                      <button type="button" className="text-button" onClick={() => onChatModels(trio)} disabled={!allRun} title={allRun ? '' : 'export A and B too (Adapters panel)'}>
                        chat: {m.a} · {m.b} · {m.name}
                      </button>
                    </Explained>
                  )}
                  {registered && runsAs && (
                    <button type="button" className="text-button" onClick={() => onChatModels([runsAs, ...trio])}>
                      + the untouched base
                    </button>
                  )}
                </>
              }
            />
          )
        })}
        {merges.length === 0 && <p className="label label--muted">no merges yet</p>}
      </div>
    </section>
  )
}
