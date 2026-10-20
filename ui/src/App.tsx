import { useEffect, useState, type ReactNode } from 'react'
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
import Terminal from './components/Terminal'
import ThemeToggle from './components/ThemeToggle'
import StatusLine from './components/StatusLine'
import { Explained } from './explain/Explained'
import type { ExplainId } from './explain/text'
import { AdaptersMark, ChatMark, DataMark, MergeMark, ModelfileMark, ModelsMark, PreferMark, ShareMark, StartMark, TrainMark } from './icons'

/**
 * The tabs, in the order you'd use them, grouped: the map; what to start from;
 * what to show it; the three ways to change it (imitate, prefer, blend); then
 * making it a model, comparing, sharing. The Start panel tells the same story.
 */
const GROUPS = [['start'], ['models', 'modelfile'], ['data'], ['train', 'prefer', 'merge'], ['adapters', 'chat', 'share']] as const
const PANELS = GROUPS.flat()
type Panel = (typeof GROUPS)[number][number]
const MARKS: Record<Panel, ReactNode> = {
  start: <StartMark size={0.9} />,
  models: <ModelsMark size={0.9} />,
  modelfile: <ModelfileMark size={0.9} />,
  data: <DataMark size={0.9} />,
  train: <TrainMark size={0.9} />,
  prefer: <PreferMark size={0.9} />,
  share: <ShareMark size={0.9} />,
  adapters: <AdaptersMark size={0.9} />,
  merge: <MergeMark size={0.9} />,
  chat: <ChatMark size={0.9} />,
}

/**
 * The path through the tabs, numbered: look at models, change one with words, gather
 * examples, then one of the three ways (they share a number: pick one), then what they
 * made. Start, Chat and Share are used at any point, so they have none.
 */
const STEP: Partial<Record<Panel, number>> = { models: 1, modelfile: 2, data: 3, train: 4, prefer: 4, merge: 4, adapters: 5 }

/** The panel lives in the hash so a reload stays put (it's navigation, not saved state). */
function panelFromHash(): Panel {
  const h = location.hash.slice(1)
  return (PANELS as readonly string[]).includes(h) ? (h as Panel) : 'start'
}

/**
 * The shell: a top line (name, panels, status, theme), the active panel, and
 * the terminal docked underneath, always visible. Panels stay mounted when
 * hidden so a chat or a half-edited Modelfile survives switching.
 */
export default function App() {
  const { theme, toggle } = useTheme()
  const [panel, setPanel] = useState<Panel>(panelFromHash)
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
  const [trainData, setTrainData] = useState<{ data: string; n: number }>()
  const [preferData, setPreferData] = useState<{ data: string; n: number }>()
  /** Data → "use it": open Train or Prefer with that dataset chosen. */
  const sendDataset = (data: string, way: 'train' | 'prefer') => {
    ;(way === 'train' ? setTrainData : setPreferData)((r) => ({ data, n: (r?.n ?? 0) + 1 }))
    go(way)
  }
  const editModelfile = (model: string) => {
    setModelfileFrom((r) => ({ model, n: (r?.n ?? 0) + 1 }))
    go('modelfile')
  }

  return (
    <div className="shell">
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
                    {p}
                  </a>
                </Explained>
              ))}
            </span>
          ))}
        </nav>
        <StatusLine />
        <ThemeToggle mode={theme.mode} onToggle={toggle} />
      </header>
      <main className="shell__main">
        <div className="panel-slot" hidden={panel !== 'start'}>
          <StartPanel />
        </div>
        <div className="panel-slot" hidden={panel !== 'models'}>
          <ModelsPanel onChat={chatWith} onModelfile={editModelfile} />
        </div>
        <div className="panel-slot" hidden={panel !== 'modelfile'}>
          <ModelfilePanel startFrom={modelfileFrom} onChatPair={chatPair} />
        </div>
        <div className="panel-slot" hidden={panel !== 'data'}>
          <DataPanel onUse={sendDataset} />
        </div>
        <div className="panel-slot" hidden={panel !== 'train'}>
          <TrainPanel onAdapters={() => go('adapters')} onChatPair={chatPair} withData={trainData} />
        </div>
        <div className="panel-slot" hidden={panel !== 'prefer'}>
          <PreferPanel onAdapters={() => go('adapters')} onChatPair={chatPair} withData={preferData} />
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
      </main>
      <Terminal theme={theme} />
    </div>
  )
}
