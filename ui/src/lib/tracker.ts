import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { TRACKER_MODELS } from '@shared/kinds'
import type { Point, Tracker } from '@shared/gesture'

/**
 * The Move tab's trackers: MediaPipe's hand and body landmarkers, in the page.
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
        ? HandLandmarker.createFromOptions(fileset, { baseOptions, runningMode: mode, numHands: 1 })
        : PoseLandmarker.createFromOptions(fileset, { baseOptions, runningMode: mode, numPoses: 1 })
    })()
    made.set(key, p)
    p.catch(() => made.delete(key))
  }
  return p
}

/** Points on the first hand or body found in a video frame, or null. x and y are 0–1 across the picture. */
export async function trackVideo(tracker: Tracker, video: HTMLVideoElement, at: number): Promise<Point[] | null> {
  const lm = await landmarker(tracker, 'VIDEO')
  const r = lm.detectForVideo(video, at)
  return (r.landmarks?.[0] as Point[] | undefined) ?? null
}

/** The same, on a still photo. */
export async function trackImage(tracker: Tracker, img: HTMLImageElement): Promise<Point[] | null> {
  const lm = await landmarker(tracker, 'IMAGE')
  const r = lm.detect(img)
  return (r.landmarks?.[0] as Point[] | undefined) ?? null
}

/** Which points are joined by a line when they are drawn: the bones of a hand, or of a body. */
export const BONES: Record<Tracker, [number, number][]> = {
  hands: HandLandmarker.HAND_CONNECTIONS.map((c) => [c.start, c.end]),
  body: PoseLandmarker.POSE_CONNECTIONS.map((c) => [c.start, c.end]),
}
