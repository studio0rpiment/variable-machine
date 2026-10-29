import { useCallback, useEffect, useState } from 'react'
import { joinWords } from '@shared/quote'
import type { DatasetManifest } from '@shared/manifest'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { listDir, readFile, readManifests } from '../lib/workspace'
import CommandPreview from './CommandPreview'
import { Explained } from '../explain/Explained'
import { rich, say } from '../text/say'

/** The tabs a step can open, by id, and what the top bar calls them. */
const TAB_NAME = { data: 'data', train: 'train', prefer: 'prefer', adapters: 'adapters', chat: 'chat', share: 'share', modelfile: 'modelfile', gesture: 'gesture', segmentation: 'image segmentation' } as const
type Tab = keyof typeof TAB_NAME

interface Step {
  name: string
  tab: Tab
  /** the commands it runs, in order, filled from the workspace where it can be; none when it is done in the page */
  commands: string[]
  done: boolean
  /** not built yet */
  soon?: boolean
  /** the start of a second way: its steps take the place of the ones above */
  or?: boolean
}

interface Project {
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
  /** research folders, with the files each has (screen.json, reading-list.md) */
  research: { folder: string; created?: string; files: string[] }[]
}

async function readHave(): Promise<Have> {
  const [raw, data, adapters, mfs, packages, tools, images, outputs, gestures, research] = await Promise.all([
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
  for (const d of data.filter((x) => x.ask))
    for (const f of await listDir(`data/${d.folder}`)) {
      const m = /^check-(.+)\.json$/.exec(f.name)
      if (m) checks.add(`${d.folder}/${m[1]}`)
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
    packages: packages.map((p) => p.folder),
    tools: tools.filter((t) => t.dir).map((t) => t.name),
    images: sets,
    photo: photo && `images/${set}/${photo}`,
    outputs,
    gestures,
    research: await Promise.all(research.map(async (r) => ({ folder: r.folder, created: r.created, files: (await listDir(`research/${r.folder}`)).map((f) => f.name) }))),
  }
}

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

  // gesture: tracker → set → examples → trained → sent
  const gestures = h.gestures
  const recorded = gestures.filter((g) => Object.values(g.counts ?? {}).filter((n) => n >= 5).length >= 2)
  const trained = gestures.filter((g) => g.trained)
  const gset = last(trained)?.folder ?? last(recorded)?.folder ?? last(gestures)?.folder ?? 'my-hands'

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
        { name: say('projects.gesture.record'), tab: 'gesture', commands: [], done: recorded.length > 0 },
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
        { name: say('projects.voice.rows'), tab: 'data', commands: [], done: fromWriting.length > 0 },
        { name: say('projects.voice.train'), tab: 'train', commands: [joinWords(['train', voiceAdapter, '--data', rows])], done: voiceAdapters.length > 0 },
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
        { name: say('projects.research.trainJudge'), tab: 'train', commands: [joinWords(['train', judge, '--data', judgeSet])], done: judges.length > 0 },
        { name: say('projects.research.export'), tab: 'adapters', commands: [joinWords(['export', judge])], done: judgeModels.length > 0 },
        { name: say('projects.research.package'), tab: 'share', commands: [joinWords(['package', judgeModel]), joinWords(['zip', `packages/${judgeModel}`])], done: judgeModels.some((m) => h.packages.includes(m.model)) },
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
export default function ProjectsPanel() {
  const [have, setHave] = useState<Have | null>(null)
  const [busy, setBusy] = useState('')
  const load = useCallback(() => void readHave().then(setHave), [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path.endsWith('manifest.json') || e.path.startsWith('modelfiles/') || /^data\/[^/]+\/check-/.test(e.path) || e.kind === 'addDir' || e.kind === 'unlinkDir') && load(), [load]),
  )

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
        {have &&
          projects(have).map((p) => {
            return (
              <article key={p.id} className="manifest project" aria-labelledby={`project-${p.id}`}>
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
                <Explained id="projects.steps">
                  <ol className="project-steps" aria-label={say('projects.card.steps')}>
                    {p.steps.map((s, i) => {
                      const state = s.soon ? 'soon' : s.done ? 'done' : 'todo'
                      // a second way counts from its own first step
                      const n = i - Math.max(0, p.steps.slice(0, i + 1).findLastIndex((x) => x.or)) + 1
                      return (
                        <li key={s.name} className={`project-step is-${state} ${s.or ? 'is-or' : ''}`.trim()}>
                          <span className="project-step__state label">
                            {s.or && `${say('projects.step.or')} `}
                            {n} · {STATE_WORDS[state]()}
                          </span>
                          <span className="project-step__body">
                            <span className="project-step__name">{s.name}</span>
                            <a href={`#${s.tab}`} className="text-link project-step__tab">
                              {say('projects.step.open', { tab: TAB_NAME[s.tab] })}
                            </a>
                            {!s.soon && s.commands.length === 0 && <span className="label label--muted">{say('projects.step.inPage', { tab: TAB_NAME[s.tab] })}</span>}
                            {!s.soon &&
                              s.commands.map((c) => (
                                <CommandPreview key={c} command={c} onRun={() => void run([c])} disabled={c.includes('<')} running={busy === c} label={say('projects.step.run')} />
                              ))}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </Explained>
              </article>
            )
          })}
      </div>
    </section>
  )
}
