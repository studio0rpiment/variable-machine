import { useCallback, useEffect, useState, useRef } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { usePipeline } from '../hooks/usePipeline'
import { runCommand, sendEvent } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { HF_BASES } from '@shared/library'
import { PY_ENV, preferArgs, preferLine, type PreferParams } from '@shared/recipes'
import type { DatasetManifest } from '@shared/manifest'
import CommandPreview from './CommandPreview'
import LossChart, { type LossPoint } from './LossChart'
import LossNotes from './LossNotes'
import NextStep from './NextStep'
import { NEXT } from '../explain/next'
import ConfirmButton from './ConfirmButton'
import PipelineSteps from './PipelineSteps'
import Manifest, { Badge } from './Manifest'
import { Choice, Steps } from './Controls'
import { Explained } from '../explain/Explained'

interface RunManifest {
  name: string
  folder: string
  recipe: string
  status: string
  seconds?: number
  params: PreferParams
  heldOut?: { n: number; before: number; after: number; rewardAccuracy?: number }
}

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const pct = (x: number) => `${Math.round(x * 100)}%`

/**
 * Prefer (plan §3.2, optional milestone): DPO on a base or a fused model,
 * from a preference set built out of chat logs. Shows the exact command, the
 * DPO loss as it falls, and the held-out check: how often the model finds the
 * chosen answer more likely than the rejected one, before and after.
 */
/** withData: set from the Data tab's "use it" (a new n each time, so the same dataset can be sent twice). */
export default function PreferPanel({ onAdapters, onChatPair, withData }: { onAdapters: () => void; onChatPair: (a: string, b: string) => void; withData?: { data: string; n: number } }) {
  const [sets, setSets] = useState<DatasetManifest[]>([])
  const [fused, setFused] = useState<{ name: string }[]>([])
  const [runs, setRuns] = useState<RunManifest[]>([])
  const [shown, setShown] = useState<{ run: string; points: LossPoint[]; iters: number; adapter?: string; base?: string; finished?: boolean } | null>(null)
  const [p, setP] = useState<PreferParams>({ name: '', model: HF_BASES[0].id, data: '', beta: 0.1, iters: 100, lr: 2e-5, rank: 8, layers: 8 })
  const [touchedName, setTouchedName] = useState(false)
  const pipe = usePipeline(['prefer'])
  const running = !!pipe && !pipe.done
  // Names already used by a run or an adapter: a fresh run gets the next free one (name, name-2, name-3…).
  const [adapterNames, setAdapterNames] = useState<string[]>([])
  useEffect(() => void readManifests<{ name: string }>('adapters').then((a) => setAdapterNames(a.map((x) => x.name))), [runs])
  const free = useCallback(
    (want: string) => {
      const used = new Set([...runs.map((r) => r.params?.name), ...adapterNames])
      let n = want
      for (let k = 2; used.has(n); k++) n = `${want}-${k}`
      return n
    },
    [runs, adapterNames],
  )
  // "Start over" puts a finished run away (it stays in the runs below), clearing the way for another dataset.
  const [putAway, setPutAway] = useState('')
  const current = pipe && pipe.runId !== putAway ? pipe : null
  const top = useRef<HTMLElement>(null)

  const load = useCallback(() => {
    void readManifests<DatasetManifest>('data').then((d) => setSets(d.filter((x) => x.format === 'preference')))
    void readManifests<{ name: string }>('fused').then(setFused)
    void readManifests<RunManifest>('runs').then((r) => setRuns(r.filter((x) => x.recipe === 'prefer').sort((a, b) => b.folder.localeCompare(a.folder))))
  }, [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => /^(data|fused|runs)\/[^/]+\/manifest\.json$/.test(e.path) && load(), [load]),
  )

  const ready = sets.filter((s) => s.counts.train >= 2 && s.counts.valid > 0)
  useEffect(() => {
    if (!p.data && ready[0]) setP((x) => ({ ...x, data: ready[0].name }))
  }, [ready, p.data])
  useEffect(() => {
    if (withData) setP((x) => ({ ...x, data: withData.data }))
  }, [withData])
  useEffect(() => {
    if (!touchedName && p.data && !running) setP((x) => ({ ...x, name: free(`${p.data}-dpo`) }))
  }, [p.data, touchedName, free, running])

  const showRun = async (r: RunManifest) => {
    const text = (await readFile(`runs/${r.folder}/loss.jsonl`)) ?? ''
    setShown({ run: r.folder, iters: r.params.iters, points: text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as LossPoint), adapter: r.params.name, base: r.params.model, finished: r.status === 'finished' })
  }

  const set = <K extends keyof PreferParams>(k: K) => (v: PreferParams[K]) => setP((x) => ({ ...x, [k]: v }))
  const taken = runs.some((r) => r.params?.name === p.name) && !(running && (pipe?.params as PreferParams | undefined)?.name === p.name)
  const valid = NAME.test(p.name) && !!p.data && !taken
  const line = joinWords(preferLine(p))
  const real = joinWords([...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...preferArgs(p, 'workspace/runs/<time>-' + p.name)])
  const latest = runs[0]

  return (
    <section className="panel" aria-label="prefer" ref={top}>
      <div className="train-form">
        <div className="train-form__col">
          <label className="field">
            <span className="label label--muted">start from · base or fused model</span>
            <Explained id="prefer.model">
              <select value={p.model} onChange={(e) => set('model')(e.target.value)}>
                {HF_BASES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id.split('/')[1]}
                  </option>
                ))}
                {fused.map((f) => (
                  <option key={f.name} value={`workspace/fused/${f.name}`}>
                    fused: {f.name}
                  </option>
                ))}
              </select>
            </Explained>
          </label>
          <label className="field">
            <span className="label label--muted">preference set</span>
            <Explained id="prefer.data">
              <select value={p.data} onChange={(e) => set('data')(e.target.value)}>
                {ready.length === 0 && <option value="">none yet: build one in Data from the chat log, then split it</option>}
                {ready.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} · {s.counts.train} pairs / {s.counts.valid} held out
                  </option>
                ))}
              </select>
            </Explained>
          </label>
          <label className="field">
            <span className="label label--muted">adapter name</span>
            <input type="text" value={p.name} onChange={(e) => (setTouchedName(true), set('name')(e.target.value.toLowerCase()))} spellCheck={false} />
          </label>
          {taken && <span className="label label--muted">a run with that adapter name exists</span>}
        </div>
        <div className="train-form__col">
          <Explained id="prefer.beta">
            <Steps label="beta" value={p.beta} options={[0.05, 0.1, 0.2, 0.5]} onChange={set('beta')} />
          </Explained>
          <Explained id="prefer.iters">
            <Steps label="iterations" value={p.iters} options={[50, 100, 150, 200, 300]} onChange={set('iters')} />
          </Explained>
          <Explained id="prefer.lr">
            <Steps label="learning rate" value={p.lr} options={[5e-6, 1e-5, 2e-5, 5e-5]} onChange={set('lr')} format={(v) => v.toExponential(0)} />
          </Explained>
        </div>
        <div className="train-form__col">
          <Explained id="train.rank">
            <Choice label="rank" value={p.rank} options={[4, 8, 16]} onChange={set('rank')} />
          </Explained>
          <Explained id="train.layers">
            <Choice label="layers" value={p.layers} options={[4, 8, 16]} onChange={set('layers')} />
          </Explained>
          <p className="label label--muted prefer-note">
            beta is how far from where it started the model may move: small beta, bigger change.
          </p>
        </div>
      </div>

      <div className="train-run">
        <Explained id="prefer.run">
          <CommandPreview command={line} onRun={() => void runCommand(line)} disabled={!valid} running={running} label="prefer" />
        </Explained>
        {running && pipe && (
          <Explained id="train.stop">
            <button type="button" className="text-button" onClick={() => sendEvent({ type: 'pipeline.stop', runId: pipe.runId })}>
              stop
            </button>
          </Explained>
        )}
        {current?.done && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setPutAway(current.runId)
              setShown(null)
              setTouchedName(false)
              top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            start over with another dataset
          </button>
        )}
      </div>
      <p className="mf-next">{NEXT.beforeTrain}</p>
      <details className="real-command">
        <summary className="label label--muted">which runs, after the Ollama models are stopped to free memory</summary>
        <code>{real}</code>
      </details>

      {current && <PipelineSteps p={current} />}
      {current ? (
        <>
          <LossChart points={current.points} iters={(current.params as PreferParams).iters} live={!current.done} />
          <LossNotes points={current.points} live={!current.done} kind="prefer" />
          {current.done && current.ok && <NextStep adapter={(current.params as PreferParams).name} base={(current.params as PreferParams).model} onChatPair={onChatPair} onAdapters={onAdapters} />}
        </>
      ) : (
        shown && (
          <>
            <LossChart points={shown.points} iters={shown.iters} />
            <LossNotes points={shown.points} kind="prefer" />
            {shown.finished && shown.adapter && shown.base && <NextStep adapter={shown.adapter} base={shown.base} onChatPair={onChatPair} onAdapters={onAdapters} />}
          </>
        )
      )}

      {latest?.heldOut && (
        <>
        <p className="held-out">
          <span className="label">held out · {latest.heldOut.n} pairs</span>
          <span className="label label--muted">prefers the chosen answer</span>
          <span className="label">before {pct(latest.heldOut.before)}</span>
          <span className="label">after {pct(latest.heldOut.after)}</span>
          {latest.heldOut.rewardAccuracy !== undefined && (
            <span className="label label--muted" title="share of held-out pairs whose margin moved toward the chosen answer, compared with the start">
              reward accuracy {pct(latest.heldOut.rewardAccuracy)}
            </span>
          )}
        </p>
        <p className="label label--muted prefer-note">Try the result in Chat next to the untouched base: a preference shows in what the model does, not only in these numbers. Push too hard (a high learning rate, many iterations) and answers collapse.</p>
        </>
      )}

      <h2 className="panel__title label">preference runs · workspace/runs</h2>
      <div className="cards">
        {runs.map((r) => (
          <Manifest
            key={r.folder}
            name={r.folder}
            active={shown?.run === r.folder}
            onSelect={() => void showRun(r)}
            actions={
              // the card itself opens the chart; removing shouldn't
              <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <ConfirmButton label="remove" confirmLabel="to the Trash?" onConfirm={() => void (shown?.run === r.folder && setShown(null), runCommand(joinWords(['trash', `runs/${r.folder}`])))} />
              </span>
            }
            badges={<Badge warn={r.status !== 'finished'}>{r.status}</Badge>}
            lines={[
              `${r.params.model.split('/').at(-1)} · ${r.params.data} · beta ${r.params.beta} · ${r.params.iters} iters`,
              r.heldOut ? `held out: ${pct(r.heldOut.before)} → ${pct(r.heldOut.after)} of ${r.heldOut.n}` : '',
            ]}
          />
        ))}
        {runs.length === 0 && <p className="label label--muted">no preference runs yet</p>}
      </div>
    </section>
  )
}
