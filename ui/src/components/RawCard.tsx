import { useState } from 'react'
import { joinWords } from '@shared/quote'
import { RAW_SOURCES } from '@shared/library'
import Manifest from './Manifest'
import CommandPreview from './CommandPreview'

type Kind = keyof typeof RAW_SOURCES
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

/**
 * Raw material (plan §8): a book or a table, cut into passages the generator
 * can write training rows from. CSV and TXT need the license their source
 * states; it is written into the manifest and follows every row made from it.
 */
export default function RawCard({ onRun, busy }: { onRun: (line: string) => void; busy: boolean }) {
  const [kind, setKind] = useState<Kind>('gutenberg')
  const [what, setWhat] = useState('11')
  const [name, setName] = useState('alice')
  const [license, setLicense] = useState('')
  const line = joinWords(['data', 'raw', kind, what, name, ...(kind !== 'gutenberg' && license ? ['--license', license] : [])])
  const ok = NAME.test(name) && !!what && (kind === 'gutenberg' ? /^\d+$/.test(what) : /^https?:\/\//.test(what) && !!license.trim())
  return (
    <Manifest name="raw material" lines={[RAW_SOURCES[kind].about, 'lands in workspace/raw as passages for the generator']}>
      <div className="choice" role="radiogroup" aria-label="raw source">
        <span className="label label--muted">from</span>
        {(Object.keys(RAW_SOURCES) as Kind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === kind} className={`text-button ${k === kind ? 'is-active' : ''}`.trim()} onClick={() => (setKind(k), setWhat(k === 'gutenberg' ? '11' : ''))}>
            {k}
          </button>
        ))}
      </div>
      <div className="inline-fields">
        <label className="field">
          <span className="label label--muted">{kind === 'gutenberg' ? 'book number' : 'url'}</span>
          <input type="text" value={what} onChange={(e) => setWhat(e.target.value.trim())} spellCheck={false} placeholder={kind === 'gutenberg' ? '11' : 'https://…'} />
        </label>
        <label className="field">
          <span className="label label--muted">as</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} />
        </label>
      </div>
      {kind !== 'gutenberg' && (
        <label className="field">
          <span className="label label--muted">license the source states</span>
          <input type="text" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="e.g. CC BY 4.0" />
        </label>
      )}
      <CommandPreview command={line} onRun={() => onRun(line)} disabled={!ok} running={busy} label="fetch" />
    </Manifest>
  )
}
