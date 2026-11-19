import { useCallback, useEffect, useState } from 'react'
import { joinWords } from '@shared/quote'
import { finalOf, type Decision, type ResearchManifest, type Seen } from '@shared/research'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import Manifest from './Manifest'
import CommandPreview from './CommandPreview'
import NextBox from './NextBox'
import { Explained } from '../explain/Explained'
import { say } from '../text/say'
import { Part, useInProject } from '../lib/parts'
import { chooseResearch, useResearchChoices } from '../lib/researchChoices'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const asName = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|-+$/g, '')
    .slice(0, 48)
const lines = (t: string) =>
  t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

type Show = 'new' | 'read' | 'kept' | 'all'
const SHOW: Show[] = ['new', 'read', 'kept', 'all']
const SHOW_WORDS: Record<Show, () => string> = { new: () => say('data.papers.show.new'), read: () => say('data.papers.show.read'), kept: () => say('data.papers.show.kept'), all: () => say('data.papers.show.all') }
const SAID: Record<'keep' | 'skip', () => string> = { keep: () => say('data.papers.keep'), skip: () => say('data.papers.skip') }

/**
 * Papers and articles: the research bot's way in. Starting a search is
 * `papers search`; then a folder in workspace/research is screened (`papers
 * screen`), decided item by item (`papers decide`), and turned into a reading
 * list, BibTeX and a training set for a relevance judge. Every press is a
 * command, so the terminal shows it.
 */
export function PapersCard({ onTrain }: { onTrain?: (dataset: string) => void }) {
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [topic, setTopic] = useState('')
  const [seeds, setSeeds] = useState('')
  const [feeds, setFeeds] = useState('')
  const [busy, setBusy] = useState('')
  const [folders, setFolders] = useState<(ResearchManifest & { folder: string })[]>([])
  const [picked, setPicked] = useState('')
  // in project mode the folder is the route's ("which research"): the schematic, its steps and this card follow the same one
  const inProject = useInProject()
  const rc = useResearchChoices()
  const pick = inProject ? rc.folder : picked
  const setPick = (f: string) => (inProject ? chooseResearch('folder', f) : setPicked(f))

  const loadFolders = useCallback(() => void readManifests<ResearchManifest>('research').then((r) => setFolders(r.sort((a, b) => b.created.localeCompare(a.created)))), [])
  useEffect(loadFolders, [loadFolders])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('research/') && e.path.endsWith('manifest.json') && loadFolders(), [loadFolders]),
  )
  useEffect(() => {
    if (!inProject && !folders.some((f) => f.folder === picked) && folders[0]) setPicked(folders[0].folder)
  }, [folders, picked, inProject])

  const run = async (key: string, line: string) => {
    setBusy(key)
    const ok = await runCommand(line)
    setBusy('')
    return ok
  }

  const as = touched ? name : asName(topic)
  const s = lines(seeds)
  const searchLine = joinWords(['papers', 'search', as || '<name>', '--topic', topic.trim() || '<topic>', ...s.flatMap((x) => ['--seed', x]), ...lines(feeds).flatMap((x) => ['--feed', /^https?:\/\//.test(x) ? x : `https://${x}`])])

  return (
    <div className="papers">
      <Part id="papers.search">
      <Manifest name={say('data.papers.card')} lines={[say('data.papers.card.line1'), say('data.papers.card.line2')]}>
        <div className="inline-fields">
          <label className="field">
            <span className="label label--muted">{say('data.papers.topic')}</span>
            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={say('data.papers.topic.example')} />
          </label>
          <label className="field field--narrow">
            <span className="label label--muted">{say('data.papers.name')}</span>
            <input type="text" value={as} onChange={(e) => (setTouched(true), setName(e.target.value.toLowerCase()))} spellCheck={false} />
          </label>
        </div>
        <div className="inline-fields">
          <label className="field">
            <span className="label label--muted">{say('data.papers.seeds')}</span>
            <textarea rows={4} value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder={say('data.papers.seeds.example')} spellCheck={false} />
          </label>
          <label className="field">
            <span className="label label--muted">{say('data.papers.feeds')}</span>
            <textarea rows={4} value={feeds} onChange={(e) => setFeeds(e.target.value)} placeholder={say('data.papers.feeds.example')} spellCheck={false} />
          </label>
        </div>
        {s.length > 0 && (s.length < 2 || s.length > 5) && <span className="label label--muted">{say('data.papers.seeds.count', { n: s.length })}</span>}
        <Explained id="data.papers">
          <CommandPreview command={searchLine} onRun={() => void run('search', searchLine).then((ok) => ok && setPick(as))} disabled={!NAME.test(as) || !topic.trim() || s.length < 2 || s.length > 5} running={busy === 'search'} label={say('data.papers.search.run')} />
        </Explained>
      </Manifest>
      </Part>

      {folders.length > 0 && (!inProject || !!pick) && (
        <>
          <Part id="papers.pick">
          <div className="inline-fields">
            <label className="field">
              <span className="label label--muted">{say('data.papers.pick')}</span>
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                {folders.map((f) => (
                  <option key={f.folder} value={f.folder}>
                    {f.folder}
                  </option>
                ))}
              </select>
            </label>
          </div>
          </Part>
          {pick && <Research key={pick} name={pick} busy={busy} run={run} onTrain={onTrain} />}
        </>
      )}
    </div>
  )
}

interface Check {
  n: number
  agree: number
  similarityAgree: number
}

function Research({ name, busy, run, onTrain }: { name: string; busy: string; run: (key: string, line: string) => Promise<boolean>; onTrain?: (dataset: string) => void }) {
  const [m, setM] = useState<ResearchManifest | null>(null)
  const [items, setItems] = useState<Seen[]>([])
  const [screen, setScreen] = useState<Record<string, Decision>>({})
  const [check, setCheck] = useState<Check | null>(null)
  const [has, setHas] = useState({ list: false, judge: false })
  const [embedHere, setEmbedHere] = useState(true)
  const [show, setShow] = useState<Show>('read')
  const rc = useResearchChoices()
  const inProject = useInProject()

  const load = useCallback(async () => {
    const [mf, lib, sc, ck, list] = await Promise.all([readFile(`research/${name}/manifest.json`), readFile(`research/${name}/library.jsonl`), readFile(`research/${name}/screen.json`), readFile(`research/${name}/check.json`), readFile(`research/${name}/reading-list.md`)])
    setM(mf ? (JSON.parse(mf) as ResearchManifest) : null)
    setItems(
      (lib ?? '')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Seen),
    )
    setScreen(sc ? (JSON.parse(sc) as Record<string, Decision>) : {})
    setCheck(ck ? (JSON.parse(ck) as Check) : null)
    // a point of view's set, made from this folder by papers judge (named -view here, -judge before)
    const judge = (await readManifests<{ name: string; research?: { folder: string } }>('data')).some((d) => d.research?.folder === name)
    setHas({ list: list !== null, judge })
  }, [name])
  useEffect(() => void load(), [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path.startsWith(`research/${name}/`) || /^data\/[^/]+\/manifest\.json$/.test(e.path)) && void load(), [load, name]),
  )
  useEffect(() => {
    void fetch('/ollama/api/tags')
      .then((r) => r.json())
      .then((t: { models?: { name: string }[] }) => setEmbedHere(!!t.models?.some((x) => x.name.startsWith('nomic-embed-text'))))
      .catch(() => {})
  }, [busy])

  if (!m) return null
  const lastRun = m.runs.length
  const screened = items.filter((x) => screen[x.key]?.screen).length
  const kept = items.filter((x) => finalOf(screen[x.key]) === 'keep').length
  const mine = items.filter((x) => screen[x.key]?.student).length
  const fresh = items.filter((x) => x.run === lastRun).length
  const shown = items
    .filter((x) => {
      const d = screen[x.key]
      if (show === 'new') return x.run === lastRun
      if (show === 'read') return d?.screen && d.screen.by !== 'nomic-embed-text'
      if (show === 'kept') return finalOf(d) === 'keep'
      return true
    })
    .sort((a, b) => (screen[b.key]?.sim ?? 0) - (screen[a.key]?.sim ?? 0))
    .slice(0, 150)

  // in project mode the screen takes the route's choices: how many it reads, and the model that screens
  const screenLine = joinWords(['papers', 'screen', name, ...(inProject && rc.top !== 40 ? ['--top', String(rc.top)] : []), ...(inProject && rc.screener !== 'qwen3:4b' ? ['--model', rc.screener] : [])])
  const judgeSet = `${name}-view`
  const next = [
    ['summarise', `papers summarise ${name}`, say('data.papers.summarise.run')],
    ['list', `papers list ${name}`, say('data.papers.list.run')],
    ['check', `papers check ${name}`, say('data.papers.check.run')],
  ] as const
  const judgeLine = `papers judge ${name} ${judgeSet}`
  const splitLine = `data split ${judgeSet} --valid 0.2`

  return (
    <div className="papers__research">
      <Part id="papers.about">
      <p className="label label--muted">{say('data.papers.counts', { seen: items.length, screened, kept, mine, fresh })}</p>
      <p className="od-result__about">{m.topic}</p>
      {!embedHere && (
        <NextBox on>
          <span className="label label--muted">{say('data.papers.embed.missing')}</span>
          <CommandPreview command="ollama pull nomic-embed-text" onRun={() => void run('pull', 'ollama pull nomic-embed-text')} running={busy === 'pull'} />
        </NextBox>
      )}
      </Part>
      <Part id="papers.screen">
      <Explained id="data.papers.screen">
        <CommandPreview command={screenLine} onRun={() => void run('screen', screenLine)} disabled={!embedHere} running={busy === 'screen'} label={say('data.papers.screen.run')} />
      </Explained>

      </Part>
      <Part id="papers.items">
      <div className="choice" role="radiogroup" aria-label={say('data.papers.show')}>
        {SHOW.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === show} className={`text-button ${k === show ? 'is-active' : ''}`.trim()} onClick={() => setShow(k)}>
            {SHOW_WORDS[k]()}
          </button>
        ))}
      </div>
      <ol className="papers__items">
        {shown.length === 0 && <li className="label label--muted">{say('data.papers.none')}</li>}
        {shown.map((x) => {
          const d = screen[x.key] ?? {}
          const final = finalOf(d)
          const decide = (v: 'keep' | 'skip' | 'undo') => joinWords(['papers', 'decide', name, x.key, v])
          return (
            <li key={x.key} className={`papers__item ${final ? `is-${final}` : ''} ${d.student ? 'is-mine' : ''}`.replace(/\s+/g, ' ').trim()}>
              <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-link papers__title">
                {x.title}
              </a>
              <span className="label label--muted">
                {[x.authors.slice(0, 2).join(', ') + (x.authors.length > 2 ? ' et al.' : ''), x.year, x.venue, x.sources.join(' + '), x.oa ? say('data.papers.free') : '', d.sim !== undefined ? say('data.papers.sim', { sim: d.sim.toFixed(2) }) : ''].filter(Boolean).join(' · ')}
              </span>
              {d.screen && (
                <span className="papers__said">
                  <span className="label">{say('data.papers.screen.said', { by: d.screen.by, decision: SAID[d.screen.decision]() })}</span> {d.screen.reason}
                </span>
              )}
              {d.student && <span className="papers__said papers__said--mine label">{say('data.papers.yours', { decision: SAID[d.student.decision]() })}</span>}
              <Explained id="data.papers.decide">
                <span className="papers__decide" role="group" aria-label={x.title}>
                  {(['keep', 'skip'] as const).map((v) => (
                    <button key={v} type="button" className={`text-button ${d.student?.decision === v ? 'is-active' : ''}`.trim()} title={decide(v)} aria-label={`${SAID[v]()}: ${decide(v)}`} onClick={() => void runCommand(decide(v))}>
                      {SAID[v]()}
                    </button>
                  ))}
                  {d.student && (
                    <button type="button" className="text-button" title={decide('undo')} aria-label={`${say('data.papers.undo')}: ${decide('undo')}`} onClick={() => void runCommand(decide('undo'))}>
                      {say('data.papers.undo')}
                    </button>
                  )}
                </span>
              </Explained>
              <details className="papers__abstract">
                <summary className="label label--muted">{say('data.papers.abstract')}</summary>
                <p>{x.abstract || say('data.papers.noAbstract')}</p>
              </details>
              {d.summary && d.summary.length > 0 && (
                <div className="papers__summary">
                  <span className="label label--muted">{say('data.papers.summary')}</span>
                  {d.summary.map((c) => (
                    <p key={c.quote}>
                      {c.claim} <q>{c.quote}</q> <span className="label label--muted">{c.from}</span>
                    </p>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      </Part>

      <Part id="papers.list">
      <h3 className="panel__title label">{say('data.papers.next')}</h3>
      <div className="papers__next">
        {next.map(([key, line, label]) => (
          <CommandPreview key={key} command={line} onRun={() => void run(key, line)} disabled={!screened} running={busy === key} label={label} />
        ))}
        {check && <span className="label">{say('data.papers.check.result', { agree: check.agree, n: check.n, pct: Math.round((check.agree / check.n) * 100), sim: check.similarityAgree })}</span>}
        {has.list && (
          <span className="papers__files">
            <a className="text-link" href={`/api/workspace/file?path=${encodeURIComponent(`research/${name}/reading-list.md`)}`} target="_blank" rel="noopener noreferrer">
              {say('data.papers.list.open')}
            </a>
            <a className="text-link" href={`/api/workspace/file?path=${encodeURIComponent(`research/${name}/references.bib`)}&download=1`} download>
              {say('data.papers.bib.open')}
            </a>
          </span>
        )}
      </div>
      </Part>
      <Part id="papers.judge">
      <div className="papers__next">
        <Explained id="data.papers.judge">
          <CommandPreview command={judgeLine} onRun={() => void run('judge', judgeLine)} disabled={!screened || has.judge} running={busy === 'judge'} label={say('data.papers.judge.run')} />
        </Explained>
        {has.judge && (
          <>
            <CommandPreview command={splitLine} onRun={() => void run('split', splitLine)} running={busy === 'split'} label={say('data.papers.split.run')} />
            {onTrain && (
              <button type="button" className="text-button" onClick={() => onTrain(judgeSet)}>
                {say('data.papers.train')}
              </button>
            )}
          </>
        )}
      </div>
      </Part>
    </div>
  )
}
