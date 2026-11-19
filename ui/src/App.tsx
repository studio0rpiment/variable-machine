import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TrainParams } from '@shared/recipes'
import { useTheme } from './hooks/useTheme'
import Chat from './components/Chat'
import ModelsPanel from './components/ModelsPanel'
import ModelfilePanel from './components/ModelfilePanel'
import DataPanel from './components/DataPanel'
import TrainPanel from './components/TrainPanel'
import AdaptersPanel from './components/AdaptersPanel'
import MergePanel from './components/MergePanel'
import PreferPanel from './components/PreferPanel'
import SharePanel from './components/SharePanel'
import StartPanel from './components/StartPanel'
import AboutPanel from './components/AboutPanel'
import ProjectsPanel, { type Fill, type Step } from './components/ProjectsPanel'
import GuideBar from './components/GuideBar'
import ProjectMode, { ProjectSim } from './components/ProjectMode'
import VoiceMode, { VoiceDecisions, VoiceStep, ZoomToggle } from './components/VoiceMode'
import { leaveMode, useGuide } from './lib/guide'
import { ALL_PARTS, PartsProvider } from './lib/parts'
import { routeOf, useProjects } from './components/ProjectsPanel'
import { say } from './text/say'
import LookPanel from './components/LookPanel'
import VoicePanel from './components/VoicePanel'
import MovePanel from './components/MovePanel'
import Terminal from './components/Terminal'
import ThemeToggle from './components/ThemeToggle'
import { setPref, usePref } from './lib/viewPrefs'
import StatusLine from './components/StatusLine'
import { Explained } from './explain/Explained'
import type { ExplainId } from './explain/text'
import { AdaptersMark, ChatMark, DataMark, MergeMark, ModelfileMark, ModelsMark, PreferMark, ShareMark, StartMark, TrainMark, AboutMark, ProjectsMark, LookMark, VoiceMark, MoveMark } from './icons'

/**
 * The tabs, in the order you'd use them, grouped: the map, its words, and the
 * projects they add up to; what to start from;
 * what to show it; the three ways to change it (imitate, prefer, blend); then
 * making it a model, comparing, sharing. Then the tabs for the other kinds of
 * model: image segmentation, speech, and gesture. The Start panel tells the same story.
 */
const GROUPS = [['start', 'about', 'projects'], ['models', 'modelfile'], ['data'], ['train', 'prefer', 'merge'], ['adapters', 'chat', 'share'], ['segmentation', 'speech', 'gesture']] as const
const PANELS = GROUPS.flat()
type Panel = (typeof GROUPS)[number][number]
const MARKS: Record<Panel, ReactNode> = {
  start: <StartMark size={0.9} />,
  about: <AboutMark size={0.9} />,
  projects: <ProjectsMark size={0.9} />,
  models: <ModelsMark size={0.9} />,
  modelfile: <ModelfileMark size={0.9} />,
  data: <DataMark size={0.9} />,
  train: <TrainMark size={0.9} />,
  prefer: <PreferMark size={0.9} />,
  share: <ShareMark size={0.9} />,
  adapters: <AdaptersMark size={0.9} />,
  merge: <MergeMark size={0.9} />,
  chat: <ChatMark size={0.9} />,
  segmentation: <LookMark size={0.9} />,
  speech: <VoiceMark size={0.9} />,
  gesture: <MoveMark size={0.9} />,
}

/** A tab's name in the top bar, where it isn't just its id: named for what it does, as the field names it. */
const LABEL: Partial<Record<Panel, string>> = { segmentation: 'image segmentation' }

/** Tabs that were renamed, so old links still land: look, voice and move became segmentation, speech and gesture. */
const RENAMED: Record<string, Panel> = { look: 'segmentation', voice: 'speech', move: 'gesture' }

/**
 * The path through the tabs, numbered: look at models, change one with words, gather
 * examples, then one of the three ways (they share a number: pick one), then what they
 * made. Start, Projects, Chat and Share are used at any point, so they have none.
 */
const STEP: Partial<Record<Panel, number>> = { models: 1, modelfile: 2, data: 3, train: 4, prefer: 4, merge: 4, adapters: 5 }

/** The panel lives in the hash so a reload stays put (it's navigation, not saved state). */
function panelFromHash(): Panel {
  const h = location.hash.slice(1)
  if (RENAMED[h]) return RENAMED[h]
  return (PANELS as readonly string[]).includes(h) ? (h as Panel) : 'start'
}

/**
 * The shell: a top line (name, panels, status, theme), the active panel, and
 * the terminal docked underneath, always visible. Panels stay mounted when
 * hidden so a chat or a half-edited Modelfile survives switching.
 */
export default function App() {
  const { theme, toggle } = useTheme()
  const [tabPanel, setPanel] = useState<Panel>(panelFromHash)
  // project mode: a card with a schematic, followed as a project; only its step's tab shows, under the schematic
  const guide = useGuide()
  const projects = useProjects()
  const followed = guide?.mode ? projects?.find((p) => p.id === guide.project) : undefined
  const modeStep = followed && (routeOf(followed)[guide!.step - 1] ?? routeOf(followed).at(-1))
  const mode = followed && modeStep ? { project: followed, step: Math.min(guide!.step, routeOf(followed).length) } : null
  const panel: Panel = mode ? modeStep!.tab : tabPanel
  const [folded, setFolded] = useState(true)
  /** a voice route is one long page: the step whose section is in view */
  const [stepInView, setStepInView] = useState(1)
  /** the folded schematic: the whole route (FULL pressed) or zoomed in on the step (ZOOM) */
  const [whole, setWhole] = useState(false)
  const [chatRequest, setChatRequest] = useState<{ models: (string | null)[]; n: number }>()
  const [modelfileFrom, setModelfileFrom] = useState<{ model: string; n: number }>()

  useEffect(() => {
    const onHash = () => setPanel(panelFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (p: Panel) => (location.hash = p)

  /** Put models into Chat's columns, in order; null leaves a column as it is. */
  const chatModels = (models: (string | null)[]) => {
    setChatRequest((r) => ({ models, n: (r?.n ?? 0) + 1 }))
    go('chat')
  }
  const chatWith = (model: string) => chatModels([null, model])
  /** Two models side by side, e.g. the untouched base next to what training made of it. */
  const chatPair = (a: string, b: string) => chatModels([a, b])
  const [trainData, setTrainData] = useState<{ data: string; n: number; params?: Partial<TrainParams> }>()
  /** a dataset to open on the Data tab (or "new", with the name to make), from a project's step */
  const [dataPick, setDataPick] = useState<{ pick: string; newName?: string; n: number }>()
  /** Project mode: fill in the names a card has chosen, on the tab its step opens. */
  const fill = useCallback((f: Fill) => {
    if (f.data) setDataPick((r) => ({ ...f.data!, n: (r?.n ?? 0) + 1 }))
    if (f.train) {
      const { data, ...params } = f.train
      setTrainData((r) => ({ data, params, n: (r?.n ?? 0) + 1 }))
    }
    if (f.modelfile) setModelfileFrom((r) => ({ model: f.modelfile!.base, n: (r?.n ?? 0) + 1 }))
    if (f.prefer) setPreferData((r) => ({ ...f.prefer!, n: (r?.n ?? 0) + 1 }))
  }, [])
  // project mode: fill in the route's names on the tab, once each time a step is opened (the guide bar does it outside the mode)
  const filledStep = useRef('')
  useEffect(() => {
    // the step's names change as it runs (a set made by the first draft is then opened), so they are part of the key
    const key = mode ? `${mode.project.id}:${mode.step}:${JSON.stringify(modeStep?.fill ?? null)}` : ''
    // a voice route's page fills each step's own copy of its tab instead (StepTab)
    if (!mode || mode.project.voice || filledStep.current === key) return
    filledStep.current = key
    if (modeStep?.fill) fill(modeStep.fill)
  }, [mode, modeStep, fill])
  const [preferData, setPreferData] = useState<{ data: string; n: number; model?: string }>()
  /** Data → "use it": open Train or Prefer with that dataset chosen. */
  const sendDataset = (data: string, way: 'train' | 'prefer') => {
    ;(way === 'train' ? setTrainData : setPreferData)((r?: { n: number }) => ({ data, n: (r?.n ?? 0) + 1 }))
    go(way)
  }
  const editModelfile = (model: string) => {
    setModelfileFrom((r) => ({ model, n: (r?.n ?? 0) + 1 }))
    go('modelfile')
  }

  return (
    <div className={`shell ${mode && folded ? 'shell--folded' : ''}`.trim()}>
      {mode ? (
        <header className="shell__top project-top" aria-label={say('projects.mode.label')}>
          <span className="label label--name">Variable Machine</span>
          <span className="label project-top__name">{say('projects.mode.project', { project: mode.project.title })}</span>
          <span className="label label--muted">{say('projects.guide.step', { n: mode.project.voice ? stepInView : mode.step, of: routeOf(mode.project).length })}</span>
          <span className="project-top__fill" />
          <ThemeToggle mode={theme.mode} onToggle={toggle} />
          {mode.project.voice && <ZoomToggle whole={whole} onToggle={() => setWhole(!whole)} />}
          <button type="button" className="text-button project-top__leave" onClick={leaveMode} title={say('projects.mode.leave.about')}>
            {say('projects.mode.leave')}
          </button>
        </header>
      ) : (
      <header className="shell__top">
        <span className="label label--name">Variable Machine</span>
        <nav className="shell__nav" aria-label="panels">
          {GROUPS.map((group, g) => (
            <span
              key={g}
              className={`nav-group ${group[0] === 'train' ? 'nav-group--ways' : ''}`.trim()}
              {...(group[0] === 'train' ? { role: 'group', 'aria-label': 'three ways to change a model' } : {})}
            >
              {group.map((p) => (
                <Explained key={p} id={`panel.${p}` as ExplainId}>
                  <a href={`#${p}`} className={`nav-link label ${p === panel ? 'is-active' : ''}`.trim()} aria-current={p === panel ? 'page' : undefined}>
                    {STEP[p] && <span className="nav-step">{STEP[p]}</span>}
                    {MARKS[p]}
                    {LABEL[p] ?? p}
                  </a>
                </Explained>
              ))}
            </span>
          ))}
        </nav>
        <StatusLine />
        <FlagsToggle />
        <ThemeToggle mode={theme.mode} onToggle={toggle} />
      </header>
      )}
      <main className={`shell__main ${mode ? 'shell__main--project' : ''}`.trim()}>
        {mode?.project.voice ? (
          <>
            <VoiceMode project={mode.project} step={mode.step} onStep={setStepInView} whole={whole} />
            <VoiceDecisions project={mode.project} />
            {/* the whole route on one page: each step, then its own copy of its tab, showing only the parts the step uses */}
            {routeOf(mode.project).map((s, i) => (
              <section key={`${i}-${s.tab}`} className="voice-page__step" data-step={i + 1}>
                <VoiceStep step={s} n={i + 1} />
                <PartsProvider value={s.parts ?? ALL_PARTS}>
                  <StepTab step={s} onUse={sendDataset} chatWith={chatWith} chatPair={chatPair} chatModels={chatModels} editModelfile={editModelfile} chatRequest={chatRequest} />
                </PartsProvider>
              </section>
            ))}
            {/* room after the last step, so it too can scroll up under the strip */}
            <div className="voice-page__end" />
          </>
        ) : mode ? (
          <>
            <ProjectMode project={mode.project} step={mode.step} />
            <h2 className="label project-open">{say('projects.mode.open', { n: mode.step, name: modeStep!.name })}</h2>
          </>
        ) : (
          <GuideBar panel={panel} onFill={fill} />
        )}
        {/* the tabs, one each; a voice route's page has its own copies instead */}
        <div className="panel-slots" hidden={!!mode?.project.voice}>
        <div className="panel-slot panel-slot--fill" hidden={panel !== 'start'}>
          <StartPanel />
        </div>
        <div className="panel-slot" hidden={panel !== 'about'}>
          <AboutPanel />
        </div>
        <div className="panel-slot" hidden={panel !== 'projects'}>
          <ProjectsPanel />
        </div>
        <div className="panel-slot" hidden={panel !== 'models'}>
          <ModelsPanel onChat={chatWith} onModelfile={editModelfile} />
        </div>
        <div className="panel-slot" hidden={panel !== 'modelfile'}>
          <ModelfilePanel startFrom={modelfileFrom} onChatPair={chatPair} />
        </div>
        <div className="panel-slot" hidden={panel !== 'data'}>
          <DataPanel onUse={sendDataset} pick={dataPick} />
        </div>
        <div className="panel-slot" hidden={panel !== 'train'}>
          <TrainPanel onAdapters={() => go('adapters')} onChatPair={chatPair} onChat={chatWith} withData={trainData} />
        </div>
        <div className="panel-slot" hidden={panel !== 'prefer'}>
          <PreferPanel onAdapters={() => go('adapters')} onChatPair={chatPair} onChat={chatWith} withData={preferData} />
        </div>
        <div className="panel-slot" hidden={panel !== 'adapters'}>
          <AdaptersPanel onChatPair={chatPair} />
        </div>
        <div className="panel-slot" hidden={panel !== 'merge'}>
          <MergePanel onChatModels={chatModels} />
        </div>
        <div className="panel-slot panel-slot--fill" hidden={panel !== 'chat'}>
          <Chat request={chatRequest} />
        </div>
        <div className="panel-slot" hidden={panel !== 'share'}>
          <SharePanel />
        </div>
        <div className="panel-slot" hidden={panel !== 'gesture'}>
          <MovePanel active={panel === 'gesture'} only={mode?.project.id === 'gesture' ? mode.step : undefined} />
          {mode && <ProjectSim project={mode.project} />}
        </div>
        <div className="panel-slot" hidden={panel !== 'speech'}>
          <VoicePanel active={panel === 'speech'} />
        </div>
        <div className="panel-slot" hidden={panel !== 'segmentation'}>
          <LookPanel />
        </div>
        </div>
      </main>
      <Terminal theme={theme} folded={!!mode && folded} onFold={mode ? setFolded : undefined} />
    </div>
  )
}

let fills = 0
/**
 * A step's own copy of its tab, for a voice route's long page, filled with the
 * names the step has chosen. A new fill (a set made by the first draft, say)
 * gets a new number, so the tab takes it.
 */
function StepTab({ step, onUse, chatWith, chatPair, chatModels, editModelfile, chatRequest }: { step: Step; onUse: (data: string, way: 'train' | 'prefer') => void; chatWith: (model: string) => void; chatPair: (a: string, b: string) => void; chatModels: (models: (string | null)[]) => void; editModelfile: (model: string) => void; chatRequest?: { models: (string | null)[]; n: number } }) {
  const key = JSON.stringify(step.fill ?? null)
  const n = useMemo(() => ++fills, [key])
  const f = step.fill
  const toAdapters = () => {}
  switch (step.tab) {
    case 'data':
      return <DataPanel onUse={onUse} pick={f?.data && { ...f.data, n }} />
    case 'train': {
      const { data, ...params } = f?.train ?? { data: '' }
      return <TrainPanel onAdapters={toAdapters} onChatPair={chatPair} onChat={chatWith} withData={f?.train && { data, params, n }} />
    }
    case 'prefer':
      return <PreferPanel onAdapters={toAdapters} onChatPair={chatPair} onChat={chatWith} withData={f?.prefer && { ...f.prefer, n }} />
    case 'modelfile':
      return <ModelfilePanel startFrom={f?.modelfile && { model: f.modelfile.base, n }} onChatPair={chatPair} />
    case 'models':
      return <ModelsPanel onChat={chatWith} onModelfile={editModelfile} />
    case 'adapters':
      return <AdaptersPanel onChatPair={chatPair} />
    case 'merge':
      return <MergePanel onChatModels={chatModels} />
    case 'chat':
      return (
        <div className="voice-page__chat">
          <Chat request={chatRequest} />
        </div>
      )
    default:
      return null
  }
}

/** Turn the explanation flags off (and on again), for when you know your way around. */
function FlagsToggle() {
  const on = usePref('flags')
  return (
    <button type="button" className="text-button flags-toggle" onClick={() => setPref('flags', !on)} aria-pressed={on} aria-label={on ? 'explanation flags are on: turn them off' : 'explanation flags are off: turn them on'}>
      flags {on ? 'on' : 'off'}
    </button>
  )
}
