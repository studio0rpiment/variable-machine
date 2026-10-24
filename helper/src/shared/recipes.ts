/**
 * The recipes' real commands (plan §6), built in one place so the Train panel
 * previews exactly what the helper will run. Shared, no imports beyond types.
 *
 * Checked against the installed tools (plan §13), 2026-10-18:
 * - mlx-lm 0.32.2: every flag below exists; rank/scale/dropout go in the
 *   config file under lora_parameters.
 * - mlx_lm.fuse --export-gguf writes a GGUF that Ollama 0.40.6 cannot load
 *   ("invalid gguf type for tokenizer.ggml.token_type"), and Ollama only
 *   quantizes safetensors imports (int4 / int8 / nvfp4 / mxfp4 / mxfp8, not
 *   q4_K_M). So register imports the fused safetensors folder directly and
 *   the GGUF step is skipped.
 */

export type Tier = '16' | '32' | '64+'
export type FineTune = 'lora' | 'dora' | 'full'
export type Quantize = 'int8' | 'int4' | 'none'

export interface TrainParams {
  name: string
  base: string
  data: string
  type: FineTune
  rank: number
  layers: number
  lr: number
  iters: number
  batch: number
  maxSeq: number
  evalEvery: number
}

/** Plan §11. */
export const TIER_DEFAULTS: Record<Tier, Omit<TrainParams, 'name' | 'data'>> = {
  '16': { base: 'HuggingFaceTB/SmolLM2-360M-Instruct', type: 'lora', rank: 8, layers: 8, lr: 1e-4, iters: 200, batch: 4, maxSeq: 1024, evalEvery: 50 },
  '32': { base: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', type: 'lora', rank: 16, layers: 16, lr: 1e-4, iters: 200, batch: 4, maxSeq: 2048, evalEvery: 50 },
  '64+': { base: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', type: 'dora', rank: 16, layers: 16, lr: 1e-4, iters: 200, batch: 8, maxSeq: 2048, evalEvery: 50 },
}

/** Every Python command runs in the python/ project, with Hugging Face downloads landing in the workspace. */
export const PY_ENV = { HF_HOME: 'workspace/hf' }
export const UV = ['uv', 'run', '--project', 'python']
/** The same, with the extra packages for models that see (mlx-vlm, gguf); uv installs them on first use. */
export const UV_SEES = [...UV, '--extra', 'sees']

/**
 * Training a model that sees on a picture dataset (mlx-vlm 0.7.10, through
 * python/variable_machine/vlm_train.py, which keeps SmolVLM's attention
 * causal in training), checked on SmolVLM-256M, 2026-10-23: LoRA on the
 * language half, about 4.4GB at batch 1, about 2.4s a step on an M1 Pro.
 * With --train-on-completions (only the answers are learned, like mlx-lm's
 * --mask-prompt) the 16-row museum label example goes from loss 5.1 to 0.01
 * in 60 steps at 1e-4, and answers with its labels in Ollama. A picture is
 * about 900 tokens, so max seq stays at 2048. mlx-vlm adapts every layer of
 * the language half; there is no layers setting.
 */
export const SEES_DEFAULTS: Omit<TrainParams, 'name' | 'data'> = { base: 'HuggingFaceTB/SmolVLM-256M-Instruct', type: 'lora', rank: 8, layers: 30, lr: 1e-4, iters: 60, batch: 1, maxSeq: 2048, evalEvery: 20 }

export function seesTrainArgs(p: TrainParams): string[] {
  return [
    ...UV_SEES,
    // mlx_vlm.train itself, with SmolVLM's causal mask kept in training (see the script)
    'python', 'python/variable_machine/vlm_train.py',
    '--model', p.base,
    '--data', `workspace/data/${p.data}`,
    '--train-type', p.type,
    '--lora-rank', String(p.rank),
    '--iters', String(p.iters),
    '--learning-rate', String(p.lr),
    '--batch-size', String(p.batch),
    '--max-seq-length', String(p.maxSeq),
    '--steps-per-report', '5',
    '--steps-per-eval', String(p.evalEvery),
    '--train-on-completions',
    '--output-path', `workspace/adapters/${p.name}`,
  ]
}

/** The `train` line for a picture dataset: the same command, without the settings mlx-vlm doesn't take. */
export function seesTrainLine(p: TrainParams): string[] {
  return ['train', p.name, '--base', p.base, '--data', p.data, '--rank', String(p.rank), '--lr', String(p.lr), '--iters', String(p.iters), '--batch', String(p.batch), '--max-seq', String(p.maxSeq), '--eval-every', String(p.evalEvery)]
}

export const runConfigYaml = (p: TrainParams) =>
  `# mlx-lm config for this run; command-line flags fill everything else\nlora_parameters:\n  rank: ${p.rank}\n  scale: 20.0\n  dropout: 0.0\n`

export function trainArgs(p: TrainParams, runDir: string): string[] {
  return [
    ...UV,
    'mlx_lm.lora',
    '--model', p.base,
    '--train',
    '--data', `workspace/data/${p.data}`,
    '--fine-tune-type', p.type,
    '--num-layers', String(p.layers),
    '--iters', String(p.iters),
    '--learning-rate', String(p.lr),
    '--batch-size', String(p.batch),
    '--max-seq-length', String(p.maxSeq),
    '--steps-per-report', '5',
    '--steps-per-eval', String(p.evalEvery),
    '--adapter-path', `workspace/adapters/${p.name}`,
    '--mask-prompt',
    '--config', `${runDir}/config.yaml`,
  ]
}

/** The recipe line itself, as typed in the terminal. */
export function trainLine(p: TrainParams): string[] {
  return ['train', p.name, '--base', p.base, '--data', p.data, '--type', p.type, '--rank', String(p.rank), '--layers', String(p.layers), '--lr', String(p.lr), '--iters', String(p.iters), '--batch', String(p.batch), '--max-seq', String(p.maxSeq), '--eval-every', String(p.evalEvery)]
}

/** adapterDir is 'adapters' for trained adapters, 'merges' for merged ones. */
export const fuseArgs = (base: string, adapter: string, out: string, adapterDir: 'adapters' | 'merges' = 'adapters') => [...UV, 'mlx_lm.fuse', '--model', base, '--adapter-path', `workspace/${adapterDir}/${adapter}`, '--save-path', `workspace/fused/${out}`]

export type MergeMethod = 'linear'

export const mergeArgs = (a: string, b: string, t: number, out: string) => [
  ...UV,
  'python',
  'python/variable_machine/merge_adapters.py',
  '--a', `workspace/adapters/${a}`,
  '--b', `workspace/adapters/${b}`,
  '--t', String(t),
  '--out', `workspace/merges/${out}`,
]

export const mergeLine = (name: string, a: string, b: string, t: number, method: MergeMethod = 'linear') => ['merge', name, '--a', a, '--b', b, '--t', String(t), '--method', method]

/** SmolLM2's chat template (ChatML), as Ollama's own smollm2 models carry it. Imported models don't bring one, so register writes it into the Modelfile. */
export const CHATML_TEMPLATE = `{{- if .Messages }}
{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}
{{- range $i, $_ := .Messages }}
{{- $last := eq (len (slice $.Messages $i)) 1 -}}
{{- if eq .Role "user" }}<|im_start|>user
{{ .Content }}<|im_end|>
{{ else if eq .Role "assistant" }}<|im_start|>assistant
{{ .Content }}{{ if not $last }}<|im_end|>
{{ end }}
{{- end }}
{{- if and (ne .Role "assistant") $last }}<|im_start|>assistant
{{ end }}
{{- end }}
{{- else }}
{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
{{ end }}{{ .Response }}{{ if .Response }}<|im_end|>{{ end }}`

export function registerModelfile(o: { fused: string; template?: 'chatml'; system?: string; license: string; base: string; adapter: string }) {
  return [
    `# made by Variable Machine from adapter ${o.adapter} on ${o.base}`,
    `FROM ../fused/${o.fused}`,
    ...(o.template === 'chatml' ? [`TEMPLATE """${CHATML_TEMPLATE}"""`, 'PARAMETER stop "<|im_start|>"', 'PARAMETER stop "<|im_end|>"'] : []),
    'PARAMETER temperature 0.7',
    ...(o.system ? [`SYSTEM """${o.system}"""`] : []),
    `LICENSE """${o.license}"""`,
    '',
  ].join('\n')
}

export const createArgs = (model: string, quantize: Quantize) => ['ollama', 'create', model, ...(quantize === 'none' ? [] : ['-q', quantize]), '-f', `workspace/modelfiles/${model}.Modelfile`]

/**
 * mlx-lm 0.32.2 prints a table even when its output is a file:
 *    iter   train_loss     tok/s     tokens
 *       5    2.621 ▼        214       1.6k
 *      10    val 2.199    2.92s
 * mlx-vlm 0.7.10 prints blocks of key=value lines under a heading:
 *    Training (iteration 40):
 *    optimizer_step=40, train_loss=0.395, train_nll=0.395, …
 *    tokens_per_second=414.93, …
 *    Validation (iteration 40):
 *    val_loss=0.28669, …
 * Its validation line doesn't repeat the iteration, so `state` carries the
 * last heading's along (a run passes one; a stray line without it reads as 0).
 * Returns what a line says, or null.
 */
export function parseTrainLine(line: string, state?: { iter: number }): { iter: number; trainLoss?: number; valLoss?: number; tokensPerSec?: number } | null {
  // mlx-lm can draw a progress bar and then rewrite the line (\r, erase-line) with the report:
  // keep only what is left after the last carriage return, without any terminal codes.
  const plain = (line.split('\r').pop() ?? '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  const heading = /^(?:Training|Validation) \(iteration (\d+)\):/.exec(plain)
  if (heading) {
    if (state) state.iter = Number(heading[1])
    return null
  }
  const vlmTrain = /\boptimizer_step=(\d+), train_loss=([\d.eE+-]+)/.exec(plain)
  if (vlmTrain) return { iter: Number(vlmTrain[1]), trainLoss: Number(vlmTrain[2]) }
  const vlmVal = /^val_loss=([\d.eE+-]+)/.exec(plain)
  if (vlmVal) return { iter: state?.iter ?? 0, valLoss: Number(vlmVal[1]) }
  const val = /^\s*(\d+)\s+val\s+([\d.]+)/.exec(plain)
  if (val) return { iter: Number(val[1]), valLoss: Number(val[2]) }
  const train = /^\s*(\d+)\s+([\d.]+)\s*[▼▲=•-]?\s+([\d.]+)(k?)\s+[\d.,]+k?\s*$/.exec(plain)
  if (train) return { iter: Number(train[1]), trainLoss: Number(train[2]), tokensPerSec: Number(train[3]) * (train[4] ? 1000 : 1) }
  return null
}

export interface PreferParams {
  name: string
  /** a Hugging Face id, or workspace/fused/<name> */
  model: string
  data: string
  beta: number
  iters: number
  lr: number
  rank: number
  layers: number
  /** weight of the chosen answer's likelihood term; 0 is plain DPO */
  sft: number
}

/** DPO is our own script on mlx-lm (python/variable_machine/dpo.py); see its docstring for why not mlx-tune. */
export const preferArgs = (p: PreferParams, runDir: string) => [
  ...UV,
  'python',
  'python/variable_machine/dpo.py',
  '--model', p.model,
  '--data', `workspace/data/${p.data}`,
  '--adapter-path', `workspace/adapters/${p.name}`,
  '--run-dir', runDir,
  '--beta', String(p.beta),
  '--iters', String(p.iters),
  '--learning-rate', String(p.lr),
  '--rank', String(p.rank),
  '--layers', String(p.layers),
  ...(p.sft > 0 ? ['--sft', String(p.sft)] : []),
]

export const preferLine = (p: PreferParams) => ['prefer', p.name, '--model', p.model, '--data', p.data, '--beta', String(p.beta), '--iters', String(p.iters), '--lr', String(p.lr), '--rank', String(p.rank), '--layers', String(p.layers), ...(p.sft > 0 ? ['--sft', String(p.sft)] : [])]
