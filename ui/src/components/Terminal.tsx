import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal as XTerm, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { onEvent, sendEvent } from '../lib/helper'
import { useHelperEvent } from '../hooks/useHelper'
import { Prompt, Stop, TerminalMark } from '../icons'
import type { Theme } from '../themes'

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

/** xterm takes concrete colours, not CSS variables, so the theme is rebuilt from the two theme colours. */
function xtermTheme(t: Theme): ITheme {
  return {
    background: t.bg,
    foreground: t.line,
    cursor: t.line,
    cursorAccent: t.bg,
    selectionBackground: `${t.line}4d`, // line at 30%
  }
}

/**
 * The docked terminal (plan §7). xterm shows the event stream; the line
 * underneath is where commands are typed. Input is a plain field rather than
 * xterm's own keystrokes because there is no pty behind it: the helper takes
 * whole lines.
 */
export default function Terminal({ theme }: { theme: Theme }) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<XTerm | null>(null)
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const history = useRef<string[]>([])
  const cursor = useRef(0)

  useEffect(() => {
    const el = host.current!
    const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.8
    const t = new XTerm({
      fontFamily: FONT,
      fontSize,
      lineHeight: 1.25,
      disableStdin: true,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      scrollback: 5000,
      theme: xtermTheme(theme),
      convertEol: false,
    })
    const fit = new FitAddon()
    t.loadAddon(fit)
    t.open(el)
    t.write('\x1b[?25l') // no cursor: input happens in the line below
    t.writeln('\x1b[2mretension · type help\x1b[22m')
    term.current = t
    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(el)
    const off = onEvent((e) => {
      if (e.type === 'terminal.output') t.write(e.text)
    })
    return () => {
      off()
      ro.disconnect()
      t.dispose()
      term.current = null
    }
    // theme is applied by the effect below; the terminal is created once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (term.current) term.current.options.theme = xtermTheme(theme)
  }, [theme])

  useHelperEvent(
    'terminal.busy',
    useCallback((e) => setBusy(e.busy), []),
  )

  const submit = () => {
    const l = line.trim()
    if (!l) return
    if (history.current.at(-1) !== l) history.current.push(l)
    cursor.current = history.current.length
    sendEvent({ type: 'terminal.input', line: l })
    setLine('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const h = history.current
    if (e.key === 'Enter') submit()
    else if (e.key === 'ArrowUp' && cursor.current > 0) {
      e.preventDefault()
      setLine(h[--cursor.current])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      cursor.current = Math.min(h.length, cursor.current + 1)
      setLine(h[cursor.current] ?? '')
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      if (busy) sendEvent({ type: 'terminal.stop' })
      else setLine('')
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      term.current?.clear()
    }
  }

  return (
    <section className="dock" aria-label="terminal">
      <header className="panel-head">
        <TerminalMark size={1} />
        <span className="label">terminal</span>
      </header>
      <div className="terminal__screen" ref={host} />
      <div className="terminal__line">
        <Prompt size={0.9} className="terminal__glyph" />
        <input
          type="text"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          placeholder="ls workspace · ollama list · help"
          aria-label="command"
        />
        {busy && (
          <button type="button" className="icon-button" onClick={() => sendEvent({ type: 'terminal.stop' })} title="stop (ctrl-c)" aria-label="stop">
            <Stop size={1} />
          </button>
        )}
      </div>
    </section>
  )
}
