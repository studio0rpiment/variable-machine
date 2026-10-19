import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { prefRowProblem, rowProblem, type ChatRow, type DataFormat, type PrefRow } from '@shared/chatRow'
import type { DatasetManifest } from '@shared/manifest'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import DataRows from './DataRows'
import DataGenerator from './DataGenerator'
import ImportCard from './ImportCard'
import RawCard from './RawCard'
import PreferenceBuilder from './PreferenceBuilder'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

/**
 * Data (plan §3.2): datasets in workspace/data, each a train/valid pair of
 * chat-format JSONL files and a manifest. Import, validate, split, count and
 * generate are all commands, so the terminal shows each one.
 */
export default function DataPanel() {
  const [sets, setSets] = useState<DatasetManifest[]>([])
  const [selected, setSelected] = useState('')
  const [files, setFiles] = useState({ train: '', valid: '' })
  const [newName, setNewName] = useState('')
  const [newFormat, setNewFormat] = useState<DataFormat>('chat')
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

  const newCmd = joinWords(['data', 'new', newName, ...(newFormat === 'preference' ? ['--format', 'preference'] : [])])
  const isPref = current?.format === 'preference'
  const pairs = useMemo(
    () =>
      isPref
        ? [files.train, files.valid].flatMap((t) =>
            t.split('\n').flatMap((l) => {
              try {
                const r = JSON.parse(l) as PrefRow
                return l.trim() && !prefRowProblem(r) ? [r] : []
              } catch {
                return []
              }
            }),
          )
        : [],
    [files, isPref],
  )

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
              badges={
                <>
                  {s.format === 'preference' && <Badge>preference</Badge>}
                  {s.split ? <Badge>split</Badge> : <Badge warn>not split</Badge>}
                </>
              }
              lines={[
                s.license,
                `${s.counts.train} train · ${s.counts.valid} ${s.format === 'preference' ? 'held out' : 'valid'}`,
                s.sources.map((src) => `${src.id} ${src.rows}`).join(' · '),
                s.tokens ? `about ${s.tokens.total.toLocaleString('en-US')} tokens` : '',
              ]}
            />
        ))}
        {sets.length === 0 && <p className="label label--muted">no datasets yet: import one below, or start an empty one</p>}
      </div>

      <div className="data-sources">
        <ImportCard busy={busy === 'import'} onRun={(line, name) => void run('import', line).then(() => setSelected(name))} />
        <RawCard busy={busy === 'raw'} onRun={(line) => void run('raw', line)} />
        <Manifest name="empty dataset" lines={['chat: rows to imitate (train) · preference: chosen/rejected pairs (prefer)']}>
          <div className="inline-fields">
            <label className="field">
              <span className="label label--muted">name</span>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase())} spellCheck={false} placeholder="my-set" />
            </label>
            <div className="choice" role="radiogroup" aria-label="format">
              {(['chat', 'preference'] as DataFormat[]).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={f === newFormat} className={`text-button ${f === newFormat ? 'is-active' : ''}`.trim()} onClick={() => setNewFormat(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
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

          {isPref ? (
            <>
              <h2 className="panel__title label">pairs from the chat log</h2>
              <PreferenceBuilder dataset={current.name} existing={pairs} />
            </>
          ) : (
            <>
              <h2 className="panel__title label">generate and curate</h2>
              <DataGenerator dataset={current.name} examples={examples} />
            </>
          )}

          <h2 className="panel__title label">rows</h2>
          <DataRows train={files.train} valid={files.valid} format={current.format ?? 'chat'} />
        </>
      )}
    </section>
  )
}
