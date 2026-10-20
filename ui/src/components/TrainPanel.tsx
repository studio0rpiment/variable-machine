import { useCallback, useEffect, useState, useRef } from 'react'
import { useHelperEvent, useHelperState } from '../hooks/useHelper'
import { usePipeline } from '../hooks/usePipeline'
import { runCommand, sendEvent } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { HF_BASES } from '@shared/library'
import { PY_ENV, TIER_DEFAULTS, trainArgs, trainLine, type FineTune, type TrainParams } from '@shared/recipes'
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

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

interface RunManifest {
  name: string
  folder: string
  status: string
  seconds?: number
  params: TrainParams
  final?: { trainLoss?: number; valLoss?: number }
  license: string
}

/**
 * Train (plan §3.2): pick a base and a dataset, set the knobs, see the exact
 * command, run it, watch loss as mlx-lm reports it. The run's folder keeps
 * config, command, log, loss and manifest.
 */
/** withData: set from the Data tab's "use it" (a new n each time, so the same dataset can be sent twice). */
export default function TrainPanel({ onAdapters, onChatPair, onChat, withData }: { onAdapters: () => void; onChatPair: (a: string, b: string) => void; onChat: (model: string) => void; withData?: { data: string; n: number } }) {
  const { status } = useHelperState()
  const tier = status?.tier ?? '16'
  const defaults = TIER_DEFAULTS[tier]
  const [sets, setSets] = useState<DatasetManifest[]>([])
  const [runs, setRuns] = useState<RunManifest[]>([])
  const [shown, setShown] = useState<{ run: string; points: LossPoint[]; iters: number; adapter?: string; base?: string; finished?: boolean } | null>(null)
  const [p, setP] = useState<TrainParams>({ name: '', data: '', ...TIER_DEFAULTS['16'] })
  const [touchedName, setTouchedName] = useState(false)
  const pipe = usePipeline(['train'])
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

  // Tier defaults arrive with the first status event.
  useEffect(() => setP((x) => ({ ...x, ...defaults })), [defaults])

  const loadSets = useCallback(() => void readManifests<DatasetManifest>('data').then(setSets), [])
  const loadRuns = useCallback(() => void readManifests<RunManifest & { recipe?: string }>('runs').then((r) => setRuns(r.filter((x) => x.recipe !== 'prefer').sort((a, b) => b.folder.localeCompare(a.folder)))), [])
  useEffect(loadSets, [loadSets])
  useEffect(loadRuns, [loadRuns])
  useHelperEvent(
    'workspace.changed',
    useCallback(
      (e) => {
        if (e.path.startsWith('data/') && e.path.endsWith('manifest.json')) loadSets()
        if (e.path.startsWith('runs/') && e.path.endsWith('manifest.json')) loadRuns()
      },
      [loadSets, loadRuns],
    ),
  )

  // Chat datasets with some rows set aside; preference sets belong to the Prefer panel.
  const ready = sets.filter((s) => s.format !== 'preference' && s.counts.valid > 0)
  useEffect(() => {
    if (!p.data && ready[0]) setP((x) => ({ ...x, data: ready[0].name }))
  }, [ready, p.data])
  useEffect(() => {
    if (withData) setP((x) => ({ ...x, data: withData.data }))
  }, [withData])
  const base = HF_BASES.find((b) => b.id === p.base)
  useEffect(() => {
    if (!touchedName && p.data && base && !running) setP((x) => ({ ...x, name: free(`${p.data}-${base.params.toLowerCase()}`) }))
  }, [p.data, base, touchedName, free, running])

  const showRun = async (r: RunManifest) => {
    const text = (await readFile(`runs/${r.folder}/loss.jsonl`)) ?? ''
    const points = text
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LossPoint)
    setShown({ run: r.folder, points, iters: r.params.iters, adapter: r.params.name, base: r.params.base, finished: r.status === 'finished' })
  }

  // the run in progress has already written its manifest; it doesn't count as taking its own name
  const taken = runs.some((r) => r.params?.name === p.name) && !(running && (pipe?.params as TrainParams | undefined)?.name === p.name)
  const valid = NAME.test(p.name) && !!p.data && !taken
  const line = joinWords(trainLine(p))
  const real = joinWords([...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...trainArgs(p, 'workspace/runs/<time>-' + p.name)])
  const set = <K extends keyof TrainParams>(k: K) => (v: TrainParams[K]) => setP((x) => ({ ...x, [k]: v }))
  const heavy = tier === '16' && p.base.includes('1.7B')

  return (
    <section className="panel" aria-label="train" ref={top}>
      <div className="train-form">
        <div className="train-form__col">
          <label className="field">
            <span className="label label--muted">base · trains on</span>
            <Explained id="train.base">
              <select value={p.base} onChange={(e) => set('base')(e.target.value)}>
                {HF_BASES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id.split('/')[1]}
                  </option>
                ))}
              </select>
            </Explained>
          </label>
          {base && (
            <span className="label label--muted">
              {base.license} · {base.architecture} · about {base.loraGB}GB during LoRA{heavy ? ' · on 16GB use batch 1' : ''}
            </span>
          )}
          <label className="field">
            <span className="label label--muted">data</span>
            <Explained id="train.data">
              <select value={p.data} onChange={(e) => set('data')(e.target.value)}>
                {ready.length === 0 && <option value="">no split datasets yet (Data panel)</option>}
                {ready.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} · {s.counts.train}/{s.counts.valid}
                  </option>
                ))}
              </select>
            </Explained>
          </label>
          <label className="field">
            <span className="label label--muted">adapter name</span>
            <input type="text" value={p.name} onChange={(e) => (setTouchedName(true), set('name')(e.target.value.toLowerCase()))} spellCheck={false} />
          </label>
          {taken && <span className="label label--muted">an adapter with that name exists</span>}
        </div>
        <div className="train-form__col">
          <Explained id="train.type">
            <Choice label="type" value={p.type} options={['lora', 'dora', 'full'] as FineTune[]} onChange={set('type')} />
          </Explained>
          <Explained id="train.rank">
            <Steps label="rank" value={p.rank} options={[4, 8, 16, 32, 64]} onChange={set('rank')} />
          </Explained>
          <Explained id="train.layers">
            <Steps label="layers" value={p.layers} options={[4, 8, 12, 16, 24, 32]} onChange={set('layers')} />
          </Explained>
          <Explained id="train.lr">
            <Steps label="learning rate" value={p.lr} options={[1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4]} onChange={set('lr')} format={(v) => v.toExponential(0)} />
          </Explained>
        </div>
        <div className="train-form__col">
          <Explained id="train.iters">
            <Steps label="iterations" value={p.iters} options={[50, 100, 200, 300, 500, 1000]} onChange={set('iters')} />
          </Explained>
          <Explained id="train.batch">
            <Choice label="batch" value={p.batch} options={[1, 2, 4, 8]} onChange={set('batch')} />
          </Explained>
          <Explained id="train.maxSeq">
            <Choice label="max seq" value={p.maxSeq} options={[512, 1024, 2048]} onChange={set('maxSeq')} />
          </Explained>
          <Explained id="train.evalEvery">
            <Choice label="eval every" value={p.evalEvery} options={[25, 50, 100]} onChange={set('evalEvery')} />
          </Explained>
        </div>
      </div>

      <div className="train-run">
        <Explained id="train.run">
          <CommandPreview command={line} onRun={() => void runCommand(line)} disabled={!valid} running={running} label="train" />
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
          <LossChart points={current.points} iters={(current.params as TrainParams).iters} live={!current.done} />
          <LossNotes points={current.points} live={!current.done} kind="train" />
          {current.done && current.ok && <NextStep adapter={(current.params as TrainParams).name} base={(current.params as TrainParams).base} onChatPair={onChatPair} onChat={onChat} onAdapters={onAdapters} />}
        </>
      ) : (
        shown && (
          <>
            <LossChart points={shown.points} iters={shown.iters} />
            <LossNotes points={shown.points} kind="train" />
            {shown.finished && shown.adapter && shown.base && <NextStep adapter={shown.adapter} base={shown.base} onChatPair={onChatPair} onChat={onChat} onAdapters={onAdapters} />}
          </>
        )
      )}

      <h2 className="panel__title label">runs · workspace/runs</h2>
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
              `${r.params?.base?.split('/')[1]} · ${r.params?.data} · ${r.params?.type} r${r.params?.rank} · ${r.params?.iters} iters`,
              r.final?.trainLoss !== undefined ? `train ${r.final.trainLoss} · val ${r.final.valLoss ?? '–'}${r.seconds ? ` · ${Math.floor(r.seconds / 60)}m ${r.seconds % 60}s` : ''}` : '',
            ]}
          />
        ))}
        {runs.length === 0 && <p className="label label--muted">no runs yet</p>}
      </div>
    </section>
  )
}
