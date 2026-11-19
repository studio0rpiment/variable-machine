import { useCallback, useEffect, useState } from 'react'
import { joinWords } from '@shared/quote'
import type { DatasetManifest } from '@shared/manifest'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { listDir, readFile, readManifests } from '../lib/workspace'
import CommandPreview from './CommandPreview'
import { rich, say } from '../text/say'
import { guideHref, SCHEMATICS, startGuide, useGuide } from '../lib/guide'
import { trackerOf, type Tracker } from '@shared/gesture'
import { useGestureChoices, type GestureChoices } from '../lib/gestureChoices'
import { useVoiceChoices, type Approach, type VoiceChoices } from '../lib/voiceChoices'
import { FIELD_LIST, SOURCE_FLAG, useResearchChoices, type ResearchChoices } from '../lib/researchChoices'
import { listModels } from '../lib/ollama'

/** The tabs a step can open, by id, and what the top bar calls them. */
export const TAB_NAME = { models: 'models', merge: 'merge', data: 'data', train: 'train', prefer: 'prefer', adapters: 'adapters', chat: 'chat', share: 'share', modelfile: 'modelfile', gesture: 'gesture', segmentation: 'image segmentation' } as const
type Tab = keyof typeof TAB_NAME

/** What a step fills in on its tab when a student arrives from the card: the names the card has chosen. */
export interface Fill {
  /** the Data tab: the set to open, or "new" with the name to make */
  data?: { pick: string; newName?: string }
  /** the Train tab: the set, the adapter's name, the base, the max sequence length */
  train?: { data: string; name: string; base: string; maxSeq?: number }
  /** the Modelfile tab: the model a new variant starts from */
  modelfile?: { base: string }
  /** the Prefer tab: the preference set, and the model it starts from */
  prefer?: { data: string; model: string }
  /** the Chat tab: the models to put in its columns, in order; null leaves a column as it is */
  chat?: { models: (string | null)[] }
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
  /** the box it sits on in the Start map (FlowMap's node id), for a project's schematic */
  node?: string
  /** project mode: the parts of its tab it uses (lib/parts.tsx); the tab's other marked parts hide. Unset: the whole tab */
  parts?: string[]
}

/** What the gesture controller's schematic shows beside its steps: the set, and the decisions as the workspace has them. */
export interface GestureFacts {
  /** the set the steps are about; made says whether it exists yet */
  set: string
  made: boolean
  /** what it follows: the set's tracker, or the choice for a new set */
  tracker: Tracker
  /** the set is a copy of an example set: its gestures came recorded */
  example: boolean
  /** the example sets, by name, for each tracker */
  exampleSets: { folder: string; tracker: Tracker }[]
  counts: Record<string, number>
  trained?: { k: number; examples: number; check: { heldOut: number; correct: number } }
  sent: boolean
}

export interface Project {
  id: string
  title: string
  does: string
  get: string
  limits?: string
  steps: Step[]
  gesture?: GestureFacts
  /** a character's voice, followed as a project: the route the decisions draw */
  voice?: VoiceFacts
  /** the research bot, followed as a project: the route the decisions draw */
  research?: ResearchFacts
}

/** What the research bot's schematic shows: the route's steps, and what the decisions can choose from. */
export interface ResearchFacts {
  steps: Step[]
  /** the research folder followed, if there is one yet */
  folder?: ResearchFolder
  folders: string[]
  /** the Ollama models there are, with their size in bytes */
  ollama: { name: string; size: number }[]
  /** the point of view made, once it is in Ollama */
  view?: string
}

/** What a character's voice schematic shows: the steps of the route chosen, and what the decisions can choose from. */
export interface VoiceFacts {
  approach: Approach
  /** the route's steps, in order, for the approach and the decisions under it */
  steps: Step[]
  /** the texts there are to draft rows from: raw/<name> or uploads/<file> */
  texts: { id: string; source?: string }[]
  /** the Ollama models there are, with their size in bytes */
  ollama: { name: string; size: number }[]
  /** voices trained by imitating, on the chosen base */
  voices: string[]
}

/** How many pairs a preference set needs before Prefer: 40 made the README's concise set work; 30 is the least we ask. */
const PAIRS = 30

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
  /** lora, dora, full, or dpo for a Prefer run */
  method?: string
}
interface Gesture {
  folder: string
  created?: string
  tracker?: string
  counts: Record<string, number>
  trained?: GestureFacts['trained']
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
  /** the example gesture sets Variable Machine comes with */
  exampleGestures: Gesture[]
  /** research folders, with the files each has (screen.json, reading-list.md), and what screen.json holds */
  research: ResearchFolder[]
  /** texts uploaded for drafting rows from (data draft --from uploads/…) */
  texts: string[]
  /** PDFs uploaded, for the research bot to read in full (papers add) */
  pdfs: string[]
  /** the Ollama models, with their size in bytes */
  ollama: { name: string; size: number }[]
  /** blends made on the Merge tab */
  merges: { folder: string; created?: string; a: string; b: string; base: string }[]
  /** days of chat log, each a file in workspace/chat */
  chatLogs: number
}

async function readHave(): Promise<Have> {
  const [raw, data, adapters, mfs, packages, tools, images, outputs, gestures, research, uploads, exampleGestures] = await Promise.all([
    readManifests<Raw>('raw'),
    readManifests<DatasetManifest>('data'),
    readManifests<Adapter>('adapters'),
    listDir('modelfiles'),
    readManifests<{ name: string }>('packages'),
    listDir('tools'),
    listDir('images'),
    readManifests<Output>('outputs'),
    readManifests<Gesture>('gestures'),
    readManifests<{ created?: string; runs?: unknown[]; pooled?: string[] }>('research'),
    listDir('uploads'),
    readManifests<Gesture>('examples/gestures'),
  ])
  const [ollama, merges, chat] = await Promise.all([
    listModels().catch(() => []),
    readManifests<Have['merges'][number]>('merges'),
    listDir('chat'),
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
    exampleGestures,
    ollama: ollama.map((m) => ({ name: m.name, size: m.size })),
    merges,
    chatLogs: chat.filter((f) => f.name.endsWith('.jsonl')).length,
    texts: uploads.filter((u) => /\.(txt|md)$/.test(u.name)).map((u) => `uploads/${u.name}`),
    pdfs: uploads.filter((u) => /\.pdf$/i.test(u.name)).map((u) => `uploads/${u.name}`),
    research: await Promise.all(research.map(readResearch)),
  }
}

/** A research folder: its files, how many searches it has had, and what its screen.json says. */
export interface ResearchFolder {
  folder: string
  created?: string
  files: string[]
  runs: number
  /** items a model screened (not those skipped by similarity alone) */
  screened: number
  /** items you decided yourself, and of those, where you overrode the screener */
  mine: number
  overrides: number
  /** items with a summary */
  summaries: number
  /** the models that screened items here */
  by: string[]
  /** items a second screener read (papers screen --as second) */
  second: number
  /** items summarised from their full text (papers summarise --full-text) */
  fullText: number
  /** your own copies in the library (papers add) */
  added: number
  /** a class's pool: the students' research folders (papers pool) */
  pooled?: string[]
}

async function readResearch(r: { folder: string; created?: string; runs?: unknown[]; pooled?: string[] }): Promise<ResearchFolder> {
  const files = (await listDir(`research/${r.folder}`)).map((f) => f.name)
  type D = { screen?: { decision: string; by: string; similarity?: true }; student?: { decision: string }; second?: unknown; summary?: { from: string }[] }
  let screen: Record<string, D> = {}
  try {
    screen = JSON.parse((await readFile(`research/${r.folder}/screen.json`)) ?? '{}') as Record<string, D>
  } catch {
    // a half-written screen.json: read again on the next change
  }
  const ds = Object.values(screen)
  // read by a model: not skipped by similarity alone (the ranker's name has "embed" in it)
  const byModel = ds.filter((d) => d.screen && !d.screen.similarity && !/embed/i.test(d.screen.by))
  const library = files.includes('library.jsonl') ? ((await readFile(`research/${r.folder}/library.jsonl`)) ?? '') : ''
  return {
    folder: r.folder,
    created: r.created,
    files,
    runs: r.runs?.length ?? 0,
    screened: byModel.length,
    mine: ds.filter((d) => d.student).length,
    overrides: byModel.filter((d) => d.student && d.student.decision !== d.screen!.decision).length,
    summaries: ds.filter((d) => d.summary?.length).length,
    by: [...new Set(byModel.map((d) => d.screen!.by))],
    second: ds.filter((d) => d.second).length,
    fullText: ds.filter((d) => d.summary?.some((c) => /page|characters|full text/.test(c.from))).length,
    added: (library.match(/"local":/g) ?? []).length,
    ...(r.pooled && { pooled: r.pooled }),
  }
}

/** The base the -360m names promise; only a table's question sets get it without asking. */
const SMALL = 'HuggingFaceTB/SmolLM2-360M-Instruct'

/** Rows kept from a model's drafts (or written by a model on the Data tab), and drafts still to read. */
const kept = (d: DatasetManifest) => ({ kept: d.sources.filter((s) => s.kind === 'generated').reduce((a, s) => a + s.rows, 0), unreviewed: d.drafts?.unreviewed ?? 0 })
/** How many kept rows a drafting step needs before it is done. */
const KEEP = { voice: 100 }

/** What was made last, so a step's command names it. */
const last = <T extends { created?: unknown }>(xs: T[]): T | undefined => [...xs].sort((a, b) => String(a.created ?? '').localeCompare(String(b.created ?? ''))).pop()

/** The projects, with each step's commands filled in and marked done from what the workspace has. */
/**
 * A character's voice as a route: the steps the chosen approach takes through
 * the tabs, each on its box of the Start map, with its command filled in from
 * the decisions and the workspace, and done when the workspace has what it makes.
 */
function voiceRoute(h: Have, c: VoiceChoices): VoiceFacts {
  const texts = [...h.raw.filter((r) => !r.columns?.length).map((r) => ({ id: `raw/${r.folder}`, source: r.source })), ...h.texts.map((t) => ({ id: t }))]
  const chosen = c.texts.filter((t) => texts.some((x) => x.id === t))
  const fromText = (d: DatasetManifest) => d.format !== 'preference' && !!d.inputs?.some((i) => texts.some((t) => i === `workspace/${t.id}`))
  const writingSets = h.data.filter(fromText)
  // the rows: the set drafted from the chosen texts, or else the latest made from any text
  const first = (chosen[0] ?? texts[0]?.id ?? 'raw/<name>').split('/').pop()!.replace(/\.(txt|md)$/, '')
  // rows written by hand have no text as their input: found by the name the route gives them
  const rowsSet = writingSets.find((d) => chosen.length > 0 && chosen.every((t) => d.inputs?.includes(`workspace/${t}`))) ?? h.data.find((d) => d.folder === `${first}-qa`) ?? last(writingSets)
  const rows = rowsSet?.folder ?? `${first}-qa`
  const short = c.trainBase.includes('1.7B') ? '1.7b' : '360m'
  const voices = h.adapters.filter((a) => a.method !== 'dpo' && a.base === c.trainBase && (writingSets.some((d) => d.folder === a.data) || a.data === rowsSet?.folder))
  const voice = voices.find((a) => a.data === rows) ?? last(voices)
  const voiceName = voice?.folder ?? `${rows}-${short}`
  const exported = (adapter: string) => h.models.some((m) => m.adapter === adapter)
  const count = rowsSet ? (c.rows === 'draft' ? kept(rowsSet).kept : rowsSet.counts.train + rowsSet.counts.valid) : 0

  const imitate: Step[] = [
    {
      name: say('projects.voice.mode.texts'),
      tab: 'data',
      node: 'words',
      commands: [joinWords(['data', 'raw', 'gutenberg', '<book number>', '<name>'])],
      done: chosen.length > 0,
      result: chosen.length ? chosen.join(' · ') : say('projects.voice.mode.noTexts'),
      fill: { data: { pick: 'new' } },
      parts: ['data.raw'],
    },
    {
      name: c.rows === 'draft' ? say('projects.voice.rows') : say('projects.voice.mode.corrections'),
      tab: 'data',
      node: 'data',
      commands:
        c.rows === 'draft'
          ? [...(chosen.length ? chosen : ['raw/<name>']).map((t) => joinWords(['data', 'draft', rows, '--from', t, '--count', '150', '--model', 'qwen3:4b'])), joinWords(['data', 'split', rows, '--valid', '0.15'])]
          : [joinWords(['data', 'new', rows]), `data append ${rows} '<row json>' --source corrections`, joinWords(['data', 'split', rows, '--valid', '0.15'])],
      // Train takes a set once some rows are set aside to test with
      done: count >= KEEP.voice && !!rowsSet?.split,
      result: say('projects.voice.mode.rows', { n: count, target: KEEP.voice }),
      fill: rowsSet ? { data: { pick: rows } } : { data: { pick: 'new', newName: rows } },
      // drafted: the drafts to read, and the rows kept; by hand: the rows, and the generator's rows to edit and keep
      parts: c.rows === 'draft' ? ['data.chosen', 'data.drafts', 'data.rows', 'data.ready'] : ['data.chosen', 'data.more', 'data.rows', 'data.ready'],
    },
    { name: say('projects.voice.train'), tab: 'train', node: 'train', commands: [joinWords(['train', voiceName, '--data', rows, '--base', c.trainBase])], done: !!voice, fill: { train: { data: rows, name: voiceName, base: c.trainBase } }, parts: [] },
    { name: say('projects.voice.mode.export'), tab: 'adapters', node: 'adapters', commands: [joinWords(['export', voiceName])], done: !!voice && exported(voice.folder), parts: [] },
  ]

  // lean toward better: pairs chosen in Chat, then DPO on the base or on the voice trained above
  const prefSets = h.data.filter((d) => d.format === 'preference')
  const prefs = last(prefSets)?.folder ?? `${c.preferFrom === 'voice' ? voiceName : 'voice'}-prefs`
  const prefSet = prefSets.find((d) => d.folder === prefs)
  const pairs = prefSet ? prefSet.counts.train + prefSet.counts.valid : 0
  const startFrom = c.preferFrom === 'voice' ? `workspace/fused/${voiceName}` : c.trainBase
  const dpo = h.adapters.find((a) => a.method === 'dpo' && a.data === prefs)
  const dpoName = dpo?.folder ?? `${prefs}-dpo`
  const prefer: Step[] = [
    ...(c.preferFrom === 'voice' ? imitate : []),
    { name: say('projects.voice.mode.pick'), tab: 'chat', node: 'chat', commands: [], done: h.chatLogs > 0 || pairs > 0 },
    {
      name: say('projects.voice.mode.pairs'),
      tab: 'data',
      node: 'data',
      commands: [joinWords(['data', 'new', prefs, '--format', 'preference']), joinWords(['data', 'split', prefs, '--valid', '0.2'])],
      done: pairs >= PAIRS && !!prefSet?.counts.valid,
      result: say('projects.voice.mode.pairCount', { n: pairs, target: PAIRS }),
      fill: prefSet ? { data: { pick: prefs } } : { data: { pick: 'new', newName: prefs } },
      parts: ['data.chosen', 'data.pairs', 'data.ready'],
    },
    { name: say('projects.voice.mode.prefer'), tab: 'prefer', node: 'prefer', commands: [joinWords(['prefer', dpoName, '--data', prefs, '--model', startFrom])], done: !!dpo, fill: { prefer: { data: prefs, model: startFrom } }, parts: [] },
    { name: say('projects.voice.mode.export'), tab: 'adapters', node: 'adapters', commands: [joinWords(['export', dpoName])], done: !!dpo && exported(dpo.folder), parts: [] },
  ]

  // blend two: two voices on one base, then the merge
  const [a, b] = voices.slice(-2).map((v) => v.folder)
  const merge = h.merges.find((m) => voices.some((v) => v.folder === m.a) && voices.some((v) => v.folder === m.b))
  const mergeName = merge?.folder ?? `${a ?? 'voice-a'}-${b ?? 'voice-b'}-blend`
  const blend: Step[] = [
    ...imitate.slice(0, 3),
    { name: say('projects.voice.mode.second'), tab: 'train', node: 'train', commands: [joinWords(['train', '<second voice>', '--data', '<its rows>', '--base', c.trainBase])], done: voices.length >= 2, result: say('projects.voice.mode.voices', { n: voices.length }), parts: [] },
    { name: say('projects.voice.mode.merge'), tab: 'merge', node: 'merge', commands: [joinWords(['merge', mergeName, '--a', a ?? '<voice a>', '--b', b ?? '<voice b>', '--t', '0.5'])], done: !!merge, parts: [] },
    { name: say('projects.voice.mode.export'), tab: 'adapters', node: 'adapters', commands: [joinWords(['export', mergeName])], done: !!merge && exported(merge.folder), parts: [] },
  ]

  // change with words: the base in Ollama, then the Modelfile
  const here = h.ollama.some((m) => m.name === c.modelfileBase || m.name === `${c.modelfileBase}:latest`)
  const variants = h.models.filter((m) => !m.adapter)
  const modelfile: Step[] = [
    { name: say('projects.voice.mode.pull'), tab: 'models', node: 'models', commands: [joinWords(['ollama', 'pull', c.modelfileBase])], done: here, parts: [] },
    { name: say('projects.voice.modelfile'), tab: 'modelfile', node: 'modelfile', commands: [joinWords(['ollama', 'create', '<name>', '-f', 'workspace/modelfiles/<name>.Modelfile'])], done: variants.length > 0, fill: { modelfile: { base: c.modelfileBase } }, parts: [] },
  ]

  // the end of every route: the model made, in Chat; a variant beside the model it was made from
  const made: Record<Approach, string | undefined> = {
    imitate: voice && h.models.find((m) => m.adapter === voice.folder)?.model,
    prefer: dpo && h.models.find((m) => m.adapter === dpo.folder)?.model,
    blend: merge && h.models.find((m) => m.adapter === merge.folder)?.model,
    modelfile: last(variants)?.model,
  }
  const out = made[c.approach]
  const talk: Step = {
    name: say('projects.voice.mode.talk'),
    tab: 'chat',
    node: 'chat',
    commands: [],
    done: !!out && h.chatLogs > 0,
    result: out ?? say('projects.voice.mode.noModel'),
    fill: out ? { chat: { models: c.approach === 'modelfile' ? [c.modelfileBase, out] : [null, out] } } : undefined,
  }
  const steps = [...{ modelfile, imitate, prefer, blend }[c.approach], talk]
  return { approach: c.approach, steps, texts, ollama: h.ollama, voices: voices.map((v) => v.folder) }
}

/** How many of your own decisions a point of view needs: papers judge takes 10; 30 overrides make enough pairs for Prefer. */
const VIEW_DECIDED = 10

/**
 * The research bot as a route: the steps the decisions draw, each on its box
 * of the research bot's schematic (ResearchMode), with its command filled in
 * from the decisions and the workspace, and done when the workspace has what
 * it makes. Every route ends where the research bot is used: a reading list.
 */
function researchRoute(h: Have, c: ResearchChoices): ResearchFacts {
  // the research followed: the one chosen under "which research"; none while a new one is still to be searched
  const folder = c.folder ? h.research.find((r) => r.folder === c.folder) : undefined
  const name = folder?.folder ?? c.folder ?? ''
  const at = name || '<name>'
  const here = (m: string) => h.ollama.some((x) => x.name === m || x.name === `${m}:latest`)
  const flag = (k: string, v: string, fallback: string) => (v === fallback ? [] : [k, v])
  const parts = (...p: string[]) => ['data.papers', 'papers.pick', ...p]
  const listed = !!folder?.files.includes('reading-list.md')

  const need = [...new Set([c.writer, c.ranker, c.screener, ...(c.second ? [c.secondScreener] : []), ...(c.summaries ? [c.summariser] : [])])]
  // the sources besides scholarship, each its own flag; fields, comma-separated; both given on every run, since a run's flags replace the last run's
  const sourceFlags = c.sources.flatMap((s) => SOURCE_FLAG[s] ?? [])
  const fieldFlags = c.fields.length ? ['--fields', FIELD_LIST.filter((x) => c.fields.includes(x)).join(',')] : []
  const lib = (k: 'proxy' | 'keys' | 'copies') => c.library.includes(k)
  const steps: Step[] = [
    {
      name: say('projects.research.mode.models'),
      tab: 'models',
      node: 'models',
      commands: need.map((m) => joinWords(['ollama', 'pull', m])),
      done: need.every(here),
      result: need.filter((m) => !here(m)).length ? say('projects.research.mode.missing', { models: need.filter((m) => !here(m)).join(', ') }) : undefined,
      parts: [],
    },
    ...(lib('keys')
      ? [
          {
            name: say('projects.research.mode.keys'),
            tab: 'data' as const,
            node: 'papers',
            commands: ['papers keys'],
            // the keys file is outside the workspace, where this page can't look: the step is done once the search has run, keys or not
            done: !!folder,
            result: say('projects.research.mode.keysResult'),
            fill: { data: { pick: 'new' } },
            parts: parts('papers.intro'),
          },
        ]
      : []),
    {
      name: say('projects.research.mode.search'),
      tab: 'data',
      node: 'search',
      commands: folder
        ? [joinWords(['papers', 'search', name, ...sourceFlags, ...fieldFlags, ...flag('--model', c.writer, 'qwen3:4b')])]
        : [joinWords(['papers', 'search', at, '--topic', '<topic>', '--seed', '<doi>', '--seed', '<doi>', ...(c.sources.includes('feeds') ? ['--feed', '<address>'] : []), ...sourceFlags, ...(c.sources.includes('patents') ? ['--patent', '<number>'] : []), ...fieldFlags, ...flag('--model', c.writer, 'qwen3:4b')])],
      done: !!folder,
      result: folder ? say('projects.research.mode.searched', { folder: name, runs: folder.runs }) : undefined,
      fill: { data: { pick: 'new' } },
      parts: parts('papers.intro', 'papers.search'),
    },
    ...(lib('copies')
      ? [
          {
            name: say('projects.research.mode.add'),
            tab: 'data' as const,
            node: 'papers',
            commands: (h.pdfs.length ? h.pdfs : ['uploads/<file>.pdf']).slice(0, 3).map((p) => joinWords(['papers', 'add', at, p])),
            done: !!folder?.added,
            result: folder ? say('projects.research.mode.added', { n: folder.added }) : undefined,
            fill: { data: { pick: 'new' } },
            parts: parts('papers.items'),
          },
        ]
      : []),
    {
      name: say('projects.research.mode.screen'),
      tab: 'data',
      node: 'screen',
      commands: [joinWords(['papers', 'screen', at, ...flag('--top', String(c.top), '40'), ...flag('--model', c.screener, 'qwen3:4b'), ...flag('--embed', c.ranker, 'nomic-embed-text')])],
      done: !!folder?.screened,
      result: folder ? say('projects.research.mode.screened', { n: folder.screened }) : undefined,
      fill: { data: { pick: 'new' } },
      parts: parts('papers.about', 'papers.screen'),
    },
    ...(c.second
      ? [
          {
            name: say('projects.research.mode.second'),
            tab: 'data' as const,
            node: 'screen',
            commands: [joinWords(['papers', 'screen', at, '--as', 'second', '--model', c.secondScreener])],
            done: !!folder?.second,
            result: folder ? say('projects.research.mode.secondRead', { n: folder.second }) : undefined,
            fill: { data: { pick: 'new' } },
            parts: parts('papers.screen'),
          },
        ]
      : []),
    {
      name: say('projects.research.mode.decide'),
      tab: 'data',
      node: 'you',
      commands: [joinWords(['papers', 'decide', at, '<key>', 'keep']), joinWords(['papers', 'decide', at, '<key>', 'skip'])],
      done: !folder ? false : c.take === 'list' ? folder.mine > 0 : c.trainFrom === 'all' ? folder.mine >= VIEW_DECIDED : folder.overrides >= PAIRS,
      result: folder ? say('projects.research.mode.decided', { mine: folder.mine, overrides: folder.overrides, target: c.take === 'list' ? 1 : c.trainFrom === 'all' ? VIEW_DECIDED : PAIRS }) : undefined,
      fill: { data: { pick: 'new' } },
      parts: parts('papers.items'),
    },
    ...(c.second
      ? [
          {
            name: say('projects.research.mode.check'),
            tab: 'data' as const,
            node: 'you',
            commands: [joinWords(['papers', 'check', at])],
            done: !!folder?.files.includes('check.json'),
            fill: { data: { pick: 'new' } },
            parts: parts('papers.items'),
          },
        ]
      : []),
    ...(c.summaries
      ? [
          {
            name: c.fullText ? say('projects.research.mode.summariseFull') : say('projects.research.mode.summarise'),
            tab: 'data' as const,
            node: 'list',
            commands: [joinWords(['papers', 'summarise', at, ...(c.fullText ? ['--full-text'] : []), ...flag('--model', c.summariser, 'qwen3:4b')])],
            done: c.fullText ? !!folder?.fullText : !!folder?.summaries,
            fill: { data: { pick: 'new' } },
            parts: parts('papers.list'),
          },
        ]
      : []),
    {
      name: c.take === 'list' ? say('projects.research.mode.read') : say('projects.research.mode.list'),
      tab: 'data',
      node: 'list',
      commands: [joinWords(['papers', 'list', at, ...(lib('proxy') ? ['--proxy', '<your library’s prefix>'] : []), ...(c.fields.length > 1 ? ['--bridges-first'] : [])])],
      done: listed,
      fill: { data: { pick: 'new' } },
      parts: parts('papers.list'),
    },
  ]
  if (c.take === 'list') return { steps, folder, folders: h.research.map((r) => r.folder), ollama: h.ollama }

  // a class: the students' decisions pooled into one folder first, and the point of view learns from that
  const pool = c.whose === 'class' ? h.research.find((r) => r.pooled?.includes(name)) : undefined
  const from = c.whose === 'class' ? (pool?.folder ?? `${at}-class`) : at
  if (c.whose === 'class')
    steps.push({
      name: say('projects.research.mode.pool'),
      tab: 'data',
      node: 'you',
      commands: [joinWords(['unzip', 'shared/research-<classmate>.zip']), joinWords(['papers', 'pool', from, '--from', at, ...(pool?.pooled?.filter((p) => p !== name).flatMap((p) => ['--from', p]) ?? ['--from', '<classmate>'])]), joinWords(['papers', 'check', from])],
      done: !!pool,
      result: pool ? say('projects.research.mode.pooled', { n: pool.pooled!.length, decided: pool.mine }) : undefined,
      fill: { data: { pick: 'new' } },
      parts: parts('papers.items'),
    })

  // a point of view: the decisions as a set, then trained on all of them (Train) or only on where they overrode the screener (Prefer)
  const set = `${from}-view`
  const prefs = `${set}-prefs`
  const short = c.base.includes('1.7B') ? '1.7b' : '360m'
  const sets = h.data.filter((d) => d.research?.folder === (c.whose === 'class' ? from : name))
  const viewSet = sets.find((d) => d.format === 'chat')
  const prefSet = sets.find((d) => d.format === 'preference')
  const trainOn = c.trainFrom === 'all' ? viewSet : prefSet
  const adapter = h.adapters.find((a) => a.data === trainOn?.folder && a.base === c.base && (c.trainFrom === 'all') === (a.method !== 'dpo'))
  const pov = adapter?.folder ?? (c.trainFrom === 'all' ? `${viewSet?.folder ?? set}-${short}` : `${prefSet?.folder ?? prefs}-${short}`)
  const model = adapter && h.models.find((m) => m.adapter === adapter.folder)?.model
  const use = model ?? pov
  steps.push({
    name: say('projects.research.mode.set'),
    tab: 'data',
    node: 'data',
    commands: [joinWords(['papers', 'judge', from, set]), joinWords(['data', 'split', viewSet?.folder ?? set, '--valid', '0.2']), ...(c.trainFrom === 'overrides' ? [joinWords(['data', 'split', prefSet?.folder ?? prefs, '--valid', '0.2'])] : [])],
    done: !!trainOn?.split,
    result: viewSet ? say('projects.research.mode.setMade', { rows: viewSet.counts.train + viewSet.counts.valid, pairs: prefSet ? prefSet.counts.train + prefSet.counts.valid : 0 }) : undefined,
    fill: { data: { pick: 'new' } },
    parts: parts('papers.judge'),
  })
  if (c.trainFrom === 'all')
    steps.push({ name: say('projects.research.mode.train'), tab: 'train', node: 'train', commands: [joinWords(['train', pov, '--data', viewSet?.folder ?? set, '--base', c.base])], done: !!adapter, fill: { train: { data: viewSet?.folder ?? set, name: pov, base: c.base } }, parts: [] })
  else
    steps.push({ name: say('projects.research.mode.prefer'), tab: 'prefer', node: 'prefer', commands: [joinWords(['prefer', pov, '--data', prefSet?.folder ?? prefs, '--model', c.base])], done: !!adapter, fill: { prefer: { data: prefSet?.folder ?? prefs, model: c.base } }, parts: [] })
  steps.push({ name: say('projects.research.mode.export'), tab: 'adapters', node: 'adapters', commands: [joinWords(['export', pov])], done: !!model, result: model, parts: [] })
  if (c.folderOfItsOwn)
    steps.push({ name: say('projects.research.mode.package'), tab: 'share', node: 'share', commands: [joinWords(['package', use]), joinWords(['zip', `packages/${use}`])], done: !!model && h.packages.includes(model), parts: [] })
  steps.push({
    name: say('projects.research.mode.use'),
    tab: 'data',
    node: 'list',
    commands: [joinWords(['papers', 'search', at]), joinWords(['papers', 'screen', at, '--model', use]), joinWords(['papers', 'list', at])],
    done: !!model && !!folder?.by.includes(model),
    fill: { data: { pick: 'new' } },
    parts: parts('papers.items', 'papers.list'),
  })
  return { steps, folder, folders: h.research.map((r) => r.folder), ollama: h.ollama, view: model }
}

function projects(h: Have, choice: GestureChoices, voice: VoiceChoices, research: ResearchChoices): Project[] {
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
  // the set chosen on the gesture tab: steps 2 to 5 are about it; none while a new set is being made
  const gnow = gestures.find((g) => g.folder === choice.set)
  // the name the commands use: the chosen set, else the furthest along
  const gset = gnow?.folder ?? last(trained)?.folder ?? last(recorded)?.folder ?? last(gestures)?.folder ?? 'my-hands'
  const gcounts = Object.entries(gnow?.counts ?? {})
  // what it follows: the set's tracker once it is made; before, the choice for a new set
  const gtracker: Tracker = gnow ? trackerOf(gnow.tracker ?? 'hands') : choice.tracker

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
  const judgeSet = last(judgeSets)?.folder ?? `${topic}-view`
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
        { name: say('projects.gesture.tracker'), tab: 'gesture', commands: [`model get ${gtracker}`], done: h.tools.includes(gtracker) },
        { name: say('projects.gesture.set'), tab: 'gesture', commands: [joinWords(['gesture', 'new', gset, '--tracker', gtracker])], done: !!gnow },
        {
          name: say('projects.gesture.record'),
          tab: 'gesture',
          commands: [],
          done: !!gnow && recorded.includes(gnow),
          result: say('projects.gesture.check', { counts: gcounts.length ? gcounts.map(([k, n]) => `${k} ${n}`).join(' · ') : say('projects.gesture.none') }),
        },
        { name: say('projects.gesture.train'), tab: 'gesture', commands: [joinWords(['gesture', 'train', gset])], done: !!gnow?.trained },
        { name: say('projects.gesture.send'), tab: 'gesture', commands: [joinWords(['gesture', 'send', gset, '--port', '9000'])], done: !!gnow?.sent },
      ],
      gesture: {
        set: gnow?.folder ?? '',
        made: !!gnow,
        tracker: gtracker,
        example: !!gnow && h.exampleGestures.some((x) => x.folder === gset),
        exampleSets: h.exampleGestures.map((x) => ({ folder: x.folder, tracker: trackerOf(x.tracker ?? 'hands') })),
        counts: gnow?.counts ?? {},
        trained: gnow?.trained,
        sent: !!gnow?.sent,
      },
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
      voice: voiceRoute(h, voice),
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
      research: researchRoute(h, research),
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
  const choice = useGestureChoices()
  const voice = useVoiceChoices()
  const research = useResearchChoices()
  const load = useCallback(() => void readHave().then(setHave), [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path.endsWith('manifest.json') || /^research\/[^/]+\/(screen\.json|reading-list\.md)$/.test(e.path) || e.path.startsWith('chat/') || e.path.startsWith('modelfiles/') || e.path.startsWith('uploads/') || /^data\/[^/]+\/check-/.test(e.path) || e.kind === 'addDir' || e.kind === 'unlinkDir') && load(), [load]),
  )
  return have && projects(have, choice, voice, research)
}

/** The steps a project follows in project mode: its route, where its decisions draw one; else its card's steps. */
export const routeOf = (p: Project): Step[] => p.voice?.steps ?? p.research?.steps ?? p.steps

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
                  {SCHEMATICS.has(p.id) && (
                    <button type="button" className="act-button project__mode" onClick={() => {
                      const route = routeOf(p)
                      const n = route.findIndex((s) => !s.done) + 1 || route.length
                      startGuide(p.id, n, route[n - 1].tab, true)
                    }}>
                      {say('projects.mode.start')}
                    </button>
                  )}
                </header>
                {SCHEMATICS.has(p.id) && <p className="label label--muted">{say('projects.mode.about')}</p>}
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
                            href={guideHref(p.id, i + 1, s.tab, p.id === 'gesture')}
                            className="text-link project-step__tab"
                            onClick={(e) => {
                              e.preventDefault()
                              // the voice card's own steps are its two ways; in project mode its route comes from its decisions
                              startGuide(p.id, i + 1, s.tab, p.id === 'gesture')
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
