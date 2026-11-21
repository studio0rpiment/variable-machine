import { useCallback, useEffect, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { listDir, readFile } from '../lib/workspace'
import { chooseDream, chooseSet, dreamChoices, QUALITIES, qualityLabel, toggleText, useDreamChoices, type Quality } from '../lib/dreamChoices'
import { say } from '../text/say'
import type { Step } from './ProjectsPanel'

const src = (p: string) => `/api/workspace/file?path=${encodeURIComponent(p)}`
const IMG = /\.(jpe?g|png|webp)$/i

export interface Card {
  n: number
  file: string
  title: string
  words: { zh: string; en: string }[]
}
export interface Deck {
  qualities: Record<Quality, { folder: string; cards: Card[] }>
  combinations: number
}
export interface Interpretation {
  combination: string
  cards: Record<Quality, { n: number; file: string; title: string }>
  passages: { from: string; text: string; about: string }[]
  reading: string
  reading_zh: string
  picture: string
  used: number[]
  model: string | null
}

/** A workspace file read again whenever the helper says it (or its folder) changed. */
export function useWorkspaceJson<T>(path: string | null): T | null {
  const [v, setV] = useState<T | null>(null)
  const load = useCallback(() => {
    if (!path) return setV(null)
    void readFile(path).then((t) => {
      try {
        setV(t ? (JSON.parse(t) as T) : null)
      } catch {
        // half-written: read again on the next change
      }
    })
  }, [path])
  useEffect(load, [load])
  useHelperEvent('workspace.changed', useCallback((e) => path && e.path.startsWith(path.split('/').slice(0, 2).join('/')) && load(), [path, load]))
  return v
}

/** The pictures of an image set, read again as they come in. */
function useSet(set: string) {
  const [files, setFiles] = useState<string[]>([])
  const load = useCallback(() => void listDir(`images/${set}`).then((es) => setFiles(es.filter((e) => IMG.test(e.name)).map((e) => e.name).sort())), [set])
  useEffect(load, [load])
  useHelperEvent('workspace.changed', useCallback((e) => e.path.startsWith(`images/${set}/`) && load(), [set, load]))
  return files
}

/** A step's own view, in place of a tab: what the dream reading's route shows at that step. */
export default function DreamView({ step, trained = false }: { step: Step; trained?: boolean }) {
  switch (step.view) {
    case 'dream-cards':
      return <CardsView />
    case 'dream-deck':
      return <DeckView />
    case 'dream-texts':
      return <TextsView />
    case 'dream-combination':
      return <CombinationView />
    case 'dream-room':
      return <RoomView trained={trained} />
    case 'dream-drawings':
      return <DrawingsView />
    default:
      return null
  }
}

/** The cards: for the student's own, a place to drop each quality's pictures; for the demo, the demo deck as it is drawn. */
function CardsView() {
  const c = useDreamChoices()
  return (
    <div className="dream-view dream-cards">
      {QUALITIES.map((q) => (
        <CardsRow key={q} q={q} set={c.cards === 'demo' ? `${c.demo}-${q}` : c.sets[q]} own={c.cards === 'own'} />
      ))}
    </div>
  )
}

function CardsRow({ q, set, own }: { q: Quality; set: string; own: boolean }) {
  const files = useSet(set || '-')
  const [busy, setBusy] = useState(false)
  const [newSet, setNewSet] = useState(`her-${q}`)
  const upload = async (list: FileList | null, into: string) => {
    if (!list?.length || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(into)) return
    setBusy(true)
    for (const f of [...list].filter((x) => IMG.test(x.name))) {
      const clean = f.name.toLowerCase().replace(/[^\w.-]+/g, '-')
      await fetch(`/api/workspace/upload?name=${encodeURIComponent(clean)}&set=${encodeURIComponent(into)}&license=${encodeURIComponent("the student's own")}`, { method: 'POST', body: f })
    }
    setBusy(false)
    chooseSet(q, into)
  }
  return (
    <div className="dream-row">
      <span className="label dream-row__q">{qualityLabel(q, dreamChoices())}</span>
      <div className="dream-row__cards">
        {[0, 1, 2, 3].map((i) => (
          <figure key={i} className="dream-card">
            {files[i] ? <img src={src(`images/${set}/${files[i]}`)} alt="" /> : <span className="dream-card__empty">{i + 1}</span>}
          </figure>
        ))}
      </div>
      {own && (
        <span className="dream-row__add">
          {!set && <input className="dream-row__name" value={newSet} onChange={(e) => setNewSet(e.target.value)} aria-label={say('projects.dream.view.setName', { q })} />}
          <label className="text-button">
            {busy ? say('projects.dream.view.uploading') : say('projects.dream.view.upload', { set: set || newSet })}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files, set || newSet)} />
          </label>
        </span>
      )}
    </div>
  )
}

/** The drawings a style is trained on: someone's own, uploaded into one image set (12 at the least; 30 or more is better). */
function DrawingsView() {
  const c = useDreamChoices()
  const files = useSet(c.drawings)
  const [busy, setBusy] = useState(false)
  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    for (const f of [...list].filter((x) => IMG.test(x.name))) {
      const clean = f.name.toLowerCase().replace(/[^\w.-]+/g, '-')
      await fetch(`/api/workspace/upload?name=${encodeURIComponent(clean)}&set=${encodeURIComponent(c.drawings)}&license=${encodeURIComponent('the artist\'s own drawings')}`, { method: 'POST', body: f })
    }
    setBusy(false)
  }
  return (
    <div className="dream-view">
      <p className="label label--muted">{say('projects.dreamTrained.view.drawings', { n: files.length, set: c.drawings })}</p>
      <div className="dream-row__cards dream-drawings">
        {files.slice(0, 40).map((f) => (
          <figure key={f} className="dream-card">
            <img src={src(`images/${c.drawings}/${f}`)} alt="" />
          </figure>
        ))}
      </div>
      <label className="text-button">
        {busy ? say('projects.dream.view.uploading') : say('projects.dream.view.upload', { set: c.drawings })}
        <input type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </label>
    </div>
  )
}

/** The deck: four rows of four cards, each with the glossary words SigLIP found nearest it. */
function DeckView() {
  const c = useDreamChoices()
  const deck = useWorkspaceJson<Deck>(`dreams/${c.name}/deck.json`)
  if (!deck) return <p className="label label--muted dream-view">{say('projects.dream.view.noDeck')}</p>
  return (
    <div className="dream-view">
      {QUALITIES.map((q) => (
        <div key={q} className="dream-row">
          <span className="label dream-row__q">{qualityLabel(q, c)}</span>
          <div className="dream-row__cards">
            {deck.qualities[q].cards.map((card) => (
              <figure key={card.n} className="dream-card">
                <img src={src(card.file)} alt={card.title} />
                <figcaption>
                  <b>{card.n}</b> {card.title}
                  <span className="label label--muted">{card.words.map((w) => `${w.en} ${w.zh}`).join(' · ')}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The student's own texts: upload a .txt or .md; each one uploaded can be chosen as a guide text. */
function TextsView() {
  const c = useDreamChoices()
  const [uploads, setUploads] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => void listDir('uploads').then((es) => setUploads(es.filter((e) => /\.(txt|md)$/.test(e.name)).map((e) => `uploads/${e.name}`))), [])
  useEffect(load, [load])
  useHelperEvent('workspace.changed', useCallback((e) => e.path.startsWith('uploads/') && load(), [load]))
  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    for (const f of [...list]) {
      const safe = f.name.toLowerCase().replace(/[^\w.-]+/g, '-')
      if (!/\.(txt|md)$/.test(safe)) continue
      await fetch(`/api/workspace/upload?name=${encodeURIComponent(safe)}`, { method: 'POST', body: f })
      if (!c.own.includes(`uploads/${safe}`)) toggleText('own', `uploads/${safe}`)
    }
    setBusy(false)
    load()
  }
  return (
    <div className="dream-view">
      <p className="label label--muted">{say('projects.dream.view.textsAbout')}</p>
      <ul className="dream-texts">
        {[...c.library.map((t) => `raw/${t}`), ...c.own].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <label className="text-button">
        {busy ? say('projects.dream.view.uploading') : say('projects.dream.view.uploadText')}
        <input type="file" accept=".txt,.md,text/plain,text/markdown" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </label>
      {uploads.length > 0 && <p className="label label--muted">{say('projects.dream.view.uploaded', { files: uploads.map((u) => u.replace(/^uploads\//, '')).join(', ') })}</p>}
    </div>
  )
}

/** One combination: pick a card of each quality; its interpretation and variations, made with the commands under it. */
function CombinationView() {
  const c = useDreamChoices()
  const deck = useWorkspaceJson<Deck>(`dreams/${c.name}/deck.json`)
  const pick = c.combination
  const setPick = (p: Record<Quality, number>) => chooseDream('combination', p)
  const key = QUALITIES.map((q) => pick[q]).join('-')
  const r = useWorkspaceJson<Interpretation>(`dreams/${c.name}/combinations/${key}/interpretation.json`)
  const [vars, setVars] = useState<string[]>([])
  const loadVars = useCallback(() => void listDir(`dreams/${c.name}/combinations/${key}`).then((es) => setVars(es.filter((e) => /^v\d+\.png$/.test(e.name)).map((e) => e.name).sort())), [c.name, key])
  useEffect(loadVars, [loadVars])
  useHelperEvent('workspace.changed', useCallback((e) => e.path.startsWith(`dreams/${c.name}/combinations/${key}/`) && loadVars(), [c.name, key, loadVars]))
  if (!deck) return <p className="label label--muted dream-view">{say('projects.dream.view.noDeck')}</p>
  return (
    <div className="dream-view">
      <p className="label label--muted">{say('projects.dream.view.pick', { key })}</p>
      {QUALITIES.map((q) => (
        <div key={q} className="dream-row dream-row--small" role="radiogroup" aria-label={q}>
          <span className="label dream-row__q">{qualityLabel(q, c)}</span>
          <div className="dream-row__cards">
            {deck.qualities[q].cards.map((card) => (
              <button key={card.n} type="button" role="radio" aria-checked={pick[q] === card.n} className={`dream-card dream-card--pick ${pick[q] === card.n ? 'is-on' : ''}`.trim()} onClick={() => setPick({ ...pick, [q]: card.n })}>
                <img src={src(card.file)} alt={card.title} />
              </button>
            ))}
          </div>
        </div>
      ))}
      {vars.length > 0 && (
        <div className="dream-row__cards dream-vars">
          {vars.map((v) => (
            <img key={v} src={`${src(`dreams/${c.name}/combinations/${key}/${v}`)}&t=${Date.now() >> 14}`} alt="" />
          ))}
        </div>
      )}
      {r && (
        <div className="dream-reading">
          {r.reading && <p>{r.reading}</p>}
          {r.reading_zh && <p lang="zh-Hant">{r.reading_zh}</p>}
          {r.picture && <p className="label label--muted">{say('projects.dream.view.sentence', { sentence: r.picture })}</p>}
          <details>
            <summary className="label">{say('projects.dream.view.passages', { n: r.passages.length, by: r.model ?? say('projects.dream.view.noModel') })}</summary>
            <ol>
              {r.passages.map((p, i) => (
                <li key={i} className={r.used?.includes(i + 1) ? 'is-used' : ''}>
                  <b>{`[${i + 1}] ${p.from}`}</b> <span className="label label--muted">{p.about}</span>
                  <br />
                  {p.text.slice(0, 500)}
                </li>
              ))}
            </ol>
          </details>
          <a className="text-link" href={src(`dreams/${c.name}/combinations/${key}/page.html`)} target="_blank" rel="noreferrer">
            {say('projects.dream.view.page')}
          </a>
        </div>
      )}
    </div>
  )
}

/** The room: the page for the installation's screen, and the last visitor's response. */
function RoomView({ trained }: { trained: boolean }) {
  const c = useDreamChoices()
  const latest = useWorkspaceJson<{ response: string }>(`dreams/${c.name}/latest.json`)
  return (
    <div className="dream-view">
      <p className="label label--muted">{say('projects.dream.view.roomAbout')}</p>
      <a className="text-link" href={`#room/${c.name}${trained ? '/trained' : ''}`} target="_blank" rel="noreferrer">
        {say('projects.dream.open')}
      </a>
      {latest && <p className="label label--muted">{say('projects.dream.view.last', { path: latest.response })}</p>}
    </div>
  )
}
