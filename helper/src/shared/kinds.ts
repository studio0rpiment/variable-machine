/**
 * The kinds of model Variable Machine works with, and the ready-made tool
 * models that run in the page. Shared by helper and UI.
 *
 * Each kind has a one-word name, a plain description of what it does, and
 * the tabs where you use it, so the Models tab, the tab explanations and the
 * map all say the same thing about it.
 */

export type KindId = 'writes' | 'sees' | 'looks' | 'moves' | 'speaks' | 'listens'

export interface KindInfo {
  id: KindId
  /** what it does, in a few words: the description shown with the one-word name */
  what: string
  /** what goes in and what comes out */
  io: string
  /** the tabs where you use it, in the order you'd use them */
  tabs: string[]
  /** not built yet: shown so the map is honest about what is coming */
  soon?: boolean
}

export const KINDS: Record<KindId, KindInfo> = {
  writes: { id: 'writes', what: 'text generation', io: 'text in, text out', tabs: ['modelfile', 'train', 'prefer', 'merge', 'chat'] },
  sees: { id: 'sees', what: 'image description', io: 'a picture in, words about it out', tabs: ['chat', 'train'], soon: true },
  looks: { id: 'looks', what: 'image tools: cut something out, distance between blobs, select a blob', io: 'a photo in, a picture made from it out', tabs: ['look'] },
  moves: { id: 'moves', what: 'gesture and pose tracking', io: 'the camera in, points on your body out', tabs: ['move'], soon: true },
  speaks: { id: 'speaks', what: 'voice generation', io: 'text in, a spoken voice out', tabs: ['voice'], soon: true },
  listens: { id: 'listens', what: 'speech to text', io: 'a recording in, a transcript out', tabs: ['voice'], soon: true },
}

export type LookTask = 'cutout' | 'depth' | 'select'

/**
 * A ready-made model that runs in the page with onnxruntime-web. Its files
 * are downloaded into workspace/tools/<name>/ with curl, so they are files you
 * can see (not a hidden browser cache), and the page loads them from there.
 */
export interface ToolModel {
  /** short name: the folder under workspace/tools/ and the word in `model get <name>` */
  name: string
  kind: KindId
  task: LookTask
  /** what the Look tab and its card call it */
  action: string
  repo: string
  /** expected license; `model get` reads the current one from Hugging Face */
  license: string
  maker: string
  builtFor: string
  /** files to fetch, relative to the repo root */
  files: string[]
  /** about how much it downloads */
  mb: number
  /** webgpu: needs a browser with WebGPU; any: falls back to WebAssembly */
  needs: 'webgpu' | 'any'
}

export const TOOL_MODELS: ToolModel[] = [
  {
    name: 'cutout',
    kind: 'looks',
    task: 'cutout',
    action: 'cut something out',
    repo: 'onnx-community/ormbg-ONNX',
    license: 'Apache 2.0',
    maker: 'Schirrmacher (ormbg, from IS-Net), 2024',
    builtFor: 'Finds the main object in a photo, the blob that stands out, and separates it from the background, so you get it on a transparent background. Its maker built it mostly for photos of people, from made-up 3D renders plus public research photo sets; it works on other objects when one blob stands out clearly.',
    files: ['config.json', 'preprocessor_config.json', 'onnx/model_fp16.onnx'],
    mb: 88,
    needs: 'any',
  },
  {
    name: 'depth',
    kind: 'looks',
    task: 'depth',
    action: 'distance between blobs',
    repo: 'onnx-community/depth-anything-v2-small',
    license: 'Apache 2.0',
    maker: 'Yang et al. (Depth Anything V2), 2024',
    builtFor: 'Guesses how near or far each blob and each part of a photo is, from a single picture: a depth map. Near is light, far is dark. Smaller versions of a model are often open-license, while larger versions are for research, with non-commercial licenses.',
    files: ['config.json', 'preprocessor_config.json', 'onnx/model.onnx'],
    mb: 99,
    needs: 'any',
  },
  {
    name: 'select',
    kind: 'looks',
    task: 'select',
    action: 'select a blob',
    repo: 'Xenova/slimsam-77-uniform',
    license: 'Apache 2.0',
    maker: 'Chen et al. (SlimSAM, from Meta\'s Segment Anything), 2023',
    builtFor: 'Click on an object in a photo and it outlines that blob. Click again to add to it. A slimmed-down Segment Anything, small enough to run in the page.',
    files: ['config.json', 'preprocessor_config.json', 'onnx/vision_encoder_quantized.onnx', 'onnx/prompt_encoder_mask_decoder_quantized.onnx'],
    mb: 14,
    needs: 'any',
  },
]

export const toolModel = (name: string) => TOOL_MODELS.find((t) => t.name === name)

/** The photos the image tools take: what an image set may hold. */
export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i
