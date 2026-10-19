import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { DATA_SOURCES } from '@shared/library'
import { rowProblem, type ChatRow } from '@shared/chatRow'
import type { DatasetManifest } from '@shared/manifest'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import DataRows from './DataRows'
import DataGenerator from './DataGenerator'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const dolly = DATA_SOURCES.dolly

/**
 * Data (plan §3.2): datasets in workspace/data, each a train/valid pair of
 * chat-format JSONL files and a manifest. Import, validate, split, count and
 * generate are all commands, so the terminal shows each one.
 */
export default function DataPanel() {
  const [sets, setSets] = useState<DatasetManifest[]>([])
  const [selected, setSelected] = useState('')
  const [files, setFiles] = useState({ train: '', valid: '' })
  const [importName, setImportName] = useState('dolly-300')
  const [limit, setLimit] = useState(300)
  const [category, setCategory] = useState('')
  const [newName, setNewName] = useState('')
  const [validFrac, setValidFrac] = useState(0.1)
  const [busy, setBusy] = useState('')

  const loadSets = useCallback(() => void readManifests<DatasetManifest>('data').then((m) => setSets(m.sort((a, b) => b.created.localeCompare(a.created)))), [])
  const loadFiles = useCallback(async (name: string) => {
    if (!name) return
    const [train, valid] = await Promise.all([readFile(`data/${name}/train.jsonl`), readFile(`data/${name}/valid.jsonl`)])
    setFiles({ train: train ?? '', valid: valid ?? '' })
  }, [])

  useEffect(loadSets, [loadSets])
  useEffect(() => void loadFiles(selected), [selected, loadFiles])
  useEffect(() => {
    if (!selected && sets[0]) setSelected(sets[0].name)
  }, [sets, selected])

  // The watcher says what changed; re-read only what is affected.
  useHelperEvent(
    'workspace.changed',
    useCallback(
      (e) => {
        if (!e.path.startsWith('data/')) return
        if (e.path.endsWith('manifest.json') || e.kind === 'addDir' || e.kind === 'unlinkDir') loadSets()
        if (selected && e.path.startsWith(`data/${selected}/`) && e.path.endsWith('.jsonl')) void loadFiles(selected)
      },
      [loadSets, loadFiles, selected],
    ),
  )

  const run = async (key: string, line: string) => {
    setBusy(key)
    await runCommand(line)
    setBusy('')
  }

  const current = sets.find((s) => s.name === selected)
  const examples = useMemo(
    () =>
      files.train
        .split('\n')
        .filter((l) => l.trim())
        .flatMap((l) => {
          try {
            const r = JSON.parse(l) as ChatRow
            return rowProblem(r) ? [] : [r]
          } catch {
            return []
          }
        }),
    [files.train],
  )

  const importCmd = joinWords(['data', 'import', 'dolly', importName, '--limit', String(limit), ...(category ? ['--category', category] : [])])
  const newCmd = joinWords(['data', 'new', newName])

  return (
    <section className="panel" aria-label="data">
      <h2 className="panel__title label">datasets · workspace/data</h2>
      <div className="cards">
        {sets.map((s) => (
            <Manifest
              key={s.name}
              name={s.name}
              active={s.name === selected}
              onSelect={() => setSelected(s.name)}
              badges={s.split ? <Badge>split</Badge> : <Badge warn>not split</Badge>}
              lines={[
                s.license,
                `${s.counts.train} train · ${s.counts.valid} valid`,
                s.sources.map((src) => `${src.id} ${src.rows}`).join(' · '),
                s.tokens ? `about ${s.tokens.total.toLocaleString('en-US')} tokens` : '',
              ]}
            />
        ))}
        {sets.length === 0 && <p className="label label--muted">no datasets yet: import one below, or start an empty one</p>}
      </div>

      <div className="data-sources">
        <Manifest name={dolly.repo} badges={<Badge>{dolly.license}</Badge>} lines={[dolly.about, 'human-written · downloaded once into workspace/raw']}>
          <div className="inline-fields">
            <label className="field">
              <span className="label label--muted">as</span>
              <input type="text" value={importName} onChange={(e) => setImportName(e.target.value.toLowerCase())} spellCheck={false} />
            </label>
            <label className="field field--narrow">
              <span className="label label--muted">rows</span>
              <input type="text" inputMode="numeric" value={limit} onChange={(e) => setLimit(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))} />
            </label>
            <label className="field">
              <span className="label label--muted">category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">all</option>
                {dolly.categories?.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CommandPreview command={importCmd} onRun={() => void run('import', importCmd).then(() => setSelected(importName))} disabled={!NAME.test(importName)} running={busy === 'import'} label="import" />
        </Manifest>
        <Manifest name="empty dataset" lines={['start from nothing and generate or append rows']}>
          <label className="field">
            <span className="label label--muted">name</span>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase())} spellCheck={false} placeholder="my-set" />
          </label>
          <CommandPreview command={newCmd} onRun={() => void run('new', newCmd).then(() => setSelected(newName))} disabled={!NAME.test(newName)} running={busy === 'new'} label="create" />
        </Manifest>
      </div>

      {current && (
        <>
          <h2 className="panel__title label">
            {current.name} · {current.license}
          </h2>
          <div className="data-detail">
            <ul className="sources">
              {current.sources.map((s) => (
                <li key={s.id} className="label label--muted">
                  {s.kind} · {s.id} · {s.rows} rows · {s.license}
                  {s.licenseChecked ? ' (read from the source)' : ' (as listed)'}
                </li>
              ))}
              {current.tokens && (
                <li className="label label--muted">
                  about {current.tokens.total.toLocaleString('en-US')} tokens · longest row {current.tokens.max} · {current.tokens.overLimit} over {current.tokens.limit} (an estimate)
                </li>
              )}
            </ul>
            <div className="data-actions">
              <CommandPreview command={`data validate ${current.name}`} onRun={() => void run('validate', `data validate ${current.name}`)} running={busy === 'validate'} label="validate" />
              <CommandPreview command={`data count ${current.name}`} onRun={() => void run('count', `data count ${current.name}`)} running={busy === 'count'} label="count" />
              <div className="split">
                <label className="split__slider">
                  <span className="label label--muted">valid {Math.round(validFrac * 100)}%</span>
                  <input type="range" min={0.05} max={0.3} step={0.05} value={validFrac} onChange={(e) => setValidFrac(Number(e.target.value))} />
                </label>
                <CommandPreview
                  command={`data split ${current.name} --valid ${validFrac.toFixed(2)}`}
                  onRun={() => void run('split', `data split ${current.name} --valid ${validFrac.toFixed(2)}`)}
                  running={busy === 'split'}
                  label="split"
                />
              </div>
            </div>
          </div>

          <h2 className="panel__title label">generate and curate</h2>
          <DataGenerator dataset={current.name} examples={examples} />

          <h2 className="panel__title label">rows</h2>
          <DataRows train={files.train} valid={files.valid} />
        </>
      )}
    </section>
  )
}
