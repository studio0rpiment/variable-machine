import { useEffect, useState } from 'react'
import { readManifests } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { DATA_SOURCES, OASST1, SMOLTALK } from '@shared/library'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import { Explained } from '../explain/Explained'

type Source = 'dolly' | 'oasst1' | 'smoltalk' | 'example'

const ABOUT: Record<Source, { title: string; license: string; about: string }> = {
  dolly: { title: DATA_SOURCES.dolly.repo, license: DATA_SOURCES.dolly.license, about: DATA_SOURCES.dolly.about },
  oasst1: { title: OASST1.repo, license: OASST1.license, about: OASST1.about },
  smoltalk: { title: SMOLTALK.repo, license: SMOLTALK.license, about: SMOLTALK.about },
  example: { title: 'workspace/examples', license: 'see each', about: 'small datasets that come with the app; each carries its own license' },
}

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

/** One card for every importer (plan §8): pick a source, see its license, run the command. */
export default function ImportCard({ onRun, busy }: { onRun: (line: string, name: string) => void; busy: boolean }) {
  const [source, setSource] = useState<Source>('dolly')
  const [name, setName] = useState('dolly-300')
  const [touched, setTouched] = useState(false)
  const [limit, setLimit] = useState(300)
  const [category, setCategory] = useState('')
  const [subset, setSubset] = useState(SMOLTALK.subsets[0])
  const [examples, setExamples] = useState<string[]>([])
  const [exampleInfo, setExampleInfo] = useState<Record<string, { license: string; about?: string }>>({})
  const [example, setExample] = useState('')

  useEffect(() => {
    void readManifests<{ name: string; license: string; about?: string }>('examples/data').then((ms) => {
      setExamples(ms.map((m) => m.name).sort())
      setExampleInfo(Object.fromEntries(ms.map((m) => [m.name, m])))
      setExample((cur) => cur || ms[0]?.name || '')
    })
  }, [])
  useEffect(() => {
    if (touched) return
    setName(source === 'example' ? example || 'example' : source === 'smoltalk' ? `${subset.replace('smol-', '')}-${limit}` : `${source}-${limit}`)
  }, [source, limit, subset, example, touched])

  const line =
    source === 'example'
      ? joinWords(['data', 'import', 'example', example, name])
      : joinWords(['data', 'import', source, name, '--limit', String(limit), ...(source === 'dolly' && category ? ['--category', category] : []), ...(source === 'smoltalk' ? ['--subset', subset] : [])])
  // An example says what it is and carries its own license; the other sources are described here.
  const ex = source === 'example' ? exampleInfo[example] : undefined
  const a = ex ? { ...ABOUT.example, license: ex.license, about: ex.about ?? ABOUT.example.about } : ABOUT[source]

  return (
    <Manifest name={a.title} badges={<Badge>{a.license}</Badge>} lines={[a.about, source === 'example' ? '' : 'the license is read from Hugging Face when it runs']}>
      <div className="choice" role="radiogroup" aria-label="source">
        <span className="label label--muted">source</span>
        {(Object.keys(ABOUT) as Source[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={s === source} className={`text-button ${s === source ? 'is-active' : ''}`.trim()} onClick={() => setSource(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="inline-fields">
        <label className="field">
          <span className="label label--muted">as</span>
          <input type="text" value={name} onChange={(e) => (setTouched(true), setName(e.target.value.toLowerCase()))} spellCheck={false} />
        </label>
        {source !== 'example' && (
          <label className="field field--narrow">
            <span className="label label--muted">rows</span>
            <input type="text" inputMode="numeric" value={limit} onChange={(e) => setLimit(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))} />
          </label>
        )}
        {source === 'dolly' && (
          <label className="field">
            <span className="label label--muted">category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">all</option>
              {DATA_SOURCES.dolly.categories?.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        {source === 'smoltalk' && (
          <label className="field">
            <span className="label label--muted">subset (the Apache 2.0 ones)</span>
            <select value={subset} onChange={(e) => setSubset(e.target.value)}>
              {SMOLTALK.subsets.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {source === 'example' && (
          <label className="field">
            <span className="label label--muted">example</span>
            <select value={example} onChange={(e) => setExample(e.target.value)}>
              {examples.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Explained id="data.import">
        <CommandPreview command={line} onRun={() => onRun(line, name)} disabled={!NAME.test(name) || (source === 'example' && !example)} running={busy} label="import" />
      </Explained>
    </Manifest>
  )
}
