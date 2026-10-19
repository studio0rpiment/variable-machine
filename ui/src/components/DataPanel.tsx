import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { prefRowProblem, rowProblem, type ChatRow, type DataFormat, type PrefRow } from '@shared/chatRow'
import type { DatasetManifest } from '@shared/manifest'
import Manifest from './Manifest'
import CommandPreview from './CommandPreview'
import DataRows from './DataRows'
import DataGenerator from './DataGenerator'
import ImportCard from './ImportCard'
import RawCard from './RawCard'
import PreferenceBuilder from './PreferenceBuilder'
import { Explained } from '../explain/Explained'
import { DATA_INTRO, KINDS, MAKE, READY } from '../explain/data'
import { glide as glideAs, moving } from '../lib/moving'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const glide = (id: string) => glideAs('dataset', id)
const NEW = 'new' // the "make a new one" card; dataset names are checked against NAME, and "new" is kept for this

const kindOf = (s: DatasetManifest) => KINDS[s.format === 'preference' ? 'preference' : 'chat']

/**
 * Data (plan §3.2): datasets in workspace/data, each a train/valid pair of
 * chat-format JSONL files and a manifest. Import, validate, split, count and
 * generate are all commands, so the terminal shows each one.
 *
 * Laid out like the Modelfile tab: all datasets as cards first; choosing one
 * moves it left (what's in it, get it ready, use it, add rows, the rows) with
 * the others in a column on the right. "Make a new one" opens the ways to
 * start a dataset.
 */
export default function DataPanel({ onUse }: { onUse?: (dataset: string, way: 'train' | 'prefer') => void }) {
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
  /** '' shows every dataset as a card; NEW shows the ways to make one; otherwise the chosen dataset's name. */
  const choose = (name: string) => moving(() => setSelected(name))
  const topRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    // A block, not an arrow's value: newer browsers return a promise from scrollIntoView, and React would take it for a clean-up.
    topRef.current?.scrollIntoView({ block: selected ? 'start' : 'nearest' })
  }, [selected])

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

  const card = (s: DatasetManifest) => (
    <button key={s.name} type="button" className="mf-preset" style={glide(s.name)} onClick={() => choose(s.name)}>
      <span className="mf-preset__group label label--muted">
        {kindOf(s).group} · for {kindOf(s).use}
      </span>
      <span className="mf-preset__title">{s.name}</span>
      <span className="mf-preset__blurb">
        {s.counts.train + s.counts.valid} rows{s.split ? '' : ', not split yet'}
      </span>
      <span className="mf-preset__follows label label--muted">{s.license}</span>
    </button>
  )
  const newCard = (
    <button type="button" className="mf-preset mf-preset--own" style={glide(NEW)} onClick={() => choose(NEW)}>
      <span className="mf-preset__group label label--muted">a new dataset</span>
      <span className="mf-preset__title">make a new one</span>
      <span className="mf-preset__blurb">Import a public collection, bring in a book, or start empty and fill it.</span>
    </button>
  )
  const railItem = (id: string, group: string, title: string) => (
    <button key={id} type="button" className="mf-rail__item" style={glide(id)} onClick={() => choose(id)}>
      <span className="label label--muted">{group}</span> / {title}
    </button>
  )
  const created = (name: string) => () => choose(name)

  return (
    <section className="panel mf" aria-label="data">
      <header className="mf__intro">
        <h1 className="start__title">{DATA_INTRO.title}</h1>
        <p className="start__text">{DATA_INTRO.text}</p>
      </header>
      <div ref={topRef} className="mf-top" />

      {!selected ? (
        <>
          <h2 className="panel__title label mf-lead-plain">1 · choose a dataset, or make a new one</h2>
          <p className="mf-next">Then you'll see what's in it, get it ready, and use it to train a model.</p>
          <div className="mf-presets">
            {sets.map(card)}
            {newCard}
          </div>
        </>
      ) : (
        <div className="mf-studio">
          <div className="mf-studio__main">
            {selected === NEW || !current ? (
              <>
                <div className="mf-chosen" style={glide(NEW)}>
                  <span className="mf-preset__group label label--muted">a new dataset</span>
                  <span className="mf-chosen__title">make a new one</span>
                  <span className="mf-chosen__blurb">Three ways to start. Once it exists it opens here, ready to check, split and use.</span>
                </div>
                <div className="data-way">
                  <h2 className="panel__title label mf-lead-plain">{MAKE.import.title}</h2>
                  <p className="mf-next">{MAKE.import.when}</p>
                  <ImportCard busy={busy === 'import'} onRun={(line, name) => void run('import', line).then(created(name))} />
                </div>
                <div className="data-way">
                  <h2 className="panel__title label mf-lead-plain">{MAKE.raw.title}</h2>
                  <p className="mf-next">{MAKE.raw.when}</p>
                  <RawCard busy={busy === 'raw'} onRun={(line) => void run('raw', line)} />
                </div>
                <div className="data-way">
                  <h2 className="panel__title label mf-lead-plain">{MAKE.empty.title}</h2>
                  <p className="mf-next">{MAKE.empty.when}</p>
                  <Manifest name="empty dataset" lines={[`chat: ${KINDS.chat.about}`, `preference: ${KINDS.preference.about}`]}>
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
                    <Explained id="data.new">
                      <CommandPreview command={newCmd} onRun={() => void run('new', newCmd).then(created(newName))} disabled={!NAME.test(newName) || newName === NEW} running={busy === 'new'} label="create" />
                    </Explained>
                  </Manifest>
                </div>
              </>
            ) : (
              <>
                <div className="mf-chosen" style={glide(current.name)}>
                  <span className="mf-preset__group label label--muted">
                    {kindOf(current).group} · for {kindOf(current).use}
                  </span>
                  <span className="mf-chosen__title">{current.name}</span>
                  <span className="mf-chosen__blurb">{kindOf(current).about}</span>
                </div>

                <section className="mf-part" aria-label="what's in it">
                  <h2 className="panel__title label mf-lead-plain">what's in it</h2>
                  <dl className="mf-goes">
                    <dt>rows</dt>
                    <dd>
                      {current.counts.train} to {isPref ? 'learn from' : 'train on'}
                      {current.split ? ` · ${current.counts.valid} set aside to test with` : ' · none set aside yet'}
                    </dd>
                    <dt>from</dt>
                    <dd>
                      {current.sources.length
                        ? current.sources.map((s) => `${s.id} (${s.kind}, ${s.rows} rows${s.licenseChecked ? '' : ', license as listed'})`).join(' · ')
                        : 'nothing yet'}
                    </dd>
                    <dt>license</dt>
                    <dd>{current.license}</dd>
                    {current.tokens && (
                      <>
                        <dt>size</dt>
                        <dd>
                          about {current.tokens.total.toLocaleString('en-US')} tokens · longest row {current.tokens.max}
                          {current.tokens.overLimit ? ` · ${current.tokens.overLimit} longer than ${current.tokens.limit}, cut off in training` : ''}
                        </dd>
                      </>
                    )}
                  </dl>
                </section>

                <section className="mf-part" aria-label="get it ready">
                  <h2 className="panel__title label mf-lead-plain">2 · get it ready: check it, count it, split it</h2>
                  <div className="data-ready">
                    <p className="mf-next">{READY.check}</p>
                    <Explained id="data.validate">
                      <CommandPreview command={`data validate ${current.name}`} onRun={() => void run('validate', `data validate ${current.name}`)} running={busy === 'validate'} label="check" />
                    </Explained>
                    <p className="mf-next">{READY.count}</p>
                    <Explained id="data.count">
                      <CommandPreview command={`data count ${current.name}`} onRun={() => void run('count', `data count ${current.name}`)} running={busy === 'count'} label="count" />
                    </Explained>
                    <p className="mf-next">{READY.split}</p>
                    <div className="split">
                      <label className="split__slider">
                        <span className="label label--muted">set aside {Math.round(validFrac * 100)}%</span>
                        <Explained id="data.split">
                          <input type="range" min={0.05} max={0.3} step={0.05} value={validFrac} onChange={(e) => setValidFrac(Number(e.target.value))} />
                        </Explained>
                      </label>
                      <Explained id="data.split">
                        <CommandPreview
                          command={`data split ${current.name} --valid ${validFrac.toFixed(2)}`}
                          onRun={() => void run('split', `data split ${current.name} --valid ${validFrac.toFixed(2)}`)}
                          running={busy === 'split'}
                          label="split"
                        />
                      </Explained>
                    </div>
                  </div>
                </section>

                <section className="mf-part" aria-label="use it">
                  <h2 className="panel__title label mf-lead-plain">3 · use it</h2>
                  {current.split && current.counts.train >= 2 ? (
                    <div className="mf-make__run">
                      <button type="button" className="text-button" onClick={() => onUse?.(current.name, isPref ? 'prefer' : 'train')}>
                        {isPref ? 'tune a model with it on Prefer →' : 'train a model on it →'}
                      </button>
                      <span className="label label--muted">opens {kindOf(current).use} with {current.name} chosen</span>
                    </div>
                  ) : (
                    <p className="mf-next">{current.counts.train < 2 ? 'It needs a few more rows first: add some below.' : 'Split it first (step 2): training needs some rows set aside to test with.'}</p>
                  )}
                </section>

                {isPref ? (
                  <section className="mf-part" aria-label="add pairs">
                    <h2 className="panel__title label mf-lead-plain">add pairs from the chat log</h2>
                    <PreferenceBuilder dataset={current.name} existing={pairs} />
                  </section>
                ) : (
                  <section className="mf-part" aria-label="write more rows">
                    <h2 className="panel__title label mf-lead-plain">write more rows: a model writes, you keep the good ones</h2>
                    <DataGenerator dataset={current.name} examples={examples} />
                  </section>
                )}

                <section className="mf-part" aria-label="rows">
                  <h2 className="panel__title label mf-lead-plain">the rows</h2>
                  <DataRows train={files.train} valid={files.valid} format={current.format ?? 'chat'} />
                </section>
              </>
            )}
          </div>

          <nav className="mf-rail" aria-label="other datasets">
            <button type="button" className="text-button mf-rail__all" onClick={() => choose('')}>
              all datasets
            </button>
            {sets.filter((s) => s.name !== selected).map((s) => railItem(s.name, kindOf(s).group, s.name))}
            {selected !== NEW && railItem(NEW, 'a new dataset', 'make a new one')}
          </nav>
        </div>
      )}
    </section>
  )
}
