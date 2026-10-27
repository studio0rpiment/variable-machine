import { useCallback, useEffect, useRef, useState } from 'react'
import { TRACKER_MODELS, type TrackerModel } from '@shared/kinds'
import { classify, NONE, normalize, reachOf, TRACKER_TOOL, TRACKERS, type Found, type GestureModel, type Tracker } from '@shared/gesture'
import { joinWords } from '@shared/quote'
import { runCommand, sendEvent } from '../lib/helper'
import { readFile, readManifests } from '../lib/workspace'
import { BONES, prepareTracker, trackImage, trackVideo, trackerLoaded } from '../lib/tracker'
import { useHelperEvent } from '../hooks/useHelper'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import PicturePicker from './PicturePicker'
import { Explained } from '../explain/Explained'
import Loading, { DownloadWait } from './Loading'
import { useSpaceKey } from '../hooks/useSpaceKey'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const LABEL = /^[\w .-]{1,40}$/
/** A set's name as it is typed: small letters, spaces turned into hyphens, anything a folder name can't hold left out. */
const asName = (typed: string) =>
  typed
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 64)
/** examples recorded while a record button is held: at most this many a second, so a few seconds make a good handful */
const PER_SECOND = 10
/** with tap to record, seconds to get both hands into place before examples are kept */
const GET_READY = 3

type Camera = 'off' | 'starting' | 'on' | 'denied' | 'none' | 'busy' | 'unavailable' | 'error'

/** What to do when the camera won't open, in plain words. */
function CameraHelp({ camera, message }: { camera: Camera; message: string }) {
  if (camera === 'denied')
    return (
      <div className="move-help">
        <p>The camera is blocked, so the browser didn't ask. To allow it:</p>
        <ul>
          <li>Chrome: click the icon at the left of the address bar (a camera, or two sliders), set Camera to Allow, then reload this page.</li>
          <li>Safari: Safari › Settings for this website (or Settings › Websites › Camera), set Camera to Allow, then reload.</li>
          <li>Still blocked? The Mac is blocking the browser: System Settings › Privacy & Security › Camera, turn your browser on, then quit the browser and open it again.</li>
        </ul>
        <p>Or use a photo instead.</p>
      </div>
    )
  if (camera === 'none') return <p className="move-help">No camera was found. Connect one and press start the camera again, or use a photo instead.</p>
  if (camera === 'busy') return <p className="move-help">Another app is using the camera (FaceTime, Zoom, Photo Booth…). Close it, then press start the camera again.</p>
  if (camera === 'unavailable')
    return <p className="move-help">This browser can't open a camera from this page. Open Variable Machine at http://localhost:4817 in Chrome or Safari.</p>
  if (camera === 'error') return <p className="move-help">The camera didn't start: {message}. Press start the camera again, or use a photo instead.</p>
  return null
}

/**
 * Where a gesture goes once it is sent, and how to pick it up: the OSC message,
 * and the few objects that receive it in TouchDesigner, Max and Pure Data.
 */
function UseIt({ name, port, sending }: { name: string; port: string; sending: boolean }) {
  const address = `/vm/${name}`
  return (
    <Explained id="move.use">
      <div className="move-test move-use">
        <h3 className="label">4 · use it in your patch</h3>
        <p className="move-help">
          With <i>test it live</i> and <i>send</i> on{sending ? ' (sending now)' : ''}, every guess goes to this computer, port {port}, as an OSC message: the address, the gesture's name, and how many of the nearest examples agree (0 to 1). When it is none of your gestures, or there is no hand in the picture, the name is <i>none</i> and the number 0.
        </p>
        <code className="move-use__msg">
          {address} "fist" 0.92
        </code>
        <p className="move-help">Keep this tab open while you play: Variable Machine does the seeing, your patch does the rest.</p>
        <dl className="move-use__list">
          <dt>TouchDesigner</dt>
          <dd>
            an <b>OSC In DAT</b>, Network Port {port}. Each guess arrives as a row: the address, then the gesture and the confidence. Act on it with a DAT Execute, or pick the gesture out with a Select DAT.
          </dd>
          <dt>Max</dt>
          <dd>
            <code>[udpreceive {port}]</code> → <code>[route {address}]</code> → <code>[unpack s f]</code>: the gesture out of the left, the confidence out of the right.
          </dd>
          <dt>Pure Data</dt>
          <dd>
            <code>[netreceive -u -b {port}]</code> → <code>[oscparse]</code> → <code>[list trim]</code> → <code>[route vm]</code> → <code>[route {name}]</code>: the gesture and the confidence.
          </dd>
          <dt>Check it arrives</dt>
          <dd>
            in a Terminal, in the variable-machine folder: <code>node docs/briefs/3-gesture/osc-listen.mjs {port}</code> prints each message.
          </dd>
          <dt>Take the set with you</dt>
          <dd>
            Share → <code>zip gestures/{name}</code>: the examples and the trained model, to unzip into anyone's Variable Machine.
          </dd>
        </dl>
      </div>
    </Explained>
  )
}

/** The steps from nothing to a gesture in TouchDesigner, each done, now, or waiting. */
/**
 * Room for a dashed box around one step's controls. The box shows when that step
 * is the next one to do: it flashes as it arrives there, then stays until it is done.
 */
function Next({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <div className={`move-next ${on ? 'is-next' : ''}`.trim()}>{children}</div>
}

function Steps({ steps }: { steps: { name: string; how: string; done: boolean }[] }) {
  const now = steps.findIndex((x) => !x.done)
  return (
    <Explained id="move.steps">
      <ol className="move-steps" aria-label="steps">
        {steps.map((x, i) => {
          const state = x.done ? 'done' : i === now ? 'now' : 'waiting'
          return (
            <li key={x.name} className={`move-step is-${state}`} aria-current={i === now ? 'step' : undefined}>
              <span className="move-step__state">
                {i + 1} · {state}
              </span>
              <span>
                <span className="move-step__name">{x.name}</span>
                {i === now && <span className="move-step__how">{x.how}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </Explained>
  )
}

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
        !here &&
        (busy ? (
          <DownloadWait name={t.name} label={`downloading the ${t.name} tracker`} />
        ) : (
          <Explained id="move.get">
            <CommandPreview command={`model get ${t.name}`} onRun={onGet} running={busy} label={`download ${t.name}`} />
          </Explained>
        ))
      }
    >
      <p className="model-about">{t.builtFor}</p>
    </Manifest>
  )
}

/** What each tracker is called on the page. */
const TRACKER_NAMES: Record<Tracker, string> = { hands: 'one hand', 'two-hands': 'two hands', body: 'a body' }

/** What was found, in words: "a hand: 21 points", "two hands: 42 points", "the left hand: 21 points". */
function foundWords(found: Found | null, tracker: Tracker) {
  if (tracker === 'body') return found ? 'a body: 33 points' : 'no body found yet'
  if (!found) return tracker === 'hands' ? 'no hand found yet' : 'no hands found yet'
  if (tracker === 'hands') return 'a hand: 21 points'
  const [left, right] = found
  return left.length && right.length ? 'two hands: 42 points' : `the ${left.length ? 'left' : 'right'} hand: 21 points`
}

/** Draw the points and the bones between them over the picture, in the line colour: outlines only. */
function draw(canvas: HTMLCanvasElement, w: number, h: number, found: Found | null, tracker: Tracker) {
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, w, h)
  if (!found) return
  const line = getComputedStyle(canvas).color
  g.strokeStyle = line
  g.lineWidth = Math.max(1, w / 400)
  for (const points of found) {
    if (!points.length) continue
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
  const [examples, setExamples] = useState<(GestureSet & { about?: string })[]>([])
  const [name, setName] = useState('')
  const [newName, setNewName] = useState('')
  const [newTracker, setNewTracker] = useState<Tracker>('hands')
  /** counts clicks on "make your own": each one flashes a dashed box around the name, the next thing to fill in */
  const [flash, setFlash] = useState(0)
  /** the lightbox: the camera and the controls for recording, or for testing, gathered in the middle while the rest fades */
  const [focus, setFocus] = useState<'record' | 'test' | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => void (flash && nameInput.current?.focus()), [flash])
  const [source, setSource] = useState<'camera' | 'photo'>('camera')
  const [photo, setPhoto] = useState('')
  const [label, setLabel] = useState('')
  const [recording, setRecording] = useState('')
  /** the gesture the space bar records: the last one recorded with the mouse */
  const [armed, setArmed] = useState('')
  const [testing, setTesting] = useState(false)
  const [guess, setGuess] = useState<{ label: string; confidence: number } | null>(null)
  const [port, setPort] = useState('9000')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [found, setFound] = useState(false)
  const [foundText, setFoundText] = useState('')
  const [camera, setCamera] = useState<Camera>('off')
  const [cameraMessage, setCameraMessage] = useState('')
  const [loadingTracker, setLoadingTracker] = useState(false)
  const [sending, setSending] = useState(false)
  const stream = useRef<MediaStream | null>(null)
  const loop = useRef(0)
  const attempt = useRef(0)
  const picked = useRef(false)
  const video = useRef<HTMLVideoElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef<Found | null>(null)
  const buffer = useRef<number[][]>([])
  const lastTake = useRef(0)
  /** examples are kept from this moment (performance.now()): later than the tap, with tap to record */
  const keepFrom = useRef(0)
  /** seconds left before tap to record keeps examples */
  const [ready, setReady] = useState(0)
  const model = useRef<GestureModel | null>(null)

  const set = sets.find((s) => s.folder === name)
  const hasSet = !!set
  const tracker = set?.tracker ?? newTracker
  /** the downloaded tracker it runs on: one hand and two hands both run on hands */
  const tool = TRACKER_TOOL[tracker]
  useEffect(() => setFoundText(''), [tracker])

  const load = useCallback(async () => {
    const tools = await readManifests<{ name: string }>('tools')
    setHere(Object.fromEntries(TRACKER_MODELS.map((t) => [t.name, tools.some((x) => x.folder === t.name)])))
    const g = await readManifests<GestureSet>('gestures')
    setSets(g)
    setExamples(await readManifests<GestureSet & { about?: string }>('examples/gestures'))
    // the first set is chosen once, on opening; after that "a new set…" stays chosen while files change
    if (!picked.current) setName((n) => n || g[0]?.folder || '')
    picked.current = true
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
    void readFile(`gestures/${set.folder}/model.json`).then((t) => {
      const m = t ? (JSON.parse(t) as GestureModel) : null
      // a model trained before none was there: work out its reach now
      if (m && m.reach === undefined) m.reach = reachOf(m.examples)
      model.current = m
    })
  }, [set?.folder, set?.trained])

  const run = async (key: string, line: string) => {
    setBusy(key)
    const ok = await runCommand(line)
    setBusy('')
    return ok
  }

  /** What to do with the points of each frame: draw them, keep them while recording, name them while testing. */
  const onPoints = useCallback(
    (points: Found | null, w: number, h: number) => {
      latest.current = points
      setFound(!!points)
      setFoundText(foundWords(points, tracker))
      if (canvas.current) draw(canvas.current, w, h, points, tracker)
      if (!points) {
        // nothing in the picture is an answer too: none
        if (testing && model.current) {
          setGuess({ label: NONE, confidence: 0 })
          sendEvent({ type: 'gesture.live', name, label: NONE, confidence: 0 })
        }
        return
      }
      const t = performance.now()
      if (recording && t >= keepFrom.current && t - lastTake.current > 1000 / PER_SECOND) {
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
  const trackerHere = !!here[tool]

  /** Stop the camera (leaving the tab, another set, or the photo route): its light goes off at once. */
  const stopCamera = useCallback(() => {
    attempt.current++
    cancelAnimationFrame(loop.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
    setCamera((c) => (c === 'on' || c === 'starting' ? 'off' : c))
  }, [])
  useEffect(() => {
    if (!active || source !== 'camera') stopCamera()
  }, [active, source, stopCamera])
  useEffect(() => stopCamera, [stopCamera])
  useEffect(() => stopCamera(), [name, stopCamera])
  useEffect(() => setFocus(null), [name, active])
  // esc closes the lightbox; closing the testing one stops testing
  const closeFocus = useCallback(() => {
    setFocus((f) => {
      if (f === 'test') setTesting(false)
      return null
    })
  }, [])
  useEffect(() => {
    if (!focus) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeFocus()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, closeFocus])

  /** The camera opens only when you press start: the browser asks once, on that click. Then one frame at a time, as it hands them over. */
  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCamera('unavailable')
    const mine = ++attempt.current
    setCamera('starting')
    setNote('')
    let s: MediaStream
    try {
      s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: false })
    } catch (e) {
      const err = e as DOMException
      setCameraMessage(err.message)
      return setCamera(
        err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'denied' : err.name === 'NotFoundError' || err.name === 'OverconstrainedError' ? 'none' : err.name === 'NotReadableError' ? 'busy' : 'error',
      )
    }
    const v = video.current
    if (mine !== attempt.current || !v) return s.getTracks().forEach((t) => t.stop())
    stream.current = s
    v.srcObject = s
    await v.play().catch(() => {})
    setCamera('on')
    if (!trackerLoaded(tracker, 'VIDEO')) {
      setLoadingTracker(true)
      await prepareTracker(tracker, 'VIDEO').catch((e: Error) => setNote(e.message))
      setLoadingTracker(false)
    }
    const tick = async () => {
      if (mine !== attempt.current) return
      if (v.readyState >= 2) pointsTo.current(await trackVideo(tracker, v, performance.now()), v.videoWidth, v.videoHeight)
      if (mine === attempt.current) loop.current = requestAnimationFrame(() => void tick())
    }
    void tick()
  }

  // a still photo: points once, when it has loaded
  const onPhoto = async () => {
    const i = img.current
    if (!i || !here[tool]) return
    const first = !trackerLoaded(tracker, 'IMAGE')
    if (first) setLoadingTracker(true)
    try {
      onPoints(await trackImage(tracker, i), i.naturalWidth, i.naturalHeight)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      if (first) setLoadingTracker(false)
    }
  }
  useEffect(() => void (source === 'photo' && photo && img.current?.complete && onPhoto()), [tracker, testing]) // eslint-disable-line react-hooks/exhaustive-deps

  /** A new photo: forget the last one's points at once, so "add this photo" can't save them under the new one while it is still being tracked. */
  const choosePhoto = (p: string) => {
    latest.current = null
    setFound(false)
    setFoundText('')
    if (canvas.current) draw(canvas.current, 1, 1, null, tracker)
    setPhoto(p)
  }

  const save = async (lbl: string, vectors: number[][]) => {
    if (!vectors.length) return setNote(`nothing was found to record: get your whole ${tracker === 'hands' ? 'hand' : tracker === 'two-hands' ? 'hand or hands' : 'body'} in the picture`)
    const res = await fetch(`/api/workspace/gesture?name=${encodeURIComponent(name)}&label=${encodeURIComponent(lbl)}`, { method: 'POST', body: JSON.stringify({ vectors }) })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    setNote(res.ok ? '' : (body.error ?? 'recording failed'))
  }
  /**
   * Two hands can't also hold a button: for a two-hands set, a tap starts
   * recording and another tap stops it, and examples are kept only after
   * GET_READY seconds, so the hands coming back from the mouse aren't recorded.
   */
  const tap = tracker === 'two-hands'
  const startRecording = (lbl: string) => {
    setArmed(lbl)
    buffer.current = []
    keepFrom.current = performance.now() + (tap ? GET_READY * 1000 : 0)
    setReady(tap ? GET_READY : 0)
    setRecording(lbl)
  }
  const stopRecording = () => {
    if (!recording) return
    const lbl = recording
    setRecording('')
    setReady(0)
    void save(lbl, buffer.current)
  }
  /** tap to record: the first tap starts, the next stops (and a tap on another gesture stops this one and starts that) */
  const tapRecord = (lbl: string) => {
    const was = recording
    if (was) stopRecording()
    if (was !== lbl) startRecording(lbl)
  }
  useEffect(() => {
    if (!recording || !tap) return
    const id = setInterval(() => setReady(Math.max(0, Math.ceil((keepFrom.current - performance.now()) / 1000))), 200)
    return () => clearInterval(id)
  }, [recording, tap])

  const labels = Object.keys(set?.counts ?? {}).filter((l) => (set?.counts[l] ?? 0) > 0)
  /** training needs two gestures or more, with at least 5 examples of each (as `gesture train` checks) */
  const trainable = labels.length >= 2 && labels.every((l) => (set?.counts[l] ?? 0) >= 5)
  // The space bar records too, held like the mouse (or tapped, for two hands): the gesture
  // typed in "another gesture" (press Return to leave the field), or else the last one recorded.
  const typed = LABEL.test(label.trim()) ? label.trim() : ''
  const spaceLabel = typed || (labels.includes(armed) ? armed : (labels[0] ?? ''))
  useSpaceKey(
    active && !!set && source === 'camera' && camera === 'on' && !!spaceLabel,
    () => {
      if (!tap) return startRecording(spaceLabel)
      if (typed && recording === typed) setLabel('')
      tapRecord(spaceLabel)
    },
    () => {
      if (tap) return
      const was = recording
      stopRecording()
      if (typed && was === typed) setLabel('')
    },
  )
  /** what a record button says: hold or tap, and while recording, the count to get ready */
  const recordWords = (on: boolean) => (!on ? (tap ? 'tap to record' : 'hold to record') : ready > 0 ? `get ready: ${ready}…` : tap ? 'recording… tap to stop' : 'recording…')
  const newLine = joinWords(['gesture', 'new', newName || '<name>', '--tracker', newTracker])
  const trainLine = `gesture train ${name}`
  const sendLine = joinWords(['gesture', 'send', name, '--port', port])
  const what = tracker === 'hands' ? 'hand' : tracker === 'two-hands' ? 'hands' : 'body'
  const trackerInfo = TRACKER_MODELS.find((t) => t.name === tool)!
  const taken = sets.some((x) => x.folder === newName)
  const getTracker = () => void run(`get ${tool}`, `model get ${tool}`)

  const steps = [
    { name: 'get the tracker', how: `download the ${tool} tracker (${trackerInfo.mb} MB): it finds the points on your ${what} in the picture`, done: trackerHere },
    { name: 'choose a set', how: 'start with the example set, or make your own: give it a name, choose one hand, two hands or a body, and press make the set', done: hasSet },
    { name: 'start the camera', how: 'press start the camera, and allow it when the browser asks (or use a photo)', done: camera === 'on' || (source === 'photo' && !!photo) },
    { name: 'record two or more gestures', how: 'name a gesture, then hold to record for 3–5 seconds while you make it (at least 5 examples of each); then another', done: trainable },
    { name: 'train', how: 'press train: it takes a second, and shows which gestures it mixes up', done: !!set?.trained },
    { name: 'test it, and send it on', how: 'test it live, then send it on as OSC; "use it in your patch" on the right says what to put in TouchDesigner, Max or Pure Data', done: testing || sending },
  ]
  /** the next step to do: its controls get the dashed box */
  const now = steps.findIndex((x) => !x.done)

  /** The tracker, offered right where it is needed: a button, or its download as it happens. */
  const offerTracker = !trackerHere && (
    <Next on={now === 0}>
    <div className="move-start">
      {busy === `get ${tool}` ? (
        <DownloadWait name={tool} label={`downloading the ${tool} tracker`} />
      ) : (
        <>
          <Explained id="move.get">
            <button type="button" className="act-button" onClick={getTracker}>
              download the {tool} tracker ({trackerInfo.mb} MB)
            </button>
          </Explained>
          <CommandPreview command={`model get ${tool}`} onRun={getTracker} label={`download the ${tool} tracker`} />
        </>
      )}
    </div>
    </Next>
  )

  return (
    <section className="panel" aria-label="move">
      <div className="move-layout">
        <div className="move-setup">
          <h2 className="panel__title label">steps · from your {what} to a gesture in your patch</h2>
          <Steps steps={steps} />

          <h2 className="panel__title label">gesture sets · start with the example, then make your own</h2>
          <div className="look-sets">
            <Explained id="move.set">
              <div className="move-sets" role="radiogroup" aria-label="gesture sets">
                {examples
                  .filter((x) => !sets.some((s) => s.folder === x.folder))
                  .map((x) => (
                    <button key={x.folder} type="button" role="radio" aria-checked={false} className="move-set move-set--example" disabled={busy === `example ${x.folder}`} onClick={() => void run(`example ${x.folder}`, `gesture example ${x.folder}`).then((ok) => ok && setName(x.folder))}>
                      <span className="move-set__name">{x.folder}</span>
                      <span className="label label--muted">
                        the example · {Object.keys(x.counts).join(', ')} · {Object.values(x.counts).reduce((a, b) => a + b, 0)} examples
                      </span>
                      <span className="label">{busy === `example ${x.folder}` ? 'copying it in…' : 'start here: copy it in'}</span>
                    </button>
                  ))}
                {sets.map((x) => {
                  const n = Object.values(x.counts).reduce((a, b) => a + b, 0)
                  const isExample = examples.some((e) => e.folder === x.folder)
                  return (
                    <button key={x.folder} type="button" role="radio" aria-checked={x.folder === name} className={`move-set ${x.folder === name ? 'is-active' : ''}`.trim()} onClick={() => setName(x.folder)}>
                      <span className="move-set__name">{x.folder}</span>
                      <span className="label label--muted">
                        {isExample ? 'the example · ' : ''}
                        {x.tracker} · {Object.keys(x.counts).filter((l) => x.counts[l] > 0).length} gestures · {n} examples
                      </span>
                      <span className="label label--muted">{x.trained ? 'trained' : 'not trained yet'}</span>
                    </button>
                  )
                })}
                <button type="button" role="radio" aria-checked={!name} className={`move-set move-set--new ${!name ? 'is-active' : ''}`.trim()} onClick={() => {
                    setName('')
                    setFlash((n) => n + 1)
                  }}>
                  <span className="move-set__name">+ make your own</span>
                  <span className="label label--muted">your gestures, your hand, your camera</span>
                </button>
              </div>
            </Explained>
            {!name && (
              <div className="move-start">
                <Next key={flash} on={now === 1 || flash > 0}>
                  <label className="field">
                    <span className="label label--muted">name</span>
                    <input ref={nameInput} type="text" value={newName} onChange={(e) => setNewName(asName(e.target.value))} placeholder="studio-hands" spellCheck={false} />
                  </label>
                </Next>
                <div className="field">
                  <span className="label label--muted">its tracker</span>
                  <div className="choice" role="radiogroup" aria-label="its tracker">
                    {TRACKERS.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={t === newTracker} className={`text-button ${t === newTracker ? 'is-active' : ''}`.trim()} onClick={() => setNewTracker(t)}>
                        {TRACKER_NAMES[t]}
                      </button>
                    ))}
                  </div>
                  <span className="label label--muted">
                    {newTracker === 'two-hands' ? 'either hand or both: one set can hold one-handed gestures and two-handed ones. ' : ''}this picks what the set follows; it doesn't download anything
                  </span>
                </div>
                {offerTracker}
                <Explained id="move.new">
                  <button
                    type="button"
                    className="act-button"
                    disabled={!NAME.test(newName) || taken || busy === 'new'}
                    onClick={() => void run('new', newLine).then((ok) => ok && setName(newName))}
                  >
                    {busy === 'new' ? 'making the set…' : 'make the set'}
                  </button>
                </Explained>
                {!newName && <span className="label label--muted">name it first</span>}
                {taken && <span className="label">there is already a set called {newName}: choose it above, or give this one another name</span>}
                <CommandPreview command={newLine} onRun={() => void run('new', newLine).then((ok) => ok && setName(newName))} disabled={!NAME.test(newName) || taken} running={busy === 'new'} label="make the set" />
              </div>
            )}
          </div>

          <h2 className="panel__title label">choose a model</h2>
          <p className="models-intro">
            The model that finds the points: on a hand (21) or on a whole body (33). It is ready-made and you don't train it: it runs in this page and turns each camera frame into points. Your gestures then train the small model that names them. A set uses one or the other: a set for one hand or for two hands uses the hands tracker, told to find one hand or up to two.
          </p>
          <div className="cards">
            {TRACKER_MODELS.map((t) => (
              <TrackerCard key={t.name} t={t} here={!!here[t.name]} busy={busy === `get ${t.name}`} onGet={() => void run(`get ${t.name}`, `model get ${t.name}`)} />
            ))}
          </div>

        </div>

        {focus && <div className="move-backdrop" onClick={closeFocus} aria-hidden="true" />}
        <div
          className={`move-studio ${focus ? `is-focus is-focus--${focus}` : ''}`.trim()}
          aria-label="camera, examples and training"
          role={focus ? 'dialog' : undefined}
          aria-modal={focus ? true : undefined}
        >
          {set ? (
            <>
              {focus && (
                <div className="move-focus-bar">
                  <h3 className="label">
                    {focus === 'record' ? 'record examples' : 'test it, and send it on'} · {name}
                  </h3>
                  <button type="button" className="text-button" onClick={closeFocus}>
                    {focus === 'test' ? 'stop testing' : 'done'} (esc)
                  </button>
                </div>
              )}
              <div className="choice move-source" role="radiogroup" aria-label="source">
                {(['camera', 'photo'] as const).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={s === source} className={`text-button ${s === source ? 'is-active' : ''}`.trim()} onClick={() => (setSource(s), setNote(''))}>
                    {s === 'camera' ? 'the camera' : 'a photo'}
                  </button>
                ))}
              </div>
              {source === 'photo' && (
                <Next on={now === 2}>
                  <PicturePicker value={photo} onChange={choosePhoto} />
                </Next>
              )}
              {offerTracker}
              {source === 'camera' && trackerHere && camera !== 'on' && (
                <Next on={now === 2}>
                <div className="move-start">
                  {camera === 'starting' ? (
                    <Loading label="waiting for the camera: allow it if the browser asks" />
                  ) : (
                    <Explained id="move.camera">
                      <button type="button" className="act-button" onClick={() => void startCamera()}>
                        start the camera
                      </button>
                    </Explained>
                  )}
                  <CameraHelp camera={camera} message={cameraMessage} />
                </div>
                </Next>
              )}
              {loadingTracker && <Loading label={`loading the ${tool} tracker`} about={2 + trackerInfo.mb * 0.15} />}

              <figure className="move-view">
                {source === 'camera' ? <video ref={video} muted playsInline className="move-view__picture" /> : photo && <img ref={img} src={`/api/workspace/file?path=${encodeURIComponent(photo)}`} alt={photo} className="move-view__picture" onLoad={() => void onPhoto()} />}
                <canvas ref={canvas} className="move-view__points" />
                <figcaption className="label label--muted">
                  {foundText || foundWords(null, tracker)}
                  {' · only the points are kept, never the picture'}
                </figcaption>
              </figure>
              {source === 'camera' && camera === 'on' && (
                <button type="button" className="text-button move-camera-off" onClick={stopCamera}>
                  stop the camera
                </button>
              )}

              <div className="move-side">
                <div className="move-part move-part--record">
                <Next on={now === 3}>
                <h3 className="label">1 · record examples</h3>
                {!focus && (
                  <button
                    type="button"
                    className="act-button"
                    onClick={() => {
                      setFocus('record')
                      if (source === 'camera' && trackerHere && camera !== 'on' && camera !== 'starting') void startCamera()
                    }}
                  >
                    open the recorder
                  </button>
                )}
                {labels.map((l) => (
                  <div key={l} className="move-label">
                    <span className="move-label__name">{l}</span>
                    <span className="label label--muted">{set.counts[l]} examples</span>
                    {source === 'camera' ? (
                      <Explained id={tap ? 'move.recordTap' : 'move.record'}>
                        {tap ? (
                          <button type="button" className={`text-button ${recording === l ? 'is-active' : ''}`.trim()} onClick={() => tapRecord(l)} aria-pressed={recording === l}>
                            {recordWords(recording === l)}
                          </button>
                        ) : (
                          <button type="button" className={`text-button ${recording === l ? 'is-active' : ''}`.trim()} onPointerDown={() => startRecording(l)} onPointerUp={stopRecording} onPointerLeave={stopRecording}>
                            {recordWords(recording === l)}
                          </button>
                        )}
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
                  <input type="text" className="move-label__new" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder={labels.length ? 'another gesture' : 'name a gesture: open, fist, wave…'} />
                  {source === 'camera' && tap ? (
                    <button
                      type="button"
                      className={`text-button ${recording === label.trim() && label ? 'is-active' : ''}`.trim()}
                      disabled={!LABEL.test(label.trim())}
                      aria-pressed={recording === label.trim() && !!label}
                      onClick={() => {
                        const stopping = recording === label.trim()
                        tapRecord(label.trim())
                        if (stopping) setLabel('')
                      }}
                    >
                      {recordWords(recording === label.trim() && !!label)}
                    </button>
                  ) : source === 'camera' ? (
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
                {source === 'camera' && spaceLabel && (
                  <span className="label label--muted">
                    {recording
                      ? ready > 0
                        ? `get ready: ${ready}… then make ${recording}`
                        : `recording ${recording}…${tap ? ' tap again (or the space bar) to stop' : ''}`
                      : tap
                        ? `or press the space bar to start recording ${spaceLabel}, and again to stop`
                        : `or hold the space bar to record ${spaceLabel}`}
                    {typed && !recording ? ' (press Return first if you are still in the name)' : ''}
                  </span>
                )}
                {note && <p className="label">{note}</p>}
                </Next>
                </div>

                <Next on={now === 4}>
                <h3 className="label">2 · train</h3>
                <Explained id="move.train">
                  <CommandPreview command={trainLine} onRun={() => void run('train', trainLine)} disabled={!trainable} running={busy === 'train'} label="train" />
                </Explained>
                </Next>
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

                <div className={`move-test move-part--test ${now === 5 ? 'is-next' : ''}`.trim()}>
                  <h3 className="label">3 · test it, and send it on</h3>
                  <Explained id="move.test">
                    <button type="button" className={`text-button ${testing ? 'is-active' : ''}`.trim()} disabled={!set.trained} onClick={() => {
                        setGuess(null)
                        if (testing) return closeFocus()
                        setTesting(true)
                        setFocus('test')
                        if (source === 'camera' && trackerHere && camera !== 'on' && camera !== 'starting') void startCamera()
                      }} aria-pressed={testing}>
                      {testing ? 'stop testing' : 'test it live'}
                    </button>
                  </Explained>
                  {testing && guess && (
                    <p className="move-guess">
                      <span className="move-guess__label">{guess.label}</span>
                      <span className="move-guess__bar" style={{ width: `${guess.confidence * 100}%` }} aria-hidden="true" />
                      <span className="label label--muted">
                        {guess.label === NONE ? (found ? 'none of your gestures: farther than any example' : `no ${what} in the picture`) : `${Math.round(guess.confidence * 100)}% of the ${set.trained?.k} nearest agree`}
                      </span>
                    </p>
                  )}
                  <div className="inline-fields">
                    <label className="field move-port">
                      <span className="label label--muted">OSC port</span>
                      <input type="text" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                    </label>
                    <Explained id="move.send">
                      <CommandPreview command={sendLine} onRun={() => void run('send', sendLine).then((ok) => ok && setSending(true))} disabled={!set.trained || !port} running={busy === 'send'} label="send" />
                    </Explained>
                    <button type="button" className="text-button" onClick={() => void run('stop', `gesture send ${name} --stop`).then(() => setSending(false))}>
                      stop sending
                    </button>
                  </div>
                </div>
                {set.trained && <UseIt name={name} port={port || '9000'} sending={sending} />}
              </div>
            </>
          ) : (
            <p className="move-studio__empty label label--muted">your camera, your gestures and training appear here once there is a set: make one on the left</p>
          )}
        </div>
      </div>
    </section>
  )
}
