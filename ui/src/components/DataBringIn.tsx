import { useRef, useState } from 'react'
import { joinWords } from '@shared/quote'
import Manifest from './Manifest'
import CommandPreview from './CommandPreview'
import { Explained } from '../explain/Explained'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const REPO = /^[\w.-]+\/[\w.-]+$/

/** A dataset name from anything: lowercase, safe characters, no leading dash. */
const asName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z]+$/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|-+$/g, '')
    .slice(0, 64)

interface Props {
  busy: boolean
  /** run a command; then open the dataset it made */
  onRun: (line: string, name: string) => void
}

/**
 * Any dataset on Hugging Face, by the name on its page. The helper asks the
 * dataset viewer for its rows, works out which columns are the question and
 * the answer, and records the license the card declares.
 */
export function HfCard({ busy, onRun }: Props) {
  const [repo, setRepo] = useState('')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [limit, setLimit] = useState(300)
  // People paste the whole address; keep just owner/name.
  const id = repo
    .trim()
    .replace(/^https?:\/\/(www\.)?huggingface\.co\/datasets\//, '')
    .split(/[?#]/)[0]
    .split('/')
    .slice(0, 2)
    .join('/')
  const as = touched ? name : asName(id.split('/')[1] ?? '')
  const line = joinWords(['data', 'import', 'hf', id, as, '--limit', String(limit)])
  return (
    <Manifest name="from hugging face" lines={['the name as it appears on the dataset page, e.g. databricks/databricks-dolly-15k', 'the license is read from the dataset card when it runs']}>
      <div className="inline-fields">
        <label className="field">
          <span className="label label--muted">dataset on hugging face</span>
          <input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} spellCheck={false} placeholder="owner/name or its address" />
        </label>
        <label className="field">
          <span className="label label--muted">as</span>
          <input type="text" value={as} onChange={(e) => (setTouched(true), setName(e.target.value.toLowerCase()))} spellCheck={false} />
        </label>
        <label className="field field--narrow">
          <span className="label label--muted">rows</span>
          <input type="text" inputMode="numeric" value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(5000, Number(e.target.value.replace(/\D/g, '')) || 1)))} />
        </label>
      </div>
      <Explained id="data.hf">
        <CommandPreview command={line} onRun={() => onRun(line, as)} disabled={!REPO.test(id) || !NAME.test(as) || as === 'new'} running={busy} label="bring it in" />
      </Explained>
    </Manifest>
  )
}

/**
 * A file from this computer: uploaded into workspace/uploads (announced in
 * the terminal), then made into a dataset by `data import file`, which reads
 * its columns the same way and records the license the student states.
 */
export function UploadCard({ busy, onRun }: Props) {
  const [file, setFile] = useState('')
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [license, setLicense] = useState('')
  const picker = useRef<HTMLInputElement>(null)

  const upload = async (f: File) => {
    const safe = f.name.replace(/[^\w.-]+/g, '-')
    if (!/\.(csv|jsonl|json)$/i.test(safe)) return setNote('a .csv, .jsonl or .json file, please')
    setNote(`uploading ${safe}…`)
    const res = await fetch(`/api/workspace/upload?name=${encodeURIComponent(safe)}`, { method: 'POST', body: f })
    const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string }
    if (res.status === 409) {
      // Already uploaded earlier: use that copy.
      setFile(`uploads/${safe}`)
      setNote(`${safe} was already uploaded; using that copy`)
    } else if (res.ok && body.path) {
      setFile(body.path)
      setNote(`uploaded to workspace/${body.path}`)
    } else return setNote(body.error ?? 'upload failed')
    setName((n) => n || asName(safe))
  }

  const line = joinWords(['data', 'import', 'file', file || 'uploads/<file>', name, '--license', license.trim() || '<license>'])
  return (
    <Manifest name="your own file" lines={['.csv with a question column and an answer column, or .jsonl / .json', 'it goes into workspace/uploads, then becomes a dataset']}>
      <div className="inline-fields">
        <Explained id="data.upload">
          <button type="button" className="text-button" onClick={() => picker.current?.click()}>
            choose a file…
          </button>
        </Explained>
        <input ref={picker} type="file" accept=".csv,.jsonl,.json,text/csv,application/json" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        {note && <span className="label label--muted">{note}</span>}
      </div>
      <div className="inline-fields">
        <label className="field">
          <span className="label label--muted">as</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} placeholder="my-set" />
        </label>
        <label className="field">
          <span className="label label--muted">license it came with</span>
          <input type="text" value={license} onChange={(e) => setLicense(e.target.value)} placeholder='e.g. CC BY 4.0, or "mine"' />
        </label>
      </div>
      <CommandPreview command={line} onRun={() => onRun(line, name)} disabled={!file || !NAME.test(name) || name === 'new' || !license.trim()} running={busy} label="make it a dataset" />
    </Manifest>
  )
}
