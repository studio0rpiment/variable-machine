import { useCallback, useEffect, useState } from 'react'
import { joinWords } from '@shared/quote'
import type { DatasetManifest } from '@shared/manifest'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { listDir, readFile, readManifests } from '../lib/workspace'
import CommandPreview from './CommandPreview'
import { rich, say } from '../text/say'
import { readerFields } from '../lib/readers'
import { guideHref, startGuide, useGuide } from '../lib/guide'

/** The tabs a step can open, by id, and what the top bar calls them. */
export const TAB_NAME = { data: 'data', train: 'train', prefer: 'prefer', adapters: 'adapters', chat: 'chat', share: 'share', modelfile: 'modelfile', gesture: 'gesture', segmentation: 'image segmentation' } as const
type Tab = keyof typeof TAB_NAME

/** What a step fills in on its tab when a student arrives from the card: the names the card has chosen. */
export interface Fill {
  /** the Data tab: the set to open, or "new" with the name to make */
  data?: { pick: string; newName?: string }
  /** the Train tab: the set, the adapter's name, the base, the max sequence length */
  train?: { data: string; name: string; base: string; maxSeq?: number }
}

/** One note of a step's walkthrough: the control it points at (its flag's id, or a data-guide marker) and what it says. */
export interface Note {
  at: string
  text: string
}

export interface Step {
  name: string
  tab: Tab
  /** the commands it runs, in order, filled from the workspace where it can be; none when it is done in the page */
  commands: string[]
  done: boolean
  /** not built yet */
  soon?: boolean
  /** the start of a second way: its steps take the place of the ones above */
  or?: boolean
  /** what it found, once it has run */
  result?: string
  fill?: Fill
  /** the walkthrough on its tab, a note at a time; a step without notes shows its commands in the guide bar */
  notes?: Note[]
}

export interface Project {
  id: string
  title: string
  does: string
  get: string
  limits?: string
  steps: Step[]
}

interface Raw {
  folder: string
  created?: string
  name: string
  source?: string
  columns?: string[]
}
interface Adapter {
  folder: string
  created?: string
  name: string
  data: string
  base: string
}
interface Gesture {
  folder: string
  created?: string
  counts: Record<string, number>
  trained?: unknown
  sent?: unknown
}
interface Output {
  folder: string
  created?: string
  items?: { tool: string }[]
}

/** What the workspace has, read once and again whenever it changes: enough to say which steps are done. */
interface Have {
  raw: Raw[]
  data: (DatasetManifest & { folder: string })[]
  adapters: Adapter[]
  /** models in Ollama made here, by their Modelfile: the adapter each was exported from, if any */
  models: { model: string; created: string; adapter: string | null }[]
  /** "dataset/model" for every `ask check` that has run */
  checks: Set<string>
  packages: string[]
  tools: string[]
  images: string[]
  /** the first photo in the set the cut-out step uses */
  photo: string | null
  outputs: Output[]
  gestures: Gesture[]
  /** `reader check` results: the reader's scores, then the stand-in's */
  readerChecks: { dataset: string; model: string; at: string; n: number; scores: { model: string; right: number; fields: number; rows: number; ms: number }[] }[]
  /** research folders, with the files each has (screen.json, reading-list.md) */
  research: { folder: string; created?: string; files: string[] }[]
  /** texts uploaded for drafting rows from (data draft --from uploads/…) */
  texts: string[]
}

async function readHave(): Promise<Have> {
  const [raw, data, adapters, mfs, packages, tools, images, outputs, gestures, research, uploads] = await Promise.all([
    readManifests<Raw>('raw'),
    readManifests<DatasetManifest>('data'),
    readManifests<Adapter>('adapters'),
    listDir('modelfiles'),
    readManifests<{ name: string }>('packages'),
    listDir('tools'),
    listDir('images'),
    readManifests<Output>('outputs'),
    readManifests<Gesture>('gestures'),
    readManifests<{ created?: string }>('research'),
    listDir('uploads'),
  ])
  const models = await Promise.all(
    mfs
      .filter((e) => e.name.endsWith('.Modelfile'))
      .map(async (e) => {
        const text = (await readFile(`modelfiles/${e.name}`)) ?? ''
        return { model: e.name.replace(/\.Modelfile$/, ''), created: e.modified, adapter: /made by Variable Machine from adapter (\S+)/.exec(text)?.[1] ?? null }
      }),
  )
  const checks = new Set<string>()
  const readerChecks: Have['readerChecks'] = []
  for (const d of data.filter((x) => x.ask || x.folder.startsWith('studio-')))
    for (const f of await listDir(`data/${d.folder}`)) {
      const m = /^check-(.+)\.json$/.exec(f.name)
      if (m) checks.add(`${d.folder}/${m[1]}`)
      if (m && !d.ask) {
        const c = JSON.parse((await readFile(`data/${d.folder}/${f.name}`)) ?? 'null') as Have['readerChecks'][number] & { reader?: boolean }
        if (c?.reader) readerChecks.push(c)
      }
    }
  const sets = images.filter((i) => i.dir).map((i) => i.name)
  const set = sets.includes('classic-cv') || !sets.length ? 'classic-cv' : sets[0]
  const photo = (await listDir(`images/${set}`)).find((f) => /\.(jpe?g|png|webp)$/i.test(f.name))?.name ?? null
  return {
    raw,
    data,
    adapters,
    models,
    checks,
    readerChecks,
    packages: packages.map((p) => p.folder),
    tools: tools.filter((t) => t.dir).map((t) => t.name),
    images: sets,
    photo: photo && `images/${set}/${photo}`,
    outputs,
    gestures,
    texts: uploads.filter((u) => /\.(txt|md)$/.test(u.name)).map((u) => `uploads/${u.name}`),
    research: await Promise.all(research.map(async (r) => ({ folder: r.folder, created: r.created, files: (await listDir(`research/${r.folder}`)).map((f) => f.name) }))),
  }
}

/** The base the -360m names promise; only a table's question sets get it without asking. */
const SMALL = 'HuggingFaceTB/SmolLM2-360M-Instruct'

/** Rows kept from a model's drafts (or written by a model on the Data tab), and drafts still to read. */
const kept = (d: DatasetManifest) => ({ kept: d.sources.filter((s) => s.kind === 'generated').reduce((a, s) => a + s.rows, 0), unreviewed: d.drafts?.unreviewed ?? 0 })
/** How many kept rows a drafting step needs before it is done. */
const KEEP = { studio: 150, voice: 100 }

/** What was made last, so a step's command names it. */
const last = <T extends { created?: unknown }>(xs: T[]): T | undefined => [...xs].sort((a, b) => String(a.created ?? '').localeCompare(String(b.created ?? ''))).pop()

/** The projects, with each step's commands filled in and marked done from what the workspace has. */
function projects(h: Have): Project[] {
  // ask a table: table → question set → adapter → model → check → package, following the chain as far as it goes
  const tables = h.raw.filter((r) => r.columns?.length)
  const askSets = h.data.filter((d) => d.ask)
  const askAdapters = h.adapters.filter((a) => askSets.some((d) => d.folder === a.data))
  const askModels = h.models.filter((m) => askAdapters.some((a) => a.folder === m.adapter))
  const table = last(tables)?.folder ?? '<table>'
  const set = last(askSets)?.folder ?? (tables.length ? `${table}-ask` : '<table>-ask')
  const adapter = last(askAdapters)?.folder ?? `${set}-360m`
  const model = last(askModels)?.model ?? adapter
  const checkSet = askAdapters.find((a) => a.folder === askModels.find((m) => m.model === model)?.adapter)?.data ?? set

  // a character's voice: a Modelfile variant, or their writing → rows → adapter → model
  const variants = h.models.filter((m) => !m.adapter)
  const writing = h.raw.filter((r) => !r.columns?.length)
  const fromWriting = h.data.filter((d) => d.inputs?.some((i) => writing.some((w) => i === `workspace/raw/${w.folder}`)))
  const voiceAdapters = h.adapters.filter((a) => fromWriting.some((d) => d.folder === a.data))
  const book = last(writing)?.folder ?? '<name>'
  const rows = last(fromWriting)?.folder ?? `${book}-qa`
  const voiceAdapter = last(voiceAdapters)?.folder ?? `${rows}-360m`
  const voiceKept = fromWriting.find((d) => d.folder === rows)
  const voiceCount = voiceKept ? kept(voiceKept) : { kept: 0, unreviewed: 0 }

  // gesture: tracker → set → examples → trained → sent
  const gestures = h.gestures
  const recorded = gestures.filter((g) => Object.values(g.counts ?? {}).filter((n) => n >= 5).length >= 2)
  const trained = gestures.filter((g) => g.trained)
  const gset = last(trained)?.folder ?? last(recorded)?.folder ?? last(gestures)?.folder ?? 'my-hands'
  const gcounts = Object.entries(gestures.find((g) => g.folder === gset)?.counts ?? {})

  // cut-out: the tool, a set of photos, a cut-out
  const cutouts = h.outputs.filter((o) => o.items?.some((i) => i.tool === 'cutout'))

  // research bot: search → screen → reading list → judge set → judge → model → package
  const topics = h.research
  const screened = topics.filter((t) => t.files.includes('screen.json'))
  const listed = topics.filter((t) => t.files.includes('reading-list.md'))
  // the keep/skip set Train takes; its -prefs twin is for Prefer
  const judgeSets = h.data.filter((d) => d.research && d.format === 'chat')
  const judges = h.adapters.filter((a) => judgeSets.some((d) => d.folder === a.data))
  const judgeModels = h.models.filter((m) => judges.some((a) => a.folder === m.adapter))
  const topic = last(topics)?.folder ?? '<name>'
  const judgeSet = last(judgeSets)?.folder ?? `${topic}-judge`
  const judge = last(judges)?.folder ?? `${judgeSet}-360m`
  const judgeModel = last(judgeModels)?.model ?? judge

  // a multi-agent studio's readers, one at a time, by name: studio-<reader> set → studio-<reader>-360m → studio-<reader> in Ollama
  const readerSets = h.data.filter((d) => d.folder.startsWith('studio-') && d.format === 'chat')
  const readers = h.adapters.filter((a) => readerSets.some((d) => d.folder === a.data))
  const readerModels = h.models.filter((m) => readers.some((a) => a.folder === m.adapter))
  // the set the last reader trained on; a set made only to check it (rows it never saw) doesn't move the card on
  const reader = last(readers)?.data ?? last(readerSets)?.folder ?? 'studio-mail'
  const readerAdapter = last(readers)?.folder ?? `${reader}-360m`
  const readerSet = readerSets.find((d) => d.folder === reader)
  const readerCount = readerSet ? kept(readerSet) : { kept: 0, unreviewed: 0 }
  const notes = h.raw.find((r) => !r.columns?.length && /notes/.test(r.folder))?.folder
  const notesFrom = (notes && `raw/${notes}`) ?? h.texts.find((t) => /notes/.test(t)) ?? '<notes>'
  const readerModel = last(readerModels)?.model ?? reader
  // sets of rows the reader never trained on, made only to check it
  const asAside = readerSets.filter((d) => d.folder !== reader && !readers.some((a) => a.data === d.folder))
  const compared = [...h.readerChecks].sort((a, b) => a.at.localeCompare(b.at)).pop()
  const pc = (a: number, b: number) => Math.round((a / b) * 100)
  const comparedLine =
    compared &&
    compared.scores
      .map((x) => say('projects.studio.result', { model: x.model, right: pc(x.right, x.fields), rows: pc(x.rows, compared.n), s: (x.ms / 1000).toFixed(1) }))
      .join(' · ')

  return [
    {
      id: 'ask',
      title: say('projects.ask.title'),
      does: say('projects.ask.does'),
      get: say('projects.ask.get'),
      steps: [
        { name: say('projects.ask.table'), tab: 'data', commands: [joinWords(['data', 'raw', 'csv', '<address>', table, '--license', '<license>'])], done: tables.length > 0 },
        {
          name: say('projects.ask.set'),
          tab: 'data',
          commands: [joinWords(['data', 'profile', `raw/${table}`]), joinWords(['data', 'questions', `raw/${table}`, set, '--rows', '1000']), joinWords(['data', 'split', set, '--valid', '0.15']), joinWords(['data', 'validate', set])],
          done: askSets.length > 0,
        },
        { name: say('projects.ask.train'), tab: 'train', commands: [joinWords(['train', adapter, '--data', set])], done: askAdapters.length > 0 },
        { name: say('projects.ask.export'), tab: 'adapters', commands: [joinWords(['export', adapter])], done: askModels.length > 0 },
        { name: say('projects.ask.check'), tab: 'chat', commands: [joinWords(['ask', 'check', model, checkSet])], done: askModels.some((m) => [...h.checks].some((c) => c.endsWith(`/${m.model.replace(/[^\w.-]/g, '_')}`))) },
        { name: say('projects.ask.package'), tab: 'share', commands: [joinWords(['package', model]), joinWords(['zip', `packages/${model}`])], done: askModels.some((m) => h.packages.includes(m.model)) },
      ],
    },
    {
      id: 'gesture',
      title: say('projects.gesture.title'),
      does: say('projects.gesture.does'),
      get: say('projects.gesture.get'),
      steps: [
        { name: say('projects.gesture.tracker'), tab: 'gesture', commands: ['model get hands'], done: h.tools.includes('hands') },
        { name: say('projects.gesture.set'), tab: 'gesture', commands: [joinWords(['gesture', 'new', gset, '--tracker', 'hands'])], done: gestures.length > 0 },
        {
          name: say('projects.gesture.record'),
          tab: 'gesture',
          commands: [],
          done: recorded.length > 0,
          result: say('projects.gesture.check', { counts: gcounts.length ? gcounts.map(([k, n]) => `${k} ${n}`).join(' · ') : say('projects.gesture.none') }),
        },
        { name: say('projects.gesture.train'), tab: 'gesture', commands: [joinWords(['gesture', 'train', gset])], done: trained.length > 0 },
        { name: say('projects.gesture.send'), tab: 'gesture', commands: [joinWords(['gesture', 'send', gset, '--port', '9000'])], done: gestures.some((g) => g.sent) },
      ],
    },
    {
      id: 'cutout',
      title: say('projects.cutout.title'),
      does: say('projects.cutout.does'),
      get: say('projects.cutout.get'),
      steps: [
        { name: say('projects.cutout.tool'), tab: 'segmentation', commands: ['model get cutout'], done: h.tools.includes('cutout') },
        { name: say('projects.cutout.photos'), tab: 'segmentation', commands: ['look example classic-cv'], done: h.images.length > 0 },
        { name: say('projects.cutout.cut'), tab: 'segmentation', commands: [joinWords(['look', 'cutout', h.photo ?? 'images/classic-cv/<photo>'])], done: cutouts.length > 0 },
      ],
    },
    {
      id: 'voice',
      title: say('projects.voice.title'),
      does: say('projects.voice.does'),
      get: say('projects.voice.get'),
      steps: [
        { name: say('projects.voice.modelfile'), tab: 'modelfile', commands: [joinWords(['ollama', 'create', '<name>', '-f', 'workspace/modelfiles/<name>.Modelfile'])], done: variants.length > 0 },
        { name: say('projects.voice.writing'), tab: 'data', commands: [joinWords(['data', 'raw', 'gutenberg', '<book number>', book])], done: writing.length > 0, or: true },
        {
          name: say('projects.voice.rows'),
          tab: 'data',
          commands: [joinWords(['data', 'draft', rows, '--from', `raw/${book}`, '--count', '150', '--model', 'qwen3:4b'])],
          done: voiceCount.kept >= KEEP.voice,
          result: voiceKept && say('projects.step.kept', { kept: voiceCount.kept, target: KEEP.voice, unreviewed: voiceCount.unreviewed }),
        },
        { name: say('projects.voice.train'), tab: 'train', commands: [joinWords(['train', voiceAdapter, '--data', rows, '--base', SMALL])], done: voiceAdapters.length > 0 },
        { name: say('projects.voice.export'), tab: 'adapters', commands: [joinWords(['export', voiceAdapter])], done: h.models.some((m) => voiceAdapters.some((a) => a.folder === m.adapter)) },
      ],
    },
    {
      id: 'research',
      title: say('projects.research.title'),
      does: say('projects.research.does'),
      get: say('projects.research.get'),
      limits: say('projects.research.limits'),
      steps: [
        { name: say('projects.research.search'), tab: 'data', commands: [joinWords(['papers', 'search', topic, '--topic', '<topic>', '--seed', '<doi>', '--seed', '<doi>'])], done: topics.length > 0 },
        { name: say('projects.research.screen'), tab: 'data', commands: [joinWords(['papers', 'screen', topic])], done: screened.length > 0 },
        { name: say('projects.research.list'), tab: 'data', commands: [joinWords(['papers', 'summarise', topic]), joinWords(['papers', 'list', topic])], done: listed.length > 0 },
        { name: say('projects.research.judge'), tab: 'data', commands: [joinWords(['papers', 'judge', topic, judgeSet]), joinWords(['data', 'split', judgeSet, '--valid', '0.2'])], done: judgeSets.length > 0 },
        { name: say('projects.research.trainJudge'), tab: 'train', commands: [joinWords(['train', judge, '--data', judgeSet, '--base', SMALL])], done: judges.length > 0 },
        { name: say('projects.research.export'), tab: 'adapters', commands: [joinWords(['export', judge])], done: judgeModels.length > 0 },
        { name: say('projects.research.package'), tab: 'share', commands: [joinWords(['package', judgeModel]), joinWords(['zip', `packages/${judgeModel}`])], done: judgeModels.some((m) => h.packages.includes(m.model)) },
      ],
    },
    {
      id: 'studio',
      title: say('projects.studio.title'),
      does: say('projects.studio.does'),
      get: say('projects.studio.get'),
      limits: say('projects.studio.limits'),
      steps: [
        {
          name: say('projects.studio.set'),
          tab: 'data',
          commands: [joinWords(['data', 'new', reader])],
          done: readerSets.length > 0,
          fill: { data: { pick: 'new', newName: reader } },
          notes: [
            { at: 'data.new.name', text: say('projects.studio.set.name') },
            { at: 'data.new', text: say('projects.studio.set.create') },
          ],
        },
        {
          name: say('projects.studio.rows'),
          tab: 'data',
          commands: [joinWords(['data', 'draft', reader, '--from', notesFrom, '--fields', readerFields(reader) ?? '<a,b,c>', '--count', '200', '--model', 'qwen3:4b'])],
          done: readerCount.kept >= KEEP.studio,
          result: readerSet && say('projects.step.kept', { kept: readerCount.kept, target: KEEP.studio, unreviewed: readerCount.unreviewed }),
          fill: { data: { pick: reader } },
          notes: [
            { at: 'data.drafts.from', text: say('projects.studio.rows.from') },
            { at: 'data.drafts.fields', text: say('projects.studio.rows.fields') },
            { at: 'data.draft', text: say('projects.studio.rows.draft') },
            { at: 'data.drafts.list', text: say('projects.studio.rows.read', { target: KEEP.studio }) },
          ],
        },
        { name: say('projects.studio.corrections'), tab: 'data', fill: { data: { pick: reader } }, commands: [`data append ${reader} '<row json>' --source corrections`], done: readerSets.some((d) => d.command.some((c) => c.startsWith('data append') && c.includes('--source corrections'))) },
        {
          name: say('projects.studio.split'),
          tab: 'data',
          commands: [joinWords(['data', 'split', reader, '--valid', '0.15']), joinWords(['data', 'validate', reader])],
          done: readerSets.some((d) => d.split),
          fill: { data: { pick: reader } },
          notes: [
            { at: 'data.split.run', text: say('projects.studio.split.split') },
            { at: 'data.validate', text: say('projects.studio.split.validate') },
          ],
        },
        {
          name: say('projects.studio.train'),
          tab: 'train',
          commands: [joinWords(['train', readerAdapter, '--data', reader, '--base', SMALL, '--max-seq', '512'])],
          done: readers.length > 0,
          fill: { train: { data: reader, name: readerAdapter, base: SMALL, maxSeq: 512 } },
          notes: [
            { at: 'train.base', text: say('projects.studio.train.base') },
            { at: 'train.maxSeq', text: say('projects.studio.train.maxSeq') },
            { at: 'train.run', text: say('projects.studio.train.run') },
          ],
        },
        { name: say('projects.studio.export'), tab: 'adapters', commands: [joinWords(['export', readerAdapter, '--name', reader])], done: readerModels.length > 0 },
        { name: say('projects.studio.compare'), tab: 'chat', commands: [joinWords(['reader', 'check', readerModel, reader]), ...asAside.map((d) => joinWords(['reader', 'check', readerModel, d.folder]))], done: !!compared, result: comparedLine ? say('projects.studio.compared', { n: compared!.n, scores: comparedLine }) : undefined },
      ],
    },
  ]
}

/** What a step's state is called on the page. */
const STATE_WORDS = { done: () => say('projects.step.done'), todo: () => say('projects.step.todo'), soon: () => say('projects.step.soon') }

/**
 * Projects: finished work made by putting the tabs together. Each card is a
 * project, its steps in order; a step opens its tab, shows its command (run it
 * from here, exactly as the tab would), and is done when the workspace has what
 * it makes. A step not built yet is marked soon.
 */
/** The projects, read from the workspace and read again whenever it changes: for the tab, and for the guide bar. */
export function useProjects(): Project[] | null {
  const [have, setHave] = useState<Have | null>(null)
  const load = useCallback(() => void readHave().then(setHave), [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path.endsWith('manifest.json') || e.path.startsWith('modelfiles/') || e.path.startsWith('uploads/') || /^data\/[^/]+\/check-/.test(e.path) || e.kind === 'addDir' || e.kind === 'unlinkDir') && load(), [load]),
  )
  return have && projects(have)
}

/** A step's number on its card, and how many steps its way has: a second way counts from its own first step. */
export function stepNumber(steps: Step[], i: number) {
  const start = Math.max(0, steps.slice(0, i + 1).findLastIndex((x) => x.or))
  const end = steps.findIndex((x, j) => j > i && x.or)
  return { n: i - start + 1, of: (end < 0 ? steps.length : end) - start }
}

export default function ProjectsPanel() {
  const list = useProjects()
  const guide = useGuide()
  const [busy, setBusy] = useState('')

  const run = async (lines: string[]) => {
    setBusy(lines[0])
    for (const l of lines) if (!(await runCommand(l))) break
    setBusy('')
  }

  return (
    <section className="panel projects" aria-label={say('projects.label')}>
      <h2 className="panel__title label">{say('projects.title')}</h2>
      <p className="mf-next projects__intro">{rich('projects.intro')}</p>
      <div className="projects__cards">
        {list &&
          list.map((p) => {
            return (
              <article key={p.id} id={`card-${p.id}`} className={`manifest project ${guide?.project === p.id ? 'is-followed' : ''}`.trim()} aria-labelledby={`project-${p.id}`}>
                <header className="manifest__head">
                  <h3 className="manifest__name" id={`project-${p.id}`}>
                    {p.title}
                  </h3>
                </header>
                <dl className="project__about">
                  <dt className="label label--muted">{say('projects.card.does')}</dt>
                  <dd>{p.does}</dd>
                  <dt className="label label--muted">{say('projects.card.get')}</dt>
                  <dd>{p.get}</dd>
                  {p.limits && (
                    <>
                      <dt className="label label--muted">{say('projects.card.limits')}</dt>
                      <dd>{p.limits}</dd>
                    </>
                  )}
                </dl>
                <ol className="project-steps" aria-label={say('projects.card.steps')}>
                  {p.steps.map((s, i) => {
                    const state = s.soon ? 'soon' : s.done ? 'done' : 'todo'
                    const { n } = stepNumber(p.steps, i)
                    const followed = guide?.project === p.id && guide.step === i + 1
                    return (
                      <li key={s.name} className={`project-step is-${state} ${s.or ? 'is-or' : ''} ${followed ? 'is-followed' : ''}`.trim()}>
                        <span className="project-step__state label">
                          {s.or && `${say('projects.step.or')} `}
                          {n} · {STATE_WORDS[state]()}
                        </span>
                        <span className="project-step__body">
                          <span className="project-step__name">{s.name}</span>
                          <a
                            href={guideHref(p.id, i + 1, s.tab)}
                            className="text-link project-step__tab"
                            onClick={(e) => {
                              e.preventDefault()
                              startGuide(p.id, i + 1, s.tab)
                            }}
                          >
                            {say('projects.step.open', { tab: TAB_NAME[s.tab] })}
                          </a>
                          {!s.soon && s.commands.length === 0 && <span className="label label--muted">{say('projects.step.inPage', { tab: TAB_NAME[s.tab] })}</span>}
                          {!s.soon &&
                            s.commands.map((c) => (
                              <CommandPreview key={c} command={c} onRun={() => void run([c])} disabled={c.includes('<')} running={busy === c} label={say('projects.step.run')} />
                            ))}
                          {s.result && <span className="label label--muted project-step__result">{s.result}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </article>
            )
          })}
      </div>
    </section>
  )
}
