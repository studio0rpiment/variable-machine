import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { TRACKER_MODELS } from '@shared/kinds'
import type { Found, Point, Tracker } from '@shared/gesture'

/**
 * The gesture tab's trackers: MediaPipe's hand and body landmarkers, in the page.
 * The hand landmarker looks for up to two hands.
 * Its WebAssembly comes from the helper (/vendor/mediapipe/, out of
 * node_modules) and the .task model from workspace/tools/<name>/ (model get),
 * so nothing loads from a CDN. Frames never leave the page: only points do.
 */

type Landmarker = HandLandmarker | PoseLandmarker
const made = new Map<string, Promise<Landmarker>>()

async function landmarker(tracker: Tracker, mode: 'VIDEO' | 'IMAGE'): Promise<Landmarker> {
  const key = `${tracker}:${mode}`
  let p = made.get(key)
  if (!p) {
    p = (async () => {
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe')
      const t = TRACKER_MODELS.find((x) => x.name === tracker)!
      const baseOptions = { modelAssetPath: `/api/workspace/file?path=${encodeURIComponent(`tools/${tracker}/${t.file}`)}`, delegate: 'GPU' as const }
      return tracker === 'hands'
        ? HandLandmarker.createFromOptions(fileset, { baseOptions, runningMode: mode, numHands: 2 })
        : PoseLandmarker.createFromOptions(fileset, { baseOptions, runningMode: mode, numPoses: 1 })
    })()
    made.set(key, p)
    p.catch(() => made.delete(key))
  }
  return p
}

/** Load a tracker before its first frame, so the page can show the wait. */
export async function prepareTracker(tracker: Tracker, mode: 'VIDEO' | 'IMAGE') {
  await landmarker(tracker, mode)
}

/** Whether a tracker has loaded already (or is loading), so a wait is only shown the first time. */
export const trackerLoaded = (tracker: Tracker, mode: 'VIDEO' | 'IMAGE') => made.has(`${tracker}:${mode}`)

/**
 * Sort what was found: the body, or the hands, two as [your left, your right].
 * The camera's picture isn't a mirror, so your left hand is the one on the
 * picture's right.
 */
function sorted(tracker: Tracker, r: { landmarks?: unknown[] }): Found | null {
  const all = (r.landmarks ?? []) as Point[][]
  if (!all.length) return null
  if (tracker !== 'hands' || all.length < 2) return [all[0]]
  return all[0][0].x > all[1][0].x ? [all[0], all[1]] : [all[1], all[0]]
}

/** The points found in a video frame (the body, or up to two hands), or null. x and y are 0–1 across the picture. */
export async function trackVideo(tracker: Tracker, video: HTMLVideoElement, at: number): Promise<Found | null> {
  const lm = await landmarker(tracker, 'VIDEO')
  return sorted(tracker, lm.detectForVideo(video, at))
}

/** The same, on a still photo. */
export async function trackImage(tracker: Tracker, img: HTMLImageElement): Promise<Found | null> {
  const lm = await landmarker(tracker, 'IMAGE')
  return sorted(tracker, lm.detect(img))
}

/** Which points are joined by a line when they are drawn: the bones of a hand (each hand, for two), or of a body. */
export const BONES: Record<Tracker, [number, number][]> = {
  hands: HandLandmarker.HAND_CONNECTIONS.map((c) => [c.start, c.end]),
  body: PoseLandmarker.POSE_CONNECTIONS.map((c) => [c.start, c.end]),
}
