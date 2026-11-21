import { useRef, useState } from 'react'
import { joinWords } from '@shared/quote'
import Manifest from './Manifest'
import CommandPreview from './CommandPreview'
import { say } from '../text/say'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const asName = (file: string) =>
  file
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'my-writing'

/**
 * Your own writing, or a PDF, as raw material: uploaded into workspace/uploads,
 * then `data raw file` reads it (a PDF page by page) into workspace/raw/<name>.
 * It is marked private: your writing, or someone else's PDF, stays on this
 * computer (zip never shares raw texts).
 */
export default function RawFileCard({ onRun, busy }: { onRun: (line: string) => void; busy: boolean }) {
  const [file, setFile] = useState('')
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [license, setLicense] = useState(say('data.rawFile.mine'))
  const picker = useRef<HTMLInputElement>(null)

  const upload = async (f: File) => {
    const safe = f.name.replace(/[^\w.-]+/g, '-')
    if (!/\.(txt|md|pdf)$/i.test(safe)) return setNote(say('data.rawFile.kinds'))
    setNote(say('data.rawFile.uploading', { file: safe }))
    const res = await fetch(`/api/workspace/upload?name=${encodeURIComponent(safe)}`, { method: 'POST', body: f })
    const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string }
    if (res.status === 409) {
      setFile(`uploads/${safe}`)
      setNote(say('data.rawFile.already', { file: safe }))
    } else if (res.ok && body.path) {
      setFile(body.path)
      setNote(say('data.rawFile.uploaded', { path: body.path }))
    } else return setNote(body.error ?? say('data.rawFile.failed'))
    setName((n) => n || asName(safe))
  }

  const line = joinWords(['data', 'raw', 'file', file || 'uploads/<file>', name || '<name>', '--license', license.trim() || '<terms>'])
  const ok = !!file && NAME.test(name) && !!license.trim()
  return (
    <Manifest name={say('data.rawFile.card')} lines={[say('data.rawFile.what'), say('data.rawFile.private')]}>
      <div className="inline-fields">
        <button type="button" className="text-button" onClick={() => picker.current?.click()}>
          {say('data.rawFile.choose')}
        </button>
        <input ref={picker} type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
        {note && <span className="label label--muted">{note}</span>}
      </div>
      <div className="inline-fields">
        <label className="field">
          <span className="label label--muted">{say('data.rawFile.as')}</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} placeholder="my-writing" />
        </label>
        <label className="field">
          <span className="label label--muted">{say('data.rawFile.terms')}</span>
          <input type="text" value={license} onChange={(e) => setLicense(e.target.value)} />
        </label>
      </div>
      <CommandPreview command={line} onRun={() => onRun(line)} disabled={!ok} running={busy} label={say('data.rawFile.run')} />
    </Manifest>
  )
}
