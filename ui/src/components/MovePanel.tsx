import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { TRACKER_MODELS, type TrackerModel } from '@shared/kinds'
import { asNow, classify, NONE, normalize, reachOf, trackerOf, TRACKERS, type Found, type GestureModel, type Tracker } from '@shared/gesture'
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
import { rich, say } from '../text/say'
import { choose, useGestureChoices } from '../lib/gestureChoices'

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
/** seconds to get into place after the tap, before examples are kept: your hands up from the mouse, or back from the computer for a body */
const GET_READY: Record<Tracker, number> = { hands: 3, body: 5 }

type Camera = 'off' | 'starting' | 'on' | 'denied' | 'none' | 'busy' | 'unavailable' | 'error'

/** What to do when the camera won't open, in plain words. */
function CameraHelp({ camera, message }: { camera: Camera; message: string }) {
  if (camera === 'denied')
    return (
      <div className="move-help">
        <p>{say('gesture.camera.denied')}</p>
        <ul>
          <li>{say('gesture.camera.denied.chrome')}</li>
          <li>{say('gesture.camera.denied.safari')}</li>
          <li>{say('gesture.camera.denied.mac')}</li>
        </ul>
        <p>{say('gesture.camera.denied.photo')}</p>
      </div>
    )
  if (camera === 'none') return <p className="move-help">{say('gesture.camera.none')}</p>
  if (camera === 'busy') return <p className="move-help">{say('gesture.camera.busy')}</p>
  if (camera === 'unavailable') return <p className="move-help">{say('gesture.camera.unavailable', { address: 'http://localhost:4817' })}</p>
  if (camera === 'error') return <p className="move-help">{say('gesture.camera.error', { message })}</p>
  return null
}

/** A patch's objects in a row, as they are typed into it: [a] → [b] → [c]. */
const objects = (list: string[]) =>
  list.map((o, i) => (
    <Fragment key={i}>
      {i > 0 && ' → '}
      <code>[{o}]</code>
    </Fragment>
  ))

/**
 * Where a gesture goes once it is sent, and how to pick it up: the OSC message,
 * and the few objects that receive it in TouchDesigner, Max and Pure Data.
 */
function UseIt({ name, port, sending }: { name: string; port: string; sending: boolean }) {
  const address = `/vm/${name}`
  return (
    <Explained id="move.use">
      <div className="move-test move-use">
        <h3 className="label">{say('gesture.use.title')}</h3>
        <p className="move-help">{rich('gesture.use.how', { sending: sending ? ` ${say('gesture.use.sendingNow')}` : '', port })}</p>
        <code className="move-use__msg">
          {address} "fist" 0.92
        </code>
        <p className="move-help">{say('gesture.use.keepOpen')}</p>
        <dl className="move-use__list">
          <dt>{say('gesture.use.td')}</dt>
          <dd>{rich('gesture.use.td.how', { port })}</dd>
          <dt>{say('gesture.use.max')}</dt>
          <dd>{rich('gesture.use.max.how', { objects: objects([`udpreceive ${port}`, `route ${address}`, 'unpack s f']) })}</dd>
          <dt>{say('gesture.use.pd')}</dt>
          <dd>{rich('gesture.use.pd.how', { objects: objects([`netreceive -u -b ${port}`, 'oscparse', 'list trim', 'route vm', `route ${name}`]) })}</dd>
          <dt>{say('gesture.use.check')}</dt>
          <dd>{rich('gesture.use.check.how', { command: `node docs/briefs/3-gesture/osc-listen.mjs ${port}` })}</dd>
          <dt>{say('gesture.use.take')}</dt>
          <dd>{rich('gesture.use.take.how', { command: `zip gestures/${name}` })}</dd>
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

/** What a step's state is called on the page. */
const STATE_WORDS = { done: () => say('gesture.steps.done'), now: () => say('gesture.steps.now'), waiting: () => say('gesture.steps.waiting') }

function Steps({ steps }: { steps: { name: string; how: string; done: boolean }[] }) {
  const now = steps.findIndex((x) => !x.done)
  return (
    <Explained id="move.steps">
      <ol className="move-steps" aria-label={say('gesture.steps.label')}>
        {steps.map((x, i) => {
          const state = x.done ? 'done' : i === now ? 'now' : 'waiting'
          return (
            <li key={x.name} className={`move-step is-${state}`} aria-current={i === now ? 'step' : undefined}>
              <span className="move-step__state">
                {i + 1} · {STATE_WORDS[state]()}
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
      lines={[
        `${t.maker} · ${t.license}`,
        say('gesture.tracker.card.file', { file: t.file, mb: t.mb, where: here ? say('gesture.tracker.card.here', { folder: 'workspace/tools' }) : say('gesture.tracker.card.notHere') }),
      ]}
      actions={
        !here &&
        (busy ? (
          <DownloadWait name={t.name} label={say('gesture.tracker.downloading', { tracker: t.name })} />
        ) : (
          <Explained id="move.get">
            <CommandPreview command={`model get ${t.name}`} onRun={onGet} running={busy} label={say('gesture.tracker.card.download', { tracker: t.name })} />
          </Explained>
        ))
      }
    >
      <p className="model-about">{t.builtFor}</p>
    </Manifest>
  )
}

/** What each tracker is called on the page. */
const TRACKER_NAMES: Record<Tracker, () => string> = { hands: () => say('gesture.tracker.hands'), body: () => say('gesture.tracker.body') }

/** What was found, in words: "a hand: 21 points", "two hands: 42 points". */
function foundWords(found: Found | null, tracker: Tracker) {
  if (tracker === 'body') return found ? say('gesture.found.body') : say('gesture.found.noBody')
  if (!found) return say('gesture.found.noHands')
  return found.length > 1 ? say('gesture.found.twoHands') : say('gesture.found.oneHand')
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
/**
 * active: the gesture tab is showing. Panels stay mounted when hidden, and the camera must only be on while you can see it.
 * only: project mode, on the gesture controller's step of that number (1 tracker, 2 set, 3 record, 4 train, 5 send):
 * the tab shows only that step's parts, and its decisions are on the schematic above it.
 */
export default function MovePanel({ active, only }: { active: boolean; only?: number }) {
  const part = (n: number) => only === undefined || only === n
  const [here, setHere] = useState<Record<string, boolean>>({})
  const [sets, setSets] = useState<GestureSet[]>([])
  const [examples, setExamples] = useState<(GestureSet & { about?: string })[]>([])
  // the set, a new set's tracker and the source are shared with the gesture controller's schematic
  const { set: name, tracker: newTracker, source } = useGestureChoices()
  const setName = useCallback((v: string | ((was: string) => string)) => choose('set', v), [])
  const setNewTracker = (t: Tracker) => choose('tracker', t)
  const setSource = (s: 'camera' | 'photo') => choose('source', s)
  const [newName, setNewName] = useState('')
  /** counts clicks on "make your own": each one flashes a dashed box around the name, the next thing to fill in */
  const [flash, setFlash] = useState(0)
  /** the lightbox: the camera and the controls for recording, or for testing, gathered in the middle while the rest fades */
  const [focus, setFocus] = useState<'record' | 'test' | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => void (flash && nameInput.current?.focus()), [flash])
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
  const tracker = set ? trackerOf(set.tracker) : newTracker
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
  }, [setName])
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
      // a model trained when a hands set followed one hand only: its examples as they are now, and their reach again
      const old = m?.examples.some((e) => e.v.length === 63)
      if (m && old) m.examples = m.examples.map((e) => ({ ...e, v: asNow(e.v) }))
      // a model trained before none was there (or with old examples): work out its reach now
      if (m && (m.reach === undefined || old)) m.reach = reachOf(m.examples)
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
  const trackerHere = !!here[tracker]

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
    // in project mode, only the record and send steps use the camera
    if (!active || source !== 'camera' || (only !== undefined && only !== 3 && only !== 5)) stopCamera()
  }, [active, source, only, stopCamera])
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
    if (!i || !here[tracker]) return
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
    if (!vectors.length) return setNote(tracker === 'hands' ? say('gesture.record.nothing.hands') : say('gesture.record.nothing.body'))
    const res = await fetch(`/api/workspace/gesture?name=${encodeURIComponent(name)}&label=${encodeURIComponent(lbl)}`, { method: 'POST', body: JSON.stringify({ vectors }) })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    setNote(res.ok ? '' : (body.error ?? say('gesture.record.failed')))
  }
  /**
   * Two hands, or a body standing back from the computer, can't also hold a
   * button: a tap starts recording and another tap stops it, and examples are
   * kept only after GET_READY seconds, so getting into place isn't recorded.
   */
  const startRecording = (lbl: string) => {
    setArmed(lbl)
    buffer.current = []
    keepFrom.current = performance.now() + GET_READY[tracker] * 1000
    setReady(GET_READY[tracker])
    setRecording(lbl)
  }
  const stopRecording = () => {
    if (!recording) return
    const lbl = recording
    setRecording('')
    setReady(0)
    void save(lbl, buffer.current)
  }
  /** the first tap starts, the next stops (and a tap on another gesture stops this one and starts that) */
  const tapRecord = (lbl: string) => {
    const was = recording
    if (was) stopRecording()
    if (was !== lbl) startRecording(lbl)
  }
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setReady(Math.max(0, Math.ceil((keepFrom.current - performance.now()) / 1000))), 200)
    return () => clearInterval(id)
  }, [recording])
  // leaving the tab or stopping the camera stops recording too
  useEffect(() => void ((!active || camera !== 'on') && stopRecording()), [active, camera]) // eslint-disable-line react-hooks/exhaustive-deps

  const labels = Object.keys(set?.counts ?? {}).filter((l) => (set?.counts[l] ?? 0) > 0)
  /** training needs two gestures or more, with at least 5 examples of each (as `gesture train` checks) */
  const trainable = labels.length >= 2 && labels.every((l) => (set?.counts[l] ?? 0) >= 5)
  // The space bar records too, tapped like the button: the gesture typed in "another
  // gesture" (press Return to leave the field), or else the last one recorded.
  const typed = LABEL.test(label.trim()) ? label.trim() : ''
  const spaceLabel = typed || (labels.includes(armed) ? armed : (labels[0] ?? ''))
  useSpaceKey(
    active && !!set && source === 'camera' && camera === 'on' && !!spaceLabel,
    () => {
      if (typed && recording === typed) setLabel('')
      tapRecord(spaceLabel)
    },
  )
  /** what a record button says, and while recording, the count to get ready */
  const recordWords = (on: boolean) => (!on ? say('gesture.record.tap') : ready > 0 ? say('gesture.record.getReady', { n: ready }) : say('gesture.record.recording'))
  const newLine = joinWords(['gesture', 'new', newName || '<name>', '--tracker', newTracker])
  const trainLine = `gesture train ${name}`
  const sendLine = joinWords(['gesture', 'send', name, '--port', port])
  const what = tracker === 'hands' ? say('gesture.what.hands') : say('gesture.what.body')
  const trackerInfo = TRACKER_MODELS.find((t) => t.name === tracker)!
  const taken = sets.some((x) => x.folder === newName)
  const getTracker = () => void run(`get ${tracker}`, `model get ${tracker}`)

  const steps = [
    { name: say('gesture.step.tracker'), how: say('gesture.step.tracker.how', { tracker, mb: trackerInfo.mb, what }), done: trackerHere },
    { name: say('gesture.step.set'), how: say('gesture.step.set.how'), done: hasSet },
    { name: say('gesture.step.camera'), how: say('gesture.step.camera.how'), done: camera === 'on' || (source === 'photo' && !!photo) },
    { name: say('gesture.step.record'), how: say('gesture.step.record.how'), done: trainable },
    { name: say('gesture.step.train'), how: say('gesture.step.train.how'), done: !!set?.trained },
    { name: say('gesture.step.test'), how: say('gesture.step.test.how'), done: testing || sending },
  ]
  /** the next step to do: its controls get the dashed box */
  const now = steps.findIndex((x) => !x.done)

  /** The tracker, offered right where it is needed: a button, or its download as it happens. */
  const offerTracker = !trackerHere && (
    <Next on={now === 0}>
    <div className="move-start">
      {busy === `get ${tracker}` ? (
        <DownloadWait name={tracker} label={say('gesture.tracker.downloading', { tracker })} />
      ) : (
        <>
          <Explained id="move.get">
            <button type="button" className="act-button" onClick={getTracker}>
              {say('gesture.tracker.download', { tracker, mb: trackerInfo.mb })}
            </button>
          </Explained>
          <CommandPreview command={`model get ${tracker}`} onRun={getTracker} label={say('gesture.tracker.download.label', { tracker })} />
        </>
      )}
    </div>
    </Next>
  )

  return (
    <section className="panel" aria-label={say('gesture.label')}>
      <div className={`move-layout ${only !== undefined ? `move-layout--only move-layout--step${only}` : ''}`.trim()}>
        <div className="move-setup">
          {only === undefined && (
            <>
              <h2 className="panel__title label">{say('gesture.steps.title', { what })}</h2>
              <Steps steps={steps} />
            </>
          )}

          {only === 1 && (
            <>
              <p className="models-intro">{say('gesture.mode.tracker', { what })}</p>
              <div className="cards">
                <TrackerCard t={trackerInfo} here={trackerHere} busy={busy === `get ${tracker}`} onGet={getTracker} />
              </div>
            </>
          )}

          {part(2) && <h2 className="panel__title label">{say('gesture.sets.title')}</h2>}
          {part(2) && (
          <div className="look-sets">
            <Explained id="move.set">
              <div className="move-sets" role="radiogroup" aria-label={say('gesture.sets.label')}>
                {examples
                  .filter((x) => !sets.some((s) => s.folder === x.folder))
                  .map((x) => (
                    <button key={x.folder} type="button" role="radio" aria-checked={false} className="move-set move-set--example" disabled={busy === `example ${x.folder}`} onClick={() => void run(`example ${x.folder}`, `gesture example ${x.folder}`).then((ok) => ok && setName(x.folder))}>
                      <span className="move-set__name">{x.folder}</span>
                      <span className="label label--muted">
                        {say('gesture.sets.example', { gestures: Object.keys(x.counts).join(', '), n: Object.values(x.counts).reduce((a, b) => a + b, 0) })}
                      </span>
                      <span className="label">{busy === `example ${x.folder}` ? say('gesture.sets.example.copying') : say('gesture.sets.example.copy')}</span>
                    </button>
                  ))}
                {sets.map((x) => {
                  const n = Object.values(x.counts).reduce((a, b) => a + b, 0)
                  const isExample = examples.some((e) => e.folder === x.folder)
                  const about = { tracker: TRACKER_NAMES[trackerOf(x.tracker)](), gestures: Object.keys(x.counts).filter((l) => x.counts[l] > 0).length, n }
                  return (
                    <button key={x.folder} type="button" role="radio" aria-checked={x.folder === name} className={`move-set ${x.folder === name ? 'is-active' : ''}`.trim()} onClick={() => setName(x.folder)}>
                      <span className="move-set__name">{x.folder}</span>
                      <span className="label label--muted">
                        {isExample
                          ? say('gesture.sets.set.example', { tracker: about.tracker, gestures: about.gestures, n })
                          : say('gesture.sets.set', { tracker: about.tracker, gestures: about.gestures, n })}
                      </span>
                      <span className="label label--muted">{x.trained ? say('gesture.sets.set.trained') : say('gesture.sets.set.untrained')}</span>
                    </button>
                  )
                })}
                <button type="button" role="radio" aria-checked={!name} className={`move-set move-set--new ${!name ? 'is-active' : ''}`.trim()} onClick={() => {
                    setName('')
                    setFlash((n) => n + 1)
                  }}>
                  <span className="move-set__name">{say('gesture.sets.new')}</span>
                  <span className="label label--muted">{say('gesture.sets.new.about')}</span>
                </button>
              </div>
            </Explained>
            {!name && (
              <div className="move-start">
                <Next key={flash} on={now === 1 || flash > 0}>
                  <label className="field">
                    <span className="label label--muted">{say('gesture.new.name')}</span>
                    <input ref={nameInput} type="text" value={newName} onChange={(e) => setNewName(asName(e.target.value))} placeholder={say('gesture.new.name.placeholder')} spellCheck={false} />
                  </label>
                </Next>
                {only !== undefined ? (
                  <span className="label label--muted">{say('gesture.mode.follows', { what: TRACKER_NAMES[newTracker]() })}</span>
                ) : (
                <div className="field">
                  <span className="label label--muted">{say('gesture.new.tracker')}</span>
                  <div className="choice" role="radiogroup" aria-label={say('gesture.new.tracker')}>
                    {TRACKERS.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={t === newTracker} className={`text-button ${t === newTracker ? 'is-active' : ''}`.trim()} onClick={() => setNewTracker(t)}>
                        {TRACKER_NAMES[t]()}
                      </button>
                    ))}
                  </div>
                  <span className="label label--muted">
                    {newTracker === 'hands' ? `${say('gesture.new.tracker.hands')} ` : ''}
                    {say('gesture.new.tracker.about')}
                  </span>
                </div>
                )}
                {only === undefined && offerTracker}
                <Explained id="move.new">
                  <button
                    type="button"
                    className="act-button"
                    disabled={!NAME.test(newName) || taken || busy === 'new'}
                    onClick={() => void run('new', newLine).then((ok) => ok && setName(newName))}
                  >
                    {busy === 'new' ? say('gesture.new.making') : say('gesture.new.make')}
                  </button>
                </Explained>
                {!newName && <span className="label label--muted">{say('gesture.new.nameFirst')}</span>}
                {taken && <span className="label">{say('gesture.new.taken', { name: newName })}</span>}
                <CommandPreview command={newLine} onRun={() => void run('new', newLine).then((ok) => ok && setName(newName))} disabled={!NAME.test(newName) || taken} running={busy === 'new'} label={say('gesture.new.make')} />
              </div>
            )}
          </div>
          )}

          {only === undefined && (
            <>
              <h2 className="panel__title label">{say('gesture.models.title')}</h2>
              <p className="models-intro">{say('gesture.models.intro')}</p>
              <div className="cards">
                {TRACKER_MODELS.map((t) => (
                  <TrackerCard key={t.name} t={t} here={!!here[t.name]} busy={busy === `get ${t.name}`} onGet={() => void run(`get ${t.name}`, `model get ${t.name}`)} />
                ))}
              </div>
            </>
          )}

        </div>

        {focus && <div className="move-backdrop" onClick={closeFocus} aria-hidden="true" />}
        {(only === undefined || only >= 3) && (
        <div
          className={`move-studio ${focus ? `is-focus is-focus--${focus}` : ''}`.trim()}
          aria-label={say('gesture.studio.label')}
          role={focus ? 'dialog' : undefined}
          aria-modal={focus ? true : undefined}
        >
          {set ? (
            <>
              {focus && (
                <div className="move-focus-bar">
                  <h3 className="label">{focus === 'record' ? say('gesture.focus.record', { set: name }) : say('gesture.focus.test', { set: name })}</h3>
                  <button type="button" className="text-button" onClick={closeFocus}>
                    {focus === 'test' ? say('gesture.focus.stopTesting') : say('gesture.focus.done')}
                  </button>
                </div>
              )}
              {only === undefined && (
              <div className="choice move-source" role="radiogroup" aria-label={say('gesture.source.label')}>
                {(['camera', 'photo'] as const).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={s === source} className={`text-button ${s === source ? 'is-active' : ''}`.trim()} onClick={() => (setSource(s), setNote(''))}>
                    {s === 'camera' ? say('gesture.source.camera') : say('gesture.source.photo')}
                  </button>
                ))}
              </div>
              )}
              {source === 'photo' && only !== 4 && (
                <Next on={now === 2}>
                  <PicturePicker value={photo} onChange={choosePhoto} />
                </Next>
              )}
              {only === undefined && offerTracker}
              {source === 'camera' && trackerHere && camera !== 'on' && only !== 4 && (
                <Next on={now === 2}>
                <div className="move-start">
                  {camera === 'starting' ? (
                    <Loading label={say('gesture.camera.waiting')} />
                  ) : (
                    <Explained id="move.camera">
                      <button type="button" className="act-button" onClick={() => void startCamera()}>
                        {say('gesture.camera.start')}
                      </button>
                    </Explained>
                  )}
                  <CameraHelp camera={camera} message={cameraMessage} />
                </div>
                </Next>
              )}
              {loadingTracker && <Loading label={say('gesture.tracker.loading', { tracker })} about={2 + trackerInfo.mb * 0.15} />}

              <figure className="move-view" hidden={only === 4}>
                <div className="move-view__frame">
                  {source === 'camera' ? <video ref={video} muted playsInline className="move-view__picture" /> : photo && <img ref={img} src={`/api/workspace/file?path=${encodeURIComponent(photo)}`} alt={photo} className="move-view__picture" onLoad={() => void onPhoto()} data-no-zoom />}
                  <canvas ref={canvas} className="move-view__points" />
                  {/* the count and the recording, on the picture: where you look when you're standing back from the computer */}
                  {recording && (
                    <div className="move-view__count" aria-live="polite">
                      {ready > 0 ? (
                        <span className="move-view__number">{ready}</span>
                      ) : (
                        <span className="label move-view__recording">{say('gesture.view.recording', { gesture: recording })}</span>
                      )}
                    </div>
                  )}
                </div>
                <figcaption className="label label--muted">
                  {foundText || foundWords(null, tracker)}
                  {` · ${say('gesture.view.onlyPoints')}`}
                </figcaption>
              </figure>
              {source === 'camera' && camera === 'on' && only !== 4 && (
                <button type="button" className="text-button move-camera-off" onClick={stopCamera}>
                  {say('gesture.camera.stop')}
                </button>
              )}

              <div className="move-side">
                {part(3) && (
                <div className="move-part move-part--record">
                <Next on={now === 3}>
                {only === undefined && <h3 className="label">{say('gesture.record.title')}</h3>}
                {!focus && (
                  <button
                    type="button"
                    className="act-button"
                    onClick={() => {
                      setFocus('record')
                      if (source === 'camera' && trackerHere && camera !== 'on' && camera !== 'starting') void startCamera()
                    }}
                  >
                    {say('gesture.record.open')}
                  </button>
                )}
                {labels.map((l) => (
                  <div key={l} className="move-label">
                    <span className="move-label__name">{l}</span>
                    <span className="label label--muted">{say('gesture.record.count', { n: set.counts[l] })}</span>
                    {source === 'camera' ? (
                      <Explained id="move.record">
                        <button type="button" className={`text-button ${recording === l ? 'is-active' : ''}`.trim()} onClick={() => tapRecord(l)} aria-pressed={recording === l}>
                          {recordWords(recording === l)}
                        </button>
                      </Explained>
                    ) : (
                      <button type="button" className="text-button" disabled={!found} onClick={() => latest.current && void save(l, [normalize(latest.current, tracker)])}>
                        {say('gesture.record.addPhoto')}
                      </button>
                    )}
                    <button type="button" className="text-button" onClick={() => void run(`clear ${l}`, joinWords(['gesture', 'clear', name, l]))}>
                      {say('gesture.record.forget')}
                    </button>
                  </div>
                ))}
                <div className="move-label">
                  <input type="text" className="move-label__new" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder={labels.length ? say('gesture.record.another') : say('gesture.record.first')} />
                  {source === 'camera' ? (
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
                  ) : (
                    <button type="button" className="text-button" disabled={!found || !LABEL.test(label.trim())} onClick={() => latest.current && void save(label.trim(), [normalize(latest.current, tracker)]).then(() => setLabel(''))}>
                      {say('gesture.record.addPhoto')}
                    </button>
                  )}
                </div>
                {source === 'camera' && spaceLabel && (
                  <span className="label label--muted">
                    {recording
                      ? ready > 0
                        ? say('gesture.record.hint.getReady', { n: ready, gesture: recording })
                        : say('gesture.record.hint.recording', { gesture: recording })
                      : say('gesture.record.hint.space', { gesture: spaceLabel })}
                    {typed && !recording ? ` ${say('gesture.record.hint.returnFirst')}` : ''}
                  </span>
                )}
                {note && <p className="label">{note}</p>}
                </Next>
                </div>
                )}

                {part(4) && (
                <>
                <Next on={now === 4}>
                {only === undefined && <h3 className="label">{say('gesture.train.title')}</h3>}
                <Explained id="move.train">
                  <CommandPreview command={trainLine} onRun={() => void run('train', trainLine)} disabled={!trainable} running={busy === 'train'} label={say('gesture.train.label')} />
                </Explained>
                </Next>
                {set.trained && (
                  <>
                    <p className="label label--muted">
                      {say('gesture.train.result', { examples: set.trained.examples, k: set.trained.k, correct: set.trained.check.correct, heldOut: set.trained.check.heldOut })}
                    </p>
                    <table className="move-grid">
                      <thead>
                        <tr>
                          <th className="label label--muted">{say('gesture.train.grid')}</th>
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
                </>
                )}

                {part(5) && (
                <div className={`move-test move-part--test ${now === 5 ? 'is-next' : ''}`.trim()}>
                  {only === undefined && <h3 className="label">{say('gesture.test.title')}</h3>}
                  <Explained id="move.test">
                    <button type="button" className={`text-button ${testing ? 'is-active' : ''}`.trim()} disabled={!set.trained} onClick={() => {
                        setGuess(null)
                        if (testing) return closeFocus()
                        setTesting(true)
                        setFocus('test')
                        if (source === 'camera' && trackerHere && camera !== 'on' && camera !== 'starting') void startCamera()
                      }} aria-pressed={testing}>
                      {testing ? say('gesture.test.stop') : say('gesture.test.start')}
                    </button>
                  </Explained>
                  {testing && guess && (
                    <p className="move-guess">
                      <span className="move-guess__label">{guess.label}</span>
                      <span className="move-guess__bar" style={{ width: `${guess.confidence * 100}%` }} aria-hidden="true" />
                      <span className="label label--muted">
                        {guess.label === NONE
                          ? found
                            ? say('gesture.test.none')
                            : say('gesture.test.nothing', { what })
                          : say('gesture.test.agree', { percent: Math.round(guess.confidence * 100), k: String(set.trained?.k) })}
                      </span>
                    </p>
                  )}
                  <div className="inline-fields">
                    <label className="field move-port">
                      <span className="label label--muted">{say('gesture.test.port')}</span>
                      <input type="text" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                    </label>
                    <Explained id="move.send">
                      <CommandPreview command={sendLine} onRun={() => void run('send', sendLine).then((ok) => ok && setSending(true))} disabled={!set.trained || !port} running={busy === 'send'} label={say('gesture.test.send')} />
                    </Explained>
                    <button type="button" className="text-button" onClick={() => void run('stop', `gesture send ${name} --stop`).then(() => setSending(false))}>
                      {say('gesture.test.stopSending')}
                    </button>
                  </div>
                </div>
                )}
                {set.trained && part(5) && <UseIt name={name} port={port || '9000'} sending={sending} />}
              </div>
            </>
          ) : (
            <p className="move-studio__empty label label--muted">{say('gesture.studio.empty')}</p>
          )}
        </div>
        )}
      </div>
    </section>
  )
}
