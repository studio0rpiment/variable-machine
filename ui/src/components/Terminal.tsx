import { useCallback, useEffect, useRef, useState } from 'react'
import { setPref, usePref } from '../lib/viewPrefs'
import { Terminal as XTerm, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { onEvent, sendEvent } from '../lib/helper'
import { useHelperEvent } from '../hooks/useHelper'
import { Prompt, Stop, TerminalMark } from '../icons'
import type { Theme } from '../themes'
import { say } from '../text/say'

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
/** The last command run, from the echo: › typed, ▸ from the page. */
const strip = (t: string) => t.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '')
const COMMAND = /^[›▸] (.+)$/

/**
 * folded: project mode. The terminal is one line, the last command run, with
 * a way to open it; it keeps every line meanwhile, so opening it shows them.
 * onFold: open it, or fold it again; given only in project mode.
 */
export default function Terminal({ theme, folded = false, onFold }: { theme: Theme; folded?: boolean; onFold?: (folded: boolean) => void }) {
  const [last, setLast] = useState('')
  // a short strip by default (15% of the window), half the window when you need to read it
  const tall = usePref('tallTerminal')
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
    t.writeln('\x1b[2mvariable machine · type help\x1b[22m')
    term.current = t
    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(el)
    const off = onEvent((e) => {
      if (e.type !== 'terminal.output') return
      t.write(e.text)
      const command = strip(e.text)
        .split('\n')
        .map((l) => COMMAND.exec(l)?.[1])
        .filter(Boolean)
        .pop()
      if (command) setLast(command)
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
    <section className={`dock ${folded ? 'dock--folded' : ''}`.trim()} aria-label="terminal">
      {!folded && <ResizeLine />}
      {folded && (
        <div className="dock__folded">
          <TerminalMark size={1} />
          <span className="dock__last">{last ? `▸ ${last}` : say('projects.mode.terminal.none')}</span>
          {busy && (
            <button type="button" className="stop-button" onClick={() => sendEvent({ type: 'terminal.stop' })} title="stop (ctrl-c)">
              <Stop size={1} />
              <span className="stop-button__word">stop</span>
            </button>
          )}
          <button type="button" className="text-button" onClick={() => onFold?.(false)}>
            {say('projects.mode.terminal.open')}
          </button>
        </div>
      )}
      <header className="panel-head" hidden={folded}>
        <TerminalMark size={1} />
        <span className="label">terminal</span>
        {onFold && (
          <button type="button" className="text-button" onClick={() => onFold(true)}>
            {say('projects.mode.terminal.fold')}
          </button>
        )}
        <button type="button" className="text-button terminal__size" onClick={() => (setPref('terminalRem', null), setPref('tallTerminal', !tall))} aria-pressed={tall}>
          {tall ? 'smaller ▾' : 'taller ▴'}
        </button>
      </header>
      <div className="terminal__screen" ref={host} hidden={folded} />
      <div className="terminal__line" hidden={folded}>
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
          <button type="button" className="stop-button" onClick={() => sendEvent({ type: 'terminal.stop' })} title="stop (ctrl-c)">
            <Stop size={1} />
            <span className="stop-button__word">stop</span>
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * The line along the terminal's top: drag it up or down to set the
 * terminal's height, kept in rem; double-click it to go back to the short
 * strip. It stops short of the header above and the terminal's own header,
 * line and command line below (--terminal-min).
 */
function ResizeLine() {
  const [dragging, setDragging] = useState(false)
  // a ref as well: pointer moves arrive before React has drawn the dragging state
  const active = useRef(false)
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize)
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    active.current = true
    setDragging(true)
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active.current) return
    const r = rem()
    const h = (window.innerHeight - e.clientY) / r
    setPref('terminalRem', Math.round(Math.min(window.innerHeight / r - 6, Math.max(7.5, h)) * 4) / 4)
  }
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    active.current = false
    setDragging(false)
  }
  return (
    <div
      className={`dock__resize${dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label="terminal height: drag to change, double-click to reset"
      title="drag to make the terminal taller or shorter · double-click: back to the short strip"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => (setPref('terminalRem', null), setPref('tallTerminal', false))}
    />
  )
}
