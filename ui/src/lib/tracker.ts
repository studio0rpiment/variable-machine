import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { TRACKER_MODELS } from '@shared/kinds'
import { TRACKER_TOOL, type Found, type Point, type Tracker } from '@shared/gesture'

/**
 * The gesture tab's trackers: MediaPipe's hand and body landmarkers, in the page.
 * One hand and two hands are the same hand model, told how many hands to find.
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
      const tool = TRACKER_TOOL[tracker]
      const t = TRACKER_MODELS.find((x) => x.name === tool)!
      const baseOptions = { modelAssetPath: `/api/workspace/file?path=${encodeURIComponent(`tools/${tool}/${t.file}`)}`, delegate: 'GPU' as const }
      return tool === 'hands'
        ? HandLandmarker.createFromOptions(fileset, { baseOptions, runningMode: mode, numHands: tracker === 'two-hands' ? 2 : 1 })
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
 * Sort what was found. Two hands go in as [left, right] by MediaPipe's
 * handedness, which reads the picture as a mirror (a selfie camera's view):
 * the camera's own picture isn't mirrored, so its "Right" is your left hand.
 * When it calls both hands the same, the one on the picture's right is your left.
 */
function sorted(tracker: Tracker, r: { landmarks?: unknown[]; handedness?: { categoryName: string }[][] }): Found | null {
  const all = (r.landmarks ?? []) as Point[][]
  if (!all.length) return null
  if (tracker !== 'two-hands') return [all[0]]
  const sides = all.map((_, i) => (r.handedness?.[i]?.[0]?.categoryName === 'Right' ? 'left' : 'right'))
  if (all.length === 2 && sides[0] === sides[1]) {
    const leftFirst = all[0][0].x > all[1][0].x
    return leftFirst ? [all[0], all[1]] : [all[1], all[0]]
  }
  return [all[sides.indexOf('left')] ?? [], all[sides.indexOf('right')] ?? []]
}

/** The points found in a video frame (the first body, or up to two hands), or null. x and y are 0–1 across the picture. */
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
  'two-hands': HandLandmarker.HAND_CONNECTIONS.map((c) => [c.start, c.end]),
  body: PoseLandmarker.POSE_CONNECTIONS.map((c) => [c.start, c.end]),
}
