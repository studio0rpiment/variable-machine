import { useCallback, useEffect, useRef, useState } from 'react'
import { TOOL_MODELS, IMAGE_EXT, type LookTask } from '@shared/kinds'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { listDir, readManifests } from '../lib/workspace'
import { onLook, type LookState } from '../look/runner'
import ToolCard, { KindLine } from './ToolCard'
import CommandPreview from './CommandPreview'
import { Explained } from '../explain/Explained'

interface ImageSet {
  folder: string
  license?: string
  inputs?: string[]
}

const fileUrl = (rel: string, v = 0) => `/api/workspace/file?path=${encodeURIComponent(rel)}${v ? `&v=${v}` : ''}`
const SET = /^[a-z0-9][a-z0-9._-]{0,63}$/
const base = (file: string) => file.replace(/\.[^.]+$/, '')
const outputOf = (set: string, file: string, task: LookTask) => `outputs/${set}-${task}/${base(file)}.png`

/**
 * Look: the ready-made image tools (kind "looks"). Bring photos into an image
 * set (upload or the camera), pick one, and cut it out, map its depth or click
 * to select something. Each action is a `look …` command: the helper hands it
 * back to this page, which runs the model and saves the picture into
 * workspace/outputs/ with a record of what it was made from.
 */
export default function LookPanel() {
  const [here, setHere] = useState<Record<string, boolean>>({})
  const [sets, setSets] = useState<ImageSet[]>([])
  const [set, setSet] = useState('')
  const [newSet, setNewSet] = useState('')
  const [license, setLicense] = useState('your own work')
  const [photos, setPhotos] = useState<string[]>([])
  const [photo, setPhoto] = useState('')
  const [made, setMade] = useState<Record<string, number>>({}) // output path → version, so a re-run shows fresh
  const [points, setPoints] = useState<[number, number, 0 | 1][]>([])
  const [busy, setBusy] = useState('')
  const [live, setLive] = useState<LookState | null>(null)
  const [note, setNote] = useState('')
  const [camera, setCamera] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const loadTools = useCallback(async () => {
    const m = await readManifests<{ name: string }>('tools')
    setHere(Object.fromEntries(TOOL_MODELS.map((t) => [t.name, m.some((x) => x.folder === t.name)])))
  }, [])
  const loadSets = useCallback(async () => {
    const m = await readManifests<ImageSet>('images')
    setSets(m)
    setSet((s) => s || m[0]?.folder || '')
  }, [])
  const loadPhotos = useCallback(async () => {
    if (!set) return setPhotos([])
    const files = (await listDir(`images/${set}`)).filter((e) => !e.dir && IMAGE_EXT.test(e.name)).map((e) => e.name)
    setPhotos(files)
    setPhoto((p) => (files.includes(p) ? p : (files[0] ?? '')))
    const outs: Record<string, number> = {}
    for (const task of ['cutout', 'depth', 'select'] as LookTask[]) {
      for (const e of await listDir(`outputs/${set}-${task}`)) outs[`outputs/${set}-${task}/${e.name}`] = new Date(e.modified).getTime()
    }
    setMade(outs)
  }, [set])

  useEffect(() => void loadTools(), [loadTools])
  useEffect(() => void loadSets(), [loadSets])
  useEffect(() => void loadPhotos(), [loadPhotos])
  useEffect(() => setPoints([]), [photo])
  useHelperEvent(
    'workspace.changed',
    useCallback(
      (e) => {
        if (e.path.startsWith('tools/')) void loadTools()
        if (e.path.startsWith('images/') && e.path.endsWith('manifest.json')) void loadSets()
        if (e.path.startsWith('images/') || e.path.startsWith('outputs/')) void loadPhotos()
      },
      [loadTools, loadSets, loadPhotos],
    ),
  )
  useEffect(() => onLook(setLive), [])

  const run = async (key: string, line: string) => {
    setBusy(key)
    await runCommand(line)
    setBusy('')
  }

  const upload = async (blob: Blob, name: string) => {
    const target = set || newSet
    if (!SET.test(target)) return setNote('name the set first: lowercase letters, digits, . _ -')
    const clean = name.replace(/[^\w.-]/g, '_')
    const res = await fetch(`/api/workspace/upload?name=${encodeURIComponent(clean)}&set=${encodeURIComponent(target)}&license=${encodeURIComponent(license)}`, { method: 'POST', body: blob })
    const body = (await res.json()) as { error?: string }
    if (!res.ok) return setNote(body.error ?? 'upload failed')
    setNote('')
    if (!set) setSet(target)
    setPhoto(clean)
  }

  const rel = set && photo ? `images/${set}/${photo}` : ''
  const pointArgs = points.map(([x, y, l]) => `${l ? '--point' : '--not'} ${x},${y}`).join(' ')
  const cmd = (task: LookTask) => `look ${task} ${rel}${task === 'select' && pointArgs ? ` ${pointArgs}` : ''}`

  /** A click on the photo is a point in its own pixels; shift-click marks "not this". */
  const addPoint = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const r = img.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * img.naturalWidth)
    const y = Math.round(((e.clientY - r.top) / r.height) * img.naturalHeight)
    setPoints((p) => [...p, [x, y, e.shiftKey ? 0 : 1]])
  }

  const runAll = async (task: LookTask) => {
    setBusy(`all ${task}`)
    for (const p of photos) if (!(await runCommand(`look ${task} images/${set}/${p}`))) break
    setBusy('')
  }

  return (
    <section className="panel" aria-label="look">
      <h2 className="panel__title label">tools</h2>
      <p className="models-intro">
        <KindLine kind="looks" />
      </p>
      <div className="cards">
        {TOOL_MODELS.filter((t) => t.kind === 'looks').map((t) => (
          <ToolCard key={t.name} tool={t} here={!!here[t.name]} busy={busy === `get ${t.name}`} onGet={() => void run(`get ${t.name}`, `model get ${t.name}`)} />
        ))}
      </div>

      <h2 className="panel__title label">photos · workspace/images</h2>
      <div className="look-sets">
        <Explained id="look.set">
          <label className="field">
            <span className="label label--muted">set</span>
            <select value={set} onChange={(e) => setSet(e.target.value)}>
              {sets.map((s) => (
                <option key={s.folder} value={s.folder}>
                  {s.folder}
                </option>
              ))}
              <option value="">a new set…</option>
            </select>
          </label>
        </Explained>
        {!set && (
          <label className="field">
            <span className="label label--muted">new set name</span>
            <input value={newSet} onChange={(e) => setNewSet(e.target.value.toLowerCase())} placeholder="studio-work" />
          </label>
        )}
        <Explained id="look.license">
          <label className="field">
            <span className="label label--muted">whose photos (license)</span>
            <input value={license} onChange={(e) => setLicense(e.target.value)} />
          </label>
        </Explained>
        <Explained id="look.photos">
          <button type="button" className="text-button" onClick={() => file.current?.click()}>
            add photos
          </button>
        </Explained>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={async (e) => {
            for (const f of Array.from(e.target.files ?? [])) await upload(f, f.name)
            e.target.value = ''
          }}
        />
        <Explained id="look.camera">
          <button type="button" className="text-button" onClick={() => setCamera((c) => !c)} aria-pressed={camera}>
            {camera ? 'close the camera' : 'take a photo'}
          </button>
        </Explained>
        {note && <span className="label label--muted">{note}</span>}
      </div>
      {camera && <Camera onShot={(b) => void upload(b, `camera-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`)} />}

      {photos.length > 0 && (
        <div className="look-strip" role="listbox" aria-label="photos in this set">
          {photos.map((p) => (
            <button key={p} type="button" role="option" aria-selected={p === photo} className={`look-thumb ${p === photo ? 'is-active' : ''}`.trim()} onClick={() => setPhoto(p)}>
              <img src={fileUrl(`images/${set}/${p}`)} alt={p} />
            </button>
          ))}
        </div>
      )}

      {rel && (
        <>
          <h2 className="panel__title label">{photo.toUpperCase()}</h2>
          <div className="look-work">
            <figure className="look-figure">
              <div className="look-photo">
                <Explained id="look.click">
                  <img src={fileUrl(rel)} alt={photo} onClick={addPoint} />
                </Explained>
                {points.map(([x, y, l], i) => (
                  <PointMark key={i} x={x} y={y} positive={!!l} photo={rel} />
                ))}
              </div>
              <figcaption className="label label--muted">
                the photo · click to select something, shift-click to mark what isn&apos;t it
                {points.length > 0 && (
                  <>
                    {' · '}
                    <button type="button" className="text-button" onClick={() => setPoints([])}>
                      clear points
                    </button>
                  </>
                )}
              </figcaption>
            </figure>
            {(['cutout', 'depth', 'select'] as LookTask[]).map((task) => {
              const out = outputOf(set, photo, task)
              const v = made[out]
              const running = live?.phase === 'running' && live.run.from === rel && live.run.task === task
              return (
                <figure key={task} className="look-figure">
                  <div className={`look-out ${task === 'depth' ? '' : 'is-transparent'}`.trim()}>
                    {v ? <img src={fileUrl(out, v)} alt={`${task} of ${photo}`} /> : <span className="label label--muted">{running ? 'running…' : 'not made yet'}</span>}
                  </div>
                  <figcaption className="look-actions">
                    <Explained id={`look.${task}`}>
                      <CommandPreview
                        command={cmd(task)}
                        onRun={() => void run(task, cmd(task))}
                        disabled={!here[task] || (task === 'select' && !points.some((p) => p[2] === 1))}
                        running={busy === task}
                        label={TOOL_MODELS.find((t) => t.name === task)!.action}
                      />
                    </Explained>
                    {task !== 'select' && photos.length > 1 && (
                      <Explained id="look.all">
                        <button type="button" className="text-button" disabled={!here[task] || !!busy} onClick={() => void runAll(task)}>
                          {busy === `all ${task}` ? 'running on every photo…' : `${TOOL_MODELS.find((t) => t.name === task)!.action}: every photo in ${set}`}
                        </button>
                      </Explained>
                    )}
                    {!here[task] && <span className="label label--muted">download {task} above first</span>}
                    {live?.phase === 'failed' && live.run.task === task && live.run.from === rel && <span className="label">{live.error}</span>}
                    {live?.phase === 'done' && live.run.task === task && live.run.from === rel && <span className="label label--muted">{(live.ms / 1000).toFixed(1)}s · {live.out}</span>}
                  </figcaption>
                </figure>
              )
            })}
          </div>
        </>
      )}
      {sets.length === 0 && photos.length === 0 && <p className="label label--muted">no photos yet: name a set, then add photos or take one</p>}
    </section>
  )
}

/** A clicked point, placed over the photo as a share of its size so it stays put when the layout changes. */
function PointMark({ x, y, positive, photo }: { x: number; y: number; positive: boolean; photo: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const img = new Image()
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = fileUrl(photo)
  }, [photo])
  if (!size) return null
  return <span className={`look-point ${positive ? '' : 'is-not'}`.trim()} style={{ left: `${(x / size.w) * 100}%`, top: `${(y / size.h) * 100}%` }} aria-hidden="true" />
}

/** The camera, in the page only: a frame is kept only when you press "keep this one", and goes into the set like any photo. */
function Camera({ onShot }: { onShot: (b: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        stream = s
        if (video.current) video.current.srcObject = s
      })
      .catch((err: Error) => setError(`no camera: ${err.message}`))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])
  const shoot = () => {
    const v = video.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && onShot(b), 'image/jpeg', 0.92)
  }
  return (
    <div className="look-camera">
      {error ? <span className="label">{error}</span> : <video ref={video} autoPlay playsInline muted />}
      <button type="button" className="text-button" onClick={shoot} disabled={!!error}>
        keep this one
      </button>
    </div>
  )
}
