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
  sees: { id: 'sees', what: 'image description', io: 'a picture in, words about it out', tabs: ['chat', 'data', 'train'] },
  looks: { id: 'looks', what: 'image tools: cut something out, distance between blobs, select a blob', io: 'a photo in, a picture made from it out', tabs: ['image segmentation'] },
  moves: { id: 'moves', what: 'gesture and pose tracking', io: 'the camera in, points on your body out', tabs: ['gesture'] },
  speaks: { id: 'speaks', what: 'voice generation', io: 'text in, a spoken voice out', tabs: ['speech'] },
  listens: { id: 'listens', what: 'speech to text', io: 'a recording in, a transcript out', tabs: ['speech'] },
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

/**
 * A vision-language model (the sees kind): a vision encoder turns a picture
 * into tokens, a projector maps them into the language model, and the same
 * kind of decoder as the writes models answers. SmolVLM's decoder is a
 * SmolLM2-sized llama.
 *
 * Checked against the installed tools, 2026-10-23 (Ollama 0.40.6, mlx-vlm 0.7.10):
 * - SmolVLM isn't in Ollama's library, so `ollama pull` can't get it. ggml-org
 *   publishes it as two GGUF files, the language model and the projector
 *   (vision encoder + connector); a Modelfile with two FROM lines makes an
 *   Ollama model that takes pictures.
 * - It trains (LoRA on the language half) from the Hugging Face repo with
 *   mlx_vlm.train. Ollama won't take a safetensors folder and a GGUF in one
 *   Modelfile, and a safetensors import alone loses the projector, so export
 *   writes the trained weights into a copy of the base GGUF instead
 *   (python/variable_machine/vlm_export.py) and keeps the base projector.
 */
export interface SeeModel {
  /** the folder under workspace/tools/ and the word in `model get <name>` */
  name: string
  kind: 'sees'
  /** what it is called in Ollama once made */
  tag: string
  /** the Hugging Face repo training starts from */
  hf: string
  /** the GGUF repo Ollama runs it from, and its two files */
  repo: string
  gguf: string
  mmproj: string
  license: string
  maker: string
  builtFor: string
  params: string
  /** about how much it downloads */
  mb: number
  /** decoder layers: training can adapt at most this many */
  layers: number
  /** about how much memory LoRA takes, measured */
  loraGB: number
}

export const SEE_MODELS: SeeModel[] = [
  {
    name: 'smolvlm-256m',
    kind: 'sees',
    tag: 'smolvlm:256m',
    hf: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    repo: 'ggml-org/SmolVLM-256M-Instruct-GGUF',
    gguf: 'SmolVLM-256M-Instruct-Q8_0.gguf',
    mmproj: 'mmproj-SmolVLM-256M-Instruct-f16.gguf',
    license: 'Apache 2.0',
    maker: 'Hugging Face, 2025',
    builtFor: 'The smallest model that looks at a picture and answers in words: what is in it, what it says, what is going on. Its language half is the same size as SmolLM2. It is often wrong about details, and it is quick to train on any 16GB Mac.',
    params: '256M',
    mb: 365,
    layers: 30,
    loraGB: 4.5,
  },
  {
    name: 'smolvlm-500m',
    kind: 'sees',
    tag: 'smolvlm:500m',
    hf: 'HuggingFaceTB/SmolVLM-500M-Instruct',
    repo: 'ggml-org/SmolVLM-500M-Instruct-GGUF',
    gguf: 'SmolVLM-500M-Instruct-Q8_0.gguf',
    mmproj: 'mmproj-SmolVLM-500M-Instruct-f16.gguf',
    license: 'Apache 2.0',
    maker: 'Hugging Face, 2025',
    builtFor: 'The larger SmolVLM: the same idea, with a bigger language half, so its descriptions are steadier. Slower to train.',
    params: '500M',
    mb: 636,
    layers: 32,
    loraGB: 7,
  },
]

export const seeModel = (name: string) => SEE_MODELS.find((s) => s.name === name || s.tag === name || s.hf === name)

/**
 * SmolVLM's chat format, as its processor writes it for training:
 * <|im_start|>User:<image>What is this?<end_of_utterance>\nAssistant: …
 * Ollama puts the picture at the start of the message that carries it.
 */
export const SMOLVLM_TEMPLATE = `<|im_start|>{{- range .Messages }}{{ if eq .Role "user" }}User:{{ else if eq .Role "assistant" }}Assistant:{{ else }}System:{{ end }}{{ .Content }}<end_of_utterance>
{{ end }}Assistant:`

/** The Modelfile that makes an Ollama model from a language-model GGUF and the projector GGUF beside it. */
export function seeModelfile(o: { gguf: string; mmproj: string; license: string; note: string }) {
  return [
    `# ${o.note}`,
    `FROM ${o.gguf}`,
    `FROM ${o.mmproj}`,
    `TEMPLATE """${SMOLVLM_TEMPLATE}"""`,
    'PARAMETER stop "<end_of_utterance>"',
    'PARAMETER temperature 0.2',
    `LICENSE """${o.license}"""`,
    '',
  ].join('\n')
}

/**
 * The voice models (the speaks and listens kinds), run by mlx-audio in the
 * python project's `voice` extra. Checked 2026-10-24 with mlx-audio 0.6.1:
 * - Kokoro-82M (the first choice to speak) needs misaki's English, which falls
 *   back to espeak-ng (GPL-3.0) through espeakng-loader, whose Mac wheel looks
 *   for its data where it was built and fails. Soprano-1.1-80M needs neither.
 * - Whisper (the first choice to listen), as mlx-audio runs it, invents words
 *   after a short clip or repeats the clip over and over, whatever the settings.
 *   Qwen3-ASR-0.6B transcribed the same clips exactly, with punctuation, in a
 *   few seconds, and it knows 52 languages and dialects.
 * - Both read WAV without ffmpeg, so the page records WAV.
 * They download from Hugging Face into workspace/hf the first time they run.
 */
export interface VoiceModel {
  name: string
  kind: 'speaks' | 'listens'
  repo: string
  /** where the weights come from, when the repo is a conversion */
  original: string
  license: string
  maker: string
  builtFor: string
  /** about how much it downloads */
  mb: number
}

export const VOICE_MODELS: VoiceModel[] = [
  {
    name: 'soprano',
    kind: 'speaks',
    repo: 'mlx-community/Soprano-1.1-80M-bf16',
    original: 'ekwek/Soprano-1.1-80M',
    license: 'Apache 2.0',
    maker: 'Eugene Kwek (Soprano), 2025',
    builtFor: 'Reads English text aloud in one clear voice. Small (80M) and quick: a sentence takes a second or two once it is loaded. It has one voice on purpose: no copying of anyone else\'s.',
    mb: 284,
  },
  {
    name: 'qwen3-asr',
    kind: 'listens',
    repo: 'mlx-community/Qwen3-ASR-0.6B-8bit',
    original: 'Qwen/Qwen3-ASR-0.6B',
    license: 'Apache 2.0',
    maker: 'Alibaba (Qwen team), 2026',
    builtFor: 'Writes down what it hears, with punctuation, in 52 languages and dialects. A small speech model (0.6B), here in 8-bit so it loads quickly on a laptop.',
    mb: 1011,
  },
]

export const voiceModel = (kind: 'speaks' | 'listens') => VOICE_MODELS.find((v) => v.kind === kind)!

/** What a recording may be: WAV, which the models read without ffmpeg. */
export const AUDIO_EXT = /\.wav$/i

/**
 * The trackers (the moves kind): MediaPipe's hand and body landmarkers, run in
 * the page by @mediapipe/tasks-vision (Apache 2.0). They find the points; the
 * student's own k-NN (shared/gesture.ts) names the gesture. Each is one .task
 * file from Google's MediaPipe model store, downloaded with curl into
 * workspace/tools/<name>/ like the image tools.
 */
export interface TrackerModel {
  name: 'hands' | 'body'
  kind: 'moves'
  file: string
  url: string
  license: string
  maker: string
  builtFor: string
  mb: number
}

export const TRACKER_MODELS: TrackerModel[] = [
  {
    name: 'hands',
    kind: 'moves',
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
    license: 'Apache 2.0',
    maker: 'Google (MediaPipe), 2023',
    builtFor: 'Finds hands in the camera picture and 21 points on each: the wrist, and four along every finger. Quick enough to follow a hand as it moves.',
    mb: 8,
  },
  {
    name: 'body',
    kind: 'moves',
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
    license: 'Apache 2.0',
    maker: 'Google (MediaPipe BlazePose), 2023',
    builtFor: 'Finds a person and 33 points on the body: face, shoulders, elbows, wrists, hips, knees, ankles. The lite version, made for laptops and phones.',
    mb: 6,
  },
]

export const trackerModel = (name: string) => TRACKER_MODELS.find((t) => t.name === name)
