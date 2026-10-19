import { useCallback, useEffect, useRef, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { listDir, readManifests, type Entry } from '../lib/workspace'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'

const KINDS = ['data', 'adapters', 'merges', 'runs', 'fused'] as const
type Kind = (typeof KINDS)[number]

interface Artifact {
  kind: Kind
  name: string
  license?: string
  created?: string
}

const mb = (n: number) => (n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : n >= 2 ** 20 ? `${Math.round(n / 2 ** 20)} MB` : `${Math.max(1, Math.round(n / 2 ** 10))} KB`)

/**
 * Share (plan §3, §12.7): an artifact is its folder, so sharing is zipping it.
 * Zips land in workspace/shared to download; a zip someone sends you is
 * uploaded there and `unzip` puts it back where its manifest says it goes.
 */
export default function SharePanel() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [zips, setZips] = useState<Entry[]>([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const found = await Promise.all(KINDS.map(async (kind) => (await readManifests<Artifact>(kind)).map((m) => ({ ...m, kind, name: m.folder }))))
    setArtifacts(found.flat())
    setZips((await listDir('shared')).filter((e) => e.name.endsWith('.zip')))
  }, [])
  useEffect(() => void load(), [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path.startsWith('shared/') || e.path.endsWith('manifest.json')) && void load(), [load]),
  )

  const run = async (key: string, line: string) => {
    setBusy(key)
    await runCommand(line)
    setBusy('')
  }

  const upload = async (f: File) => {
    setNote('')
    const name = f.name.replace(/[^\w.-]/g, '_')
    const res = await fetch(`/api/workspace/upload?name=${encodeURIComponent(name)}`, { method: 'POST', body: f })
    const body = (await res.json()) as { error?: string }
    setNote(res.ok ? `uploaded ${name}; unzip it below` : (body.error ?? 'upload failed'))
  }

  return (
    <section className="panel" aria-label="share">
      <h2 className="panel__title label">zips · workspace/shared</h2>
      <div className="share-upload">
        <button type="button" className="text-button" onClick={() => file.current?.click()}>
          add a zip someone sent you
        </button>
        <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        {note && <span className="label label--muted">{note}</span>}
      </div>
      <div className="cards">
        {zips.map((z) => (
          <Manifest
            key={z.name}
            name={z.name}
            lines={[mb(z.size), new Date(z.modified).toLocaleString()]}
            actions={
              <>
                <a className="text-button" href={`/api/workspace/file?path=${encodeURIComponent(`shared/${z.name}`)}&download=1`} download>
                  download
                </a>
                <CommandPreview command={`unzip ${z.name}`} onRun={() => void run(`unzip ${z.name}`, `unzip ${z.name}`)} running={busy === `unzip ${z.name}`} label="unzip" />
              </>
            }
          />
        ))}
        {zips.length === 0 && <p className="label label--muted">no zips yet</p>}
      </div>

      <h2 className="panel__title label">artifacts · what can be shared</h2>
      <div className="cards">
        {artifacts.map((a) => {
          const cmd = `zip ${a.kind}/${a.name}`
          return (
            <Manifest
              key={`${a.kind}/${a.name}`}
              name={a.name}
              badges={<Badge>{a.kind}</Badge>}
              lines={[a.license ?? '', a.kind === 'fused' ? 'a whole model: large; the adapter rebuilds it' : '']}
              actions={<CommandPreview command={cmd} onRun={() => void run(cmd, cmd)} running={busy === cmd} label="zip" />}
            />
          )
        })}
      </div>
    </section>
  )
}
