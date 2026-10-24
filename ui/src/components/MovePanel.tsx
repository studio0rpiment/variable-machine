import { useCallback, useEffect, useRef, useState } from 'react'
import { TRACKER_MODELS, type TrackerModel } from '@shared/kinds'
import { classify, normalize, type GestureModel, type Point, type Tracker } from '@shared/gesture'
import { joinWords } from '@shared/quote'
import { runCommand, sendEvent } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import { BONES, trackImage, trackVideo } from '../lib/tracker'
import { useHelperEvent } from '../hooks/useHelper'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import PicturePicker from './PicturePicker'
import { KindLine } from './ToolCard'
import { Explained } from '../explain/Explained'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const LABEL = /^[\w .-]{1,40}$/
/** examples recorded while a record button is held: at most this many a second, so a few seconds make a good handful */
const PER_SECOND = 10

interface GestureSet {
  folder: string
  name: string
  tracker: Tracker
  counts: Record<string, number>
  trained?: { k: number; examples: number; check: { heldOut: number; correct: number; confusion: Record<string, Record<string, number>> } }
}

export function TrackerCard({ t, here, busy, onGet }: { t: TrackerModel; here: boolean; busy: boolean; onGet: () => void }) {
  return (
    <Manifest
      name={t.name}
      badges={<Badge>{t.kind}</Badge>}
      lines={[`${t.maker} · ${t.license}`, `${t.file} · about ${t.mb} MB · ${here ? 'in workspace/tools' : 'not downloaded yet'}`]}
      actions={
        !here && (
          <Explained id="move.get">
            <CommandPreview command={`model get ${t.name}`} onRun={onGet} running={busy} label={`download ${t.name}`} />
          </Explained>
        )
      }
    >
      <p className="model-about">{t.builtFor}</p>
    </Manifest>
  )
}

/** Draw the points and the bones between them over the picture, in the line colour: outlines only. */
function draw(canvas: HTMLCanvasElement, w: number, h: number, points: Point[] | null, tracker: Tracker) {
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, w, h)
  if (!points) return
  const line = getComputedStyle(canvas).color
  g.strokeStyle = line
  g.lineWidth = Math.max(1, w / 400)
  for (const [a, b] of BONES[tracker]) {
    g.beginPath()
    g.moveTo(points[a].x * w, points[a].y * h)
    g.lineTo(points[b].x * w, points[b].y * h)
    g.stroke()
  }
  for (const p of points) {
    g.beginPath()
    g.arc(p.x * w, p.y * h, Math.max(2, w / 160), 0, Math.PI * 2)
    g.stroke()
  }
}

/**
 * Move: the moves kind. A tracker finds points on your hand or body (in the
 * page; frames never leave it). You record examples of a few gestures of your
 * own, train a k-nearest-neighbours model on them (`gesture train`), test it
 * live, and send what it sees to TouchDesigner, Max or anything that takes OSC.
 */
/** active: the gesture tab is showing. Panels stay mounted when hidden, and the camera must only be on while you can see it. */
export default function MovePanel({ active }: { active: boolean }) {
  const [here, setHere] = useState<Record<string, boolean>>({})
  const [sets, setSets] = useState<GestureSet[]>([])
  const [name, setName] = useState('')
  const [newName, setNewName] = useState('')
  const [newTracker, setNewTracker] = useState<Tracker>('hands')
  const [source, setSource] = useState<'camera' | 'photo'>('camera')
  const [photo, setPhoto] = useState('')
  const [label, setLabel] = useState('')
  const [recording, setRecording] = useState('')
  const [testing, setTesting] = useState(false)
  const [guess, setGuess] = useState<{ label: string; confidence: number } | null>(null)
  const [port, setPort] = useState('9000')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [found, setFound] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef<Point[] | null>(null)
  const buffer = useRef<number[][]>([])
  const lastTake = useRef(0)
  const model = useRef<GestureModel | null>(null)

  const set = sets.find((s) => s.folder === name)
  const hasSet = !!set
  const tracker = set?.tracker ?? newTracker

  const load = useCallback(async () => {
    const tools = await readManifests<{ name: string }>('tools')
    setHere(Object.fromEntries(TRACKER_MODELS.map((t) => [t.name, tools.some((x) => x.folder === t.name)])))
    const g = await readManifests<GestureSet>('gestures')
    setSets(g)
    setName((n) => n || g[0]?.folder || '')
  }, [])
  useEffect(() => void load(), [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => (e.path.startsWith('gestures/') || e.path.startsWith('tools/')) && e.path.endsWith('manifest.json') && void load(), [load]),
  )

  // the trained model, for the live test
  useEffect(() => {
    model.current = null
    if (!set?.trained) return
    void readFile(`gestures/${set.folder}/model.json`).then((t) => (model.current = t ? (JSON.parse(t) as GestureModel) : null))
  }, [set?.folder, set?.trained])

  const run = async (key: string, line: string) => {
    setBusy(key)
    const ok = await runCommand(line)
    setBusy('')
    return ok
  }

  /** What to do with the points of each frame: draw them, keep them while recording, name them while testing. */
  const onPoints = useCallback(
    (points: Point[] | null, w: number, h: number) => {
      latest.current = points
      setFound(!!points)
      if (canvas.current) draw(canvas.current, w, h, points, tracker)
      if (!points) return
      const t = performance.now()
      if (recording && t - lastTake.current > 1000 / PER_SECOND) {
        lastTake.current = t
        buffer.current.push(normalize(points, tracker))
      }
      if (testing && model.current) {
        const g = classify(model.current, normalize(points, tracker))
        setGuess({ label: g.label, confidence: g.confidence })
        sendEvent({ type: 'gesture.live', name, label: g.label, confidence: g.confidence })
      }
    },
    [recording, testing, tracker, name],
  )

  // the camera loop reads the latest handler, so starting to record or test doesn't restart the camera
  const pointsTo = useRef(onPoints)
  pointsTo.current = onPoints
  const trackerHere = !!here[tracker]

  // the camera: one frame at a time, as the browser hands them over
  useEffect(() => {
    if (!active || !hasSet || source !== 'camera' || !trackerHere) return
    let stream: MediaStream | null = null
    let stop = false
    let frame = 0
    void navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 } }, audio: false })
      .then(async (s) => {
        stream = s
        const v = video.current
        if (!v || stop) return
        v.srcObject = s
        await v.play()
        setNote('')
        const tick = async () => {
          if (stop) return
          if (v.readyState >= 2) pointsTo.current(await trackVideo(tracker, v, performance.now()), v.videoWidth, v.videoHeight)
          frame = requestAnimationFrame(() => void tick())
        }
        void tick()
      })
      .catch((e: Error) => setNote(`no camera: ${e.message}. Use a photo instead.`))
    return () => {
      stop = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [active, hasSet, source, tracker, trackerHere])

  // a still photo: points once, when it has loaded
  const onPhoto = async () => {
    const i = img.current
    if (!i || !here[tracker]) return
    try {
      onPoints(await trackImage(tracker, i), i.naturalWidth, i.naturalHeight)
    } catch (e) {
      setNote((e as Error).message)
    }
  }
  useEffect(() => void (source === 'photo' && photo && img.current?.complete && onPhoto()), [tracker, testing]) // eslint-disable-line react-hooks/exhaustive-deps

  /** A new photo: forget the last one's points at once, so "add this photo" can't save them under the new one while it is still being tracked. */
  const choosePhoto = (p: string) => {
    latest.current = null
    setFound(false)
    if (canvas.current) draw(canvas.current, 1, 1, null, tracker)
    setPhoto(p)
  }

  const save = async (lbl: string, vectors: number[][]) => {
    if (!vectors.length) return setNote('nothing was found to record: get your whole hand (or body) in the picture')
    const res = await fetch(`/api/workspace/gesture?name=${encodeURIComponent(name)}&label=${encodeURIComponent(lbl)}`, { method: 'POST', body: JSON.stringify({ vectors }) })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    setNote(res.ok ? '' : (body.error ?? 'recording failed'))
  }
  const startRecording = (lbl: string) => {
    buffer.current = []
    setRecording(lbl)
  }
  const stopRecording = () => {
    if (!recording) return
    const lbl = recording
    setRecording('')
    void save(lbl, buffer.current)
  }

  const labels = Object.keys(set?.counts ?? {}).filter((l) => (set?.counts[l] ?? 0) > 0)
  const newLine = joinWords(['gesture', 'new', newName || '<name>', '--tracker', newTracker])
  const trainLine = `gesture train ${name}`
  const sendLine = joinWords(['gesture', 'send', name, '--port', port])

  return (
    <section className="panel" aria-label="move">
      <h2 className="panel__title label">trackers · run in the page</h2>
      <p className="models-intro">
        <KindLine kind="moves" />
      </p>
      <div className="cards">
        {TRACKER_MODELS.map((t) => (
          <TrackerCard key={t.name} t={t} here={!!here[t.name]} busy={busy === `get ${t.name}`} onGet={() => void run(`get ${t.name}`, `model get ${t.name}`)} />
        ))}
      </div>

      <h2 className="panel__title label">your gestures · workspace/gestures</h2>
      <div className="look-sets">
        <Explained id="move.set">
          <label className="field">
            <span className="label label--muted">gesture set</span>
            <select value={name} onChange={(e) => setName(e.target.value)}>
              {sets.map((s) => (
                <option key={s.folder} value={s.folder}>
                  {s.folder} · {s.tracker}
                </option>
              ))}
              <option value="">a new set…</option>
            </select>
          </label>
        </Explained>
        {!name && (
          <>
            <label className="field">
              <span className="label label--muted">name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase())} placeholder="studio-hands" spellCheck={false} />
            </label>
            <div className="choice" role="radiogroup" aria-label="tracker">
              {(['hands', 'body'] as Tracker[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={t === newTracker} className={`text-button ${t === newTracker ? 'is-active' : ''}`.trim()} onClick={() => setNewTracker(t)}>
                  {t}
                </button>
              ))}
            </div>
            <Explained id="move.new">
              <CommandPreview command={newLine} onRun={() => void run('new', newLine).then((ok) => ok && setName(newName))} disabled={!NAME.test(newName)} running={busy === 'new'} label="make the set" />
            </Explained>
          </>
        )}
      </div>

      {set && (
        <>
          <div className="choice move-source" role="radiogroup" aria-label="source">
            {(['camera', 'photo'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={s === source} className={`text-button ${s === source ? 'is-active' : ''}`.trim()} onClick={() => (setSource(s), setNote(''))}>
                {s === 'camera' ? 'the camera' : 'a photo'}
              </button>
            ))}
          </div>
          {source === 'photo' && <PicturePicker value={photo} onChange={choosePhoto} />}
          {!here[tracker] && <p className="label">download the {tracker} tracker above first</p>}

          <div className="move-work">
            <figure className="move-view">
              {source === 'camera' ? <video ref={video} muted playsInline className="move-view__picture" /> : photo && <img ref={img} src={`/api/workspace/file?path=${encodeURIComponent(photo)}`} alt={photo} className="move-view__picture" onLoad={() => void onPhoto()} />}
              <canvas ref={canvas} className="move-view__points" />
              <figcaption className="label label--muted">
                {found ? `${tracker === 'hands' ? 'a hand' : 'a body'}: ${tracker === 'hands' ? 21 : 33} points` : `no ${tracker === 'hands' ? 'hand' : 'body'} found yet`}
                {' · only the points are kept, never the picture'}
              </figcaption>
            </figure>

            <div className="move-side">
              <h3 className="label">1 · record examples</h3>
              {labels.map((l) => (
                <div key={l} className="move-label">
                  <span className="move-label__name">{l}</span>
                  <span className="label label--muted">{set.counts[l]} examples</span>
                  {source === 'camera' ? (
                    <Explained id="move.record">
                      <button type="button" className={`text-button ${recording === l ? 'is-active' : ''}`.trim()} onPointerDown={() => startRecording(l)} onPointerUp={stopRecording} onPointerLeave={stopRecording}>
                        {recording === l ? 'recording…' : 'hold to record'}
                      </button>
                    </Explained>
                  ) : (
                    <button type="button" className="text-button" disabled={!found} onClick={() => latest.current && void save(l, [normalize(latest.current, tracker)])}>
                      add this photo
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={() => void run(`clear ${l}`, joinWords(['gesture', 'clear', name, l]))}>
                    forget
                  </button>
                </div>
              ))}
              <div className="move-label">
                <input className="move-label__new" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={labels.length ? 'another gesture' : 'name a gesture: open, fist, wave…'} />
                {source === 'camera' ? (
                  <button
                    type="button"
                    className={`text-button ${recording === label.trim() && label ? 'is-active' : ''}`.trim()}
                    disabled={!LABEL.test(label.trim())}
                    onPointerDown={() => startRecording(label.trim())}
                    onPointerUp={() => (stopRecording(), setLabel(''))}
                    onPointerLeave={stopRecording}
                  >
                    hold to record
                  </button>
                ) : (
                  <button type="button" className="text-button" disabled={!found || !LABEL.test(label.trim())} onClick={() => latest.current && void save(label.trim(), [normalize(latest.current, tracker)]).then(() => setLabel(''))}>
                    add this photo
                  </button>
                )}
              </div>
              {note && <p className="label">{note}</p>}

              <h3 className="label">2 · train</h3>
              <Explained id="move.train">
                <CommandPreview command={trainLine} onRun={() => void run('train', trainLine)} disabled={labels.length < 2} running={busy === 'train'} label="train" />
              </Explained>
              {set.trained && (
                <>
                  <p className="label label--muted">
                    {set.trained.examples} examples, k = {set.trained.k} · {set.trained.check.correct} of {set.trained.check.heldOut} set aside named right
                  </p>
                  <table className="move-grid">
                    <thead>
                      <tr>
                        <th className="label label--muted">made \ named</th>
                        {Object.keys(set.trained.check.confusion).map((l) => (
                          <th key={l} className="label">
                            {l}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(set.trained.check.confusion).map(([a, row]) => (
                        <tr key={a}>
                          <th className="label">{a}</th>
                          {Object.entries(row).map(([b, n]) => (
                            <td key={b} className={a === b ? 'is-right' : n ? 'is-wrong' : ''}>
                              {n}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <h3 className="label">3 · test it, and send it on</h3>
              <Explained id="move.test">
                <button type="button" className={`text-button ${testing ? 'is-active' : ''}`.trim()} disabled={!set.trained} onClick={() => (setTesting((t) => !t), setGuess(null))} aria-pressed={testing}>
                  {testing ? 'stop testing' : 'test it live'}
                </button>
              </Explained>
              {testing && guess && (
                <p className="move-guess">
                  <span className="move-guess__label">{guess.label}</span>
                  <span className="move-guess__bar" style={{ width: `${guess.confidence * 100}%` }} aria-hidden="true" />
                  <span className="label label--muted">{Math.round(guess.confidence * 100)}% of the {set.trained?.k} nearest agree</span>
                </p>
              )}
              <div className="inline-fields">
                <label className="field move-port">
                  <span className="label label--muted">OSC port</span>
                  <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                </label>
                <Explained id="move.send">
                  <CommandPreview command={sendLine} onRun={() => void run('send', sendLine)} disabled={!set.trained || !port} running={busy === 'send'} label="send" />
                </Explained>
                <button type="button" className="text-button" onClick={() => void run('stop', `gesture send ${name} --stop`)}>
                  stop sending
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
