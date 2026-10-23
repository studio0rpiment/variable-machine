import { useCallback, useState } from 'react'
import FlowMap from './FlowMap'
import { useHelperEvent } from '../hooks/useHelper'

const strip = (t: string) => t.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '')

/**
 * Start: the map, and nothing else. Every tab is a node; the wires say what
 * one passes to the next. Clicking a node opens its tab. The long form, in
 * words, is the About tab.
 */
export default function StartPanel() {
  // The map's green echo shows the terminal's latest lines, live.
  const [lines, setLines] = useState<string[]>([])
  useHelperEvent(
    'terminal.output',
    useCallback((e) => {
      const add = strip(e.text)
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.trim())
      if (add.length) setLines((ls) => [...ls, ...add].slice(-5))
    }, []),
  )
  return (
    <section className="panel start" aria-label="start">
      <FlowMap lines={lines} />
    </section>
  )
}
