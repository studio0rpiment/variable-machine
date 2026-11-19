import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import RollYourOwn, { PARTS, type Part } from './components/RollYourOwn'
import { NODES } from './components/FlowMap'
import AboutPanel from './components/AboutPanel'
import ProjectsPanel, { type Fill, type Step } from './components/ProjectsPanel'
import GuideBar from './components/GuideBar'
import ProjectMode, { ProjectSim } from './components/ProjectMode'
import VoiceMode, { VoiceDecisions, VoiceStep, ZoomToggle } from './components/VoiceMode'
import ResearchMode, { ResearchDecisions } from './components/ResearchMode'
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
import { AdaptersMark, ChatMark, DataMark, MergeMark, ModelfileMark, ModelsMark, PreferMark, ShareMark, StartMark, TrainMark, AboutMark, ProjectsMark, LookMark, VoiceMark, MoveMark } from './icons'

/**
 * Two modes. Projects: the cards, each a project to follow (a card with a
 * schematic opens in project mode). Roll Your Own: every tab on one long page,
 * in the Start map's order, with the Start map as the way round it. About is
 * the long form, in words. The mode lives in the hash; so does the part of
 * Roll Your Own to go to (#data), so old links to a tab still land.
 */
type View = 'projects' | 'roll' | 'about'
/** A part's mark, beside its name on the page. */
const MARKS: Record<Part, ReactNode> = {
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

/** A part's name, where it isn't just its id: named for what it does, as the field names it. */
const LABEL: Partial<Record<Part, string>> = { segmentation: 'image segmentation' }

/** Tabs that were renamed, so old links still land: look, voice and move became segmentation, speech and gesture. */
const RENAMED: Record<string, Part> = { look: 'segmentation', voice: 'speech', move: 'gesture' }

/** The hash, as a mode and a part: #projects, #about, or a part of Roll Your Own (#roll, #start and anything else: its top). */
function fromHash(): { view: View; part: Part | null } {
  const h = location.hash.slice(1)
  if (h === 'projects' || h === 'about') return { view: h, part: null }
  const part = RENAMED[h] ?? ((PARTS as readonly string[]).includes(h) ? (h as Part) : null)
  return { view: 'roll', part }
}

/**
 * The shell: a top line (name, panels, status, theme), the active panel, and
 * the terminal docked underneath, always visible. Panels stay mounted when
 * hidden so a chat or a half-edited Modelfile survives switching.
 */
export default function App() {
  const { theme, toggle } = useTheme()
  const [at, setAt] = useState(fromHash)
  // project mode: a card with a schematic, followed as a project; only its step's tab shows, under the schematic
  const guide = useGuide()
  const projects = useProjects()
  const followed = guide?.mode ? projects?.find((p) => p.id === guide.project) : undefined
  const modeStep = followed && (routeOf(followed)[guide!.step - 1] ?? routeOf(followed).at(-1))
  const mode = followed && modeStep ? { project: followed, step: Math.min(guide!.step, routeOf(followed).length) } : null
  const view: View = at.view
  /** Roll Your Own: the part in view (none at the top of the page, on the open map) */
  const [inView, setInView] = useState<string | null>(null)
  /** the tab the guide bar and the panels take as open: a project's step's, or else the part in view */
  const panel: string = mode ? modeStep!.tab : view === 'roll' ? (inView ?? 'roll') : view
  /** a route on one long page, under its schematic: a character's voice, the research bot */
  const longPage = !!(mode?.project.voice || mode?.project.research)
  const [folded, setFolded] = useState(true)
  /** a route on one long page (voice, the research bot): the step whose section is in view */
  const [stepInView, setStepInView] = useState(1)
  /** the folded schematic: the whole route (FULL pressed) or zoomed in on the step (ZOOM) */
  const [whole, setWhole] = useState(false)
  /** Roll Your Own's map: the whole of it over the page (FULL), or the strip (ZOOM) */
  const [wholeMap, setWholeMap] = useState(false)
  const [chatRequest, setChatRequest] = useState<{ models: (string | null)[]; n: number }>()
  const [modelfileFrom, setModelfileFrom] = useState<{ model: string; n: number }>()

  useEffect(() => {
    const onHash = () => setAt(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (p: Part) => (location.hash = p)

  // the page scrolls as one; each mode keeps its own place in it
  const mainRef = useRef<HTMLElement>(null)
  const scrolled = useRef<Record<string, number>>({})
  const shown = useRef(view)
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    // kept as it scrolls: by the time the mode has changed, the page it was on is hidden and its place gone
    const keep = () => (scrolled.current[shown.current] = main.scrollTop)
    main.addEventListener('scroll', keep, { passive: true })
    return () => main.removeEventListener('scroll', keep)
  }, [])
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main || shown.current === view) return
    shown.current = view
    main.scrollTop = scrolled.current[view] ?? 0
  }, [view])

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
    // a long page fills each step's own copy of its tab instead (StepTab)
    if (!mode || longPage || filledStep.current === key) return
    filledStep.current = key
    if (modeStep?.fill) fill(modeStep.fill)
  }, [mode, modeStep, fill, longPage])
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
          <span className="label label--muted">{say('projects.guide.step', { n: longPage ? stepInView : mode.step, of: routeOf(mode.project).length })}</span>
          <span className="project-top__fill" />
          <ThemeToggle mode={theme.mode} onToggle={toggle} />
          <button type="button" className="text-button project-top__leave" onClick={leaveMode} title={say('projects.mode.leave.about')}>
            {say('projects.mode.leave')}
          </button>
          {longPage && <ZoomToggle whole={whole} onToggle={() => setWhole(!whole)} />}
        </header>
      ) : (
      <header className="shell__top">
        <span className="label label--name">Variable Machine</span>
        <nav className="shell__nav shell__modes" aria-label={say('shared.modes')}>
          <Explained id="panel.projects">
            <a href="#projects" className={`nav-link label ${view === 'projects' ? 'is-active' : ''}`.trim()} aria-current={view === 'projects' ? 'page' : undefined} title={say('shared.mode.projects.about')}>
              <ProjectsMark size={0.9} />
              {say('shared.mode.projects')}
            </a>
          </Explained>
          <a href="#roll" className={`nav-link label ${view === 'roll' ? 'is-active' : ''}`.trim()} aria-current={view === 'roll' ? 'page' : undefined} title={say('shared.mode.roll.about')}>
            <StartMark size={0.9} />
            {say('shared.mode.roll')}
          </a>
          <a href="#about" className={`nav-link label shell__about ${view === 'about' ? 'is-active' : ''}`.trim()} aria-current={view === 'about' ? 'page' : undefined}>
            <AboutMark size={0.9} />
            {say('shared.mode.about')}
          </a>
        </nav>
        <StatusLine />
        <FlagsToggle />
        <ThemeToggle mode={theme.mode} onToggle={toggle} />
        {view === 'roll' && <ZoomToggle whole={wholeMap} onToggle={() => setWholeMap(!wholeMap)} titles={{ full: say('shared.roll.fullTitle'), zoom: say('shared.roll.zoomTitle') }} />}
      </header>
      )}
      <main ref={mainRef} className={`shell__main ${mode || view === 'roll' ? 'shell__main--project' : ''}`.trim()}>
        {mode && longPage ? (
          <>
            {mode.project.research ? (
              <>
                <ResearchMode key={mode.project.id} project={mode.project} step={mode.step} onStep={setStepInView} whole={whole} onZoom={() => setWhole(false)} />
                <ResearchDecisions project={mode.project} />
              </>
            ) : (
              <>
                <VoiceMode project={mode.project} step={mode.step} onStep={setStepInView} whole={whole} onZoom={() => setWhole(false)} />
                <VoiceDecisions project={mode.project} />
              </>
            )}
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
            {/* the step's tab, alone, under the schematic */}
            <div className="panel-slots">
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
              <div className="panel-slot" hidden={panel !== 'merge'}>
                <MergePanel onChatModels={chatModels} />
              </div>
              <div className="panel-slot" hidden={panel !== 'adapters'}>
                <AdaptersPanel onChatPair={chatPair} />
              </div>
              <div className="panel-slot panel-slot--fill" hidden={panel !== 'chat'}>
                <Chat request={chatRequest} />
              </div>
              <div className="panel-slot" hidden={panel !== 'share'}>
                <SharePanel />
              </div>
              <div className="panel-slot" hidden={panel !== 'gesture'}>
                <MovePanel active={panel === 'gesture'} only={mode.project.id === 'gesture' ? mode.step : undefined} />
                <ProjectSim project={mode.project} />
              </div>
              <div className="panel-slot" hidden={panel !== 'segmentation'}>
                <LookPanel />
              </div>
            </div>
          </>
        ) : (
          <>
            {view === 'projects' && <GuideBar panel="projects" onFill={fill} />}
            <div className="panel-slot" hidden={view !== 'projects'}>
              <ProjectsPanel />
            </div>
            <div className="panel-slot" hidden={view !== 'about'}>
              <AboutPanel />
            </div>
            {/* Roll Your Own: every tab on one long page, under the Start map, which folds into the strip at the top */}
            <div className="ryo-page" hidden={view !== 'roll'}>
              <RollYourOwn whole={wholeMap} onZoom={() => setWholeMap(false)} onFocus={setInView}>
                <GuideBar panel={panel} onFill={fill} />
              </RollYourOwn>
              <PartsProvider value={ALL_PARTS}>
                {PARTS.map((p) => {
                  const node = NODES.find((n) => n.id === p)
                  return (
                    <section key={p} className="ryo__part" data-box={p} aria-label={LABEL[p] ?? p}>
                      <h2 className="label ryo__head">
                        {node?.n && <span className="nav-step">{node.n}</span>}
                        {MARKS[p]}
                        {LABEL[p] ?? p}
                        {node && <span className="label--muted ryo__caption">{node.caption}</span>}
                      </h2>
                      {p === 'models' && <ModelsPanel onChat={chatWith} onModelfile={editModelfile} />}
                      {p === 'modelfile' && <ModelfilePanel startFrom={modelfileFrom} onChatPair={chatPair} />}
                      {p === 'data' && <DataPanel onUse={sendDataset} pick={dataPick} />}
                      {p === 'train' && <TrainPanel onAdapters={() => go('adapters')} onChatPair={chatPair} onChat={chatWith} withData={trainData} />}
                      {p === 'prefer' && <PreferPanel onAdapters={() => go('adapters')} onChatPair={chatPair} onChat={chatWith} withData={preferData} />}
                      {p === 'merge' && <MergePanel onChatModels={chatModels} />}
                      {p === 'adapters' && <AdaptersPanel onChatPair={chatPair} />}
                      {p === 'chat' && (
                        <div className="voice-page__chat">
                          <Chat request={chatRequest} />
                        </div>
                      )}
                      {p === 'share' && <SharePanel />}
                      {p === 'segmentation' && <LookPanel />}
                      {p === 'speech' && <VoicePanel active={view === 'roll' && inView === 'speech'} />}
                      {p === 'gesture' && <MovePanel active={view === 'roll' && inView === 'gesture'} />}
                    </section>
                  )
                })}
              </PartsProvider>
              {/* room after the last part, so it too can scroll up under the strip */}
              <div className="voice-page__end" />
            </div>
          </>
        )}
      </main>
      <Terminal theme={theme} folded={!!mode && folded} onFold={mode ? setFolded : undefined} />
    </div>
  )
}

let fills = 0
/**
 * A step's own copy of its tab, for a route's long page, filled with the
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
    case 'share':
      return <SharePanel />
    case 'chat':
      return (
        <div className="voice-page__chat">
          <Chat request={f?.chat ? { models: f.chat.models, n } : chatRequest} />
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
