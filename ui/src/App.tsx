import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from './hooks/useTheme'
import Chat from './components/Chat'
import ModelsPanel from './components/ModelsPanel'
import ModelfilePanel from './components/ModelfilePanel'
import DataPanel from './components/DataPanel'
import Terminal from './components/Terminal'
import ThemeToggle from './components/ThemeToggle'
import StatusLine from './components/StatusLine'
import { ChatMark, DataMark, ModelfileMark, ModelsMark } from './icons'

const PANELS = ['models', 'modelfile', 'data', 'chat'] as const
type Panel = (typeof PANELS)[number]
const MARKS: Record<Panel, ReactNode> = {
  models: <ModelsMark size={0.9} />,
  modelfile: <ModelfileMark size={0.9} />,
  data: <DataMark size={0.9} />,
  chat: <ChatMark size={0.9} />,
}

/** The panel lives in the hash so a reload stays put (it's navigation, not saved state). */
function panelFromHash(): Panel {
  const h = location.hash.slice(1)
  return (PANELS as readonly string[]).includes(h) ? (h as Panel) : 'chat'
}

/**
 * The shell: a top line (name, panels, status, theme), the active panel, and
 * the terminal docked underneath, always visible. Panels stay mounted when
 * hidden so a chat or a half-edited Modelfile survives switching.
 */
export default function App() {
  const { theme, toggle } = useTheme()
  const [panel, setPanel] = useState<Panel>(panelFromHash)
  const [chatRequest, setChatRequest] = useState<{ model: string; n: number }>()
  const [modelfileFrom, setModelfileFrom] = useState<{ model: string; n: number }>()

  useEffect(() => {
    const onHash = () => setPanel(panelFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (p: Panel) => (location.hash = p)

  const chatWith = (model: string) => {
    setChatRequest((r) => ({ model, n: (r?.n ?? 0) + 1 }))
    go('chat')
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
          {PANELS.map((p) => (
            <a key={p} href={`#${p}`} className={`nav-link label ${p === panel ? 'is-active' : ''}`.trim()} aria-current={p === panel ? 'page' : undefined}>
              {MARKS[p]}
              {p}
            </a>
          ))}
        </nav>
        <StatusLine />
        <ThemeToggle mode={theme.mode} onToggle={toggle} />
      </header>
      <main className="shell__main">
        <div className="panel-slot" hidden={panel !== 'models'}>
          <ModelsPanel onChat={chatWith} onModelfile={editModelfile} />
        </div>
        <div className="panel-slot" hidden={panel !== 'modelfile'}>
          <ModelfilePanel startFrom={modelfileFrom} onChat={chatWith} />
        </div>
        <div className="panel-slot" hidden={panel !== 'data'}>
          <DataPanel />
        </div>
        <div className="panel-slot panel-slot--fill" hidden={panel !== 'chat'}>
          <Chat request={chatRequest} />
        </div>
      </main>
      <Terminal theme={theme} />
    </div>
  )
}
