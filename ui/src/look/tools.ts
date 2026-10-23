import type * as Ort from 'onnxruntime-web'
import { toolModel, type LookTask } from '@shared/kinds'

/**
 * The Look tab's three tools, run in the page with onnxruntime-web. Model
 * files come from workspace/tools/<name>/ (downloaded with `model get`) and
 * the WebAssembly runtime from /vendor/ort/, so nothing is fetched from a CDN.
 *
 * Each tool takes a photo's workspace path and returns a PNG. The pre- and
 * post-processing follows each model's preprocessor_config.json: resize,
 * scale to 0–1, subtract the ImageNet mean, divide by its spread.
 */

/**
 * onnxruntime-web itself is loaded at run time from /vendor/ort/ (the helper
 * serves it from node_modules) rather than bundled: its WebAssembly is 27MB,
 * and copying it into ui/dist on every rebuild would be a lot to sync.
 */
const ORT_URL = '/vendor/ort/ort.webgpu.min.mjs'
let ort: typeof Ort
let loading: Promise<void> | null = null
function loadOrt() {
  loading ??= (import(/* @vite-ignore */ ORT_URL) as Promise<typeof Ort>).then((m) => {
    m.env.wasm.wasmPaths = '/vendor/ort/'
    m.env.logLevel = 'error'
    ort = m
  })
  return loading
}

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

export const hasWebGPU = () => typeof navigator !== 'undefined' && 'gpu' in navigator

const fileUrl = (rel: string) => `/api/workspace/file?path=${encodeURIComponent(rel)}`

const sessions = new Map<string, Promise<Ort.InferenceSession>>()
function session(tool: string, file: string): Promise<Ort.InferenceSession> {
  const key = `${tool}/${file}`
  let s = sessions.get(key)
  if (!s) {
    const t = toolModel(tool)!
    if (t.needs === 'webgpu' && !hasWebGPU()) return Promise.reject(new Error(`${tool} needs WebGPU, and this browser doesn't have it (try a current Chrome or Safari)`))
    const providers = hasWebGPU() ? ['webgpu', 'wasm'] : ['wasm']
    s = loadOrt().then(() => ort.InferenceSession.create(fileUrl(`tools/${tool}/${file}`), { executionProviders: providers }))
    s.catch(() => sessions.delete(key))
    sessions.set(key, s)
  }
  return s
}

export async function loadImage(rel: string): Promise<ImageBitmap> {
  const res = await fetch(fileUrl(rel))
  if (!res.ok) throw new Error(`couldn't read workspace/${rel}`)
  return createImageBitmap(await res.blob())
}

function canvas(w: number, h: number) {
  const c = new OffscreenCanvas(w, h)
  return { c, g: c.getContext('2d', { willReadFrequently: true })! }
}

/** The photo drawn at w×h (or into the top-left of a padW×padH frame), as a 1×3×H×W tensor: scaled to 0–1, then normalised unless told not to. */
function toTensor(img: ImageBitmap, w: number, h: number, padW = w, padH = h, normalise = true) {
  const { g } = canvas(w, h)
  g.drawImage(img, 0, 0, w, h)
  const px = g.getImageData(0, 0, w, h).data
  const n = padW * padH
  const out = new Float32Array(3 * n) // padding stays 0, as the processor pads after normalising
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const o = y * padW + x
      for (let ch = 0; ch < 3; ch++) out[ch * n + o] = normalise ? (px[i + ch] / 255 - MEAN[ch]) / STD[ch] : px[i + ch] / 255
    }
  }
  return new ort.Tensor('float32', out, [1, 3, padH, padW])
}

/** A one-channel mask (0–255 per pixel, w×h) stretched to the photo's size and used as its transparency. */
async function cutWith(img: ImageBitmap, mask: Uint8ClampedArray, w: number, h: number, crop?: { w: number; h: number }) {
  const m = canvas(w, h)
  const md = m.g.createImageData(w, h)
  for (let i = 0; i < w * h; i++) md.data[i * 4 + 3] = mask[i]
  m.g.putImageData(md, 0, 0)
  const out = canvas(img.width, img.height)
  out.g.drawImage(m.c, 0, 0, crop?.w ?? w, crop?.h ?? h, 0, 0, img.width, img.height)
  const alpha = out.g.getImageData(0, 0, img.width, img.height)
  const photo = canvas(img.width, img.height)
  photo.g.drawImage(img, 0, 0)
  const pd = photo.g.getImageData(0, 0, img.width, img.height)
  for (let i = 3; i < pd.data.length; i += 4) pd.data[i] = alpha.data[i]
  photo.g.putImageData(pd, 0, 0)
  return photo.c.convertToBlob({ type: 'image/png' })
}

/** ormbg (IS-Net): 1024×1024 in, scaled to 0–1 and not normalised; out comes how sure it is, 0–1, that each pixel is "the thing". */
async function cutout(img: ImageBitmap) {
  const s = await session('cutout', 'onnx/model_fp16.onnx')
  const out = await s.run({ pixel_values: toTensor(img, 1024, 1024, 1024, 1024, false) })
  const alphas = out.alphas.data as Float32Array
  const mask = new Uint8ClampedArray(alphas.length)
  for (let i = 0; i < alphas.length; i++) mask[i] = alphas[i] * 255
  return cutWith(img, mask, 1024, 1024)
}

/** Depth Anything V2: the short side scaled to 518 and both sides to multiples of 14; relative depth out, near = large. */
async function depth(img: ImageBitmap) {
  const s = await session('depth', 'onnx/model.onnx')
  const scale = 518 / Math.min(img.width, img.height)
  const fit = (v: number) => Math.max(14, Math.round((v * scale) / 14) * 14)
  const w = fit(img.width)
  const h = fit(img.height)
  const out = await s.run({ pixel_values: toTensor(img, w, h) })
  const d = out.predicted_depth.data as Float32Array
  let lo = Infinity
  let hi = -Infinity
  for (const v of d) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const small = canvas(w, h)
  const sd = small.g.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const v = ((d[i] - lo) / (hi - lo || 1)) * 255 // near is light, far is dark
    sd.data[i * 4] = sd.data[i * 4 + 1] = sd.data[i * 4 + 2] = v
    sd.data[i * 4 + 3] = 255
  }
  small.g.putImageData(sd, 0, 0)
  const full = canvas(img.width, img.height)
  full.g.drawImage(small.c, 0, 0, img.width, img.height)
  return full.c.convertToBlob({ type: 'image/png' })
}

/**
 * SlimSAM: the photo's long side scaled to 1024 and padded to a square, then
 * the encoder runs once per photo (kept, so further clicks are quick) and the
 * small decoder runs per click. Of its three mask guesses, the one it scores
 * best is used.
 */
const embeddings = new Map<string, Promise<Ort.InferenceSession.OnnxValueMapType>>()
async function select(img: ImageBitmap, rel: string, points: [number, number, 0 | 1][]) {
  const scale = 1024 / Math.max(img.width, img.height)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  let emb = embeddings.get(rel)
  if (!emb) {
    emb = session('select', 'onnx/vision_encoder_quantized.onnx').then((s) => s.run({ pixel_values: toTensor(img, w, h, 1024, 1024) }))
    emb.catch(() => embeddings.delete(rel))
    embeddings.set(rel, emb)
  }
  const e = await emb
  const dec = await session('select', 'onnx/prompt_encoder_mask_decoder_quantized.onnx')
  const coords = new Float32Array(points.flatMap(([x, y]) => [x * scale, y * scale]))
  const labels = new BigInt64Array(points.map(([, , l]) => BigInt(l)))
  const out = await dec.run({
    input_points: new ort.Tensor('float32', coords, [1, 1, points.length, 2]),
    input_labels: new ort.Tensor('int64', labels, [1, 1, points.length]),
    image_embeddings: e.image_embeddings,
    image_positional_embeddings: e.image_positional_embeddings,
  })
  const scores = out.iou_scores.data as Float32Array
  const best = scores.indexOf(Math.max(...scores))
  const masks = out.pred_masks.data as Float32Array
  const side = 256
  const mask = new Uint8ClampedArray(side * side)
  for (let i = 0; i < side * side; i++) mask[i] = masks[best * side * side + i] > 0 ? 255 : 0
  // the 256² mask covers the padded 1024² square; keep the part over the photo
  return cutWith(img, mask, side, side, { w: (w / 1024) * side, h: (h / 1024) * side })
}

export interface LookRun {
  task: LookTask
  from: string
  points: [number, number, 0 | 1][]
}

/** `look <task> images/<set>/<photo> [--point x,y]… [--not x,y]…` as the helper sends it. */
export function parseLook(words: string[]): LookRun | null {
  const [cmd, task, from, ...rest] = words
  if (cmd !== 'look' || !['cutout', 'depth', 'select'].includes(task) || !from) return null
  const points: [number, number, 0 | 1][] = []
  for (let i = 0; i < rest.length; i += 2) {
    const [x, y] = rest[i + 1].split(',').map(Number)
    points.push([x, y, rest[i] === '--point' ? 1 : 0])
  }
  return { task: task as LookTask, from, points }
}

/** Where a run's picture goes: outputs/<image set>-<task>/<photo>.png */
export function outputPath(r: LookRun) {
  const [, set, file] = r.from.split('/')
  return `outputs/${set}-${r.task}/${file.replace(/\.[^.]+$/, '')}.png`
}

export async function runLook(r: LookRun): Promise<Blob> {
  const img = await loadImage(r.from)
  if (r.task === 'cutout') return cutout(img)
  if (r.task === 'depth') return depth(img)
  return select(img, r.from, r.points)
}
