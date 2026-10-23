import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { status } from './status.ts'
import { OLLAMA_URL } from './config.ts'
import { ollamaPost } from './ollama.ts'
import { runRecipe, type Step } from './pipeline.ts'
import { HF_BASES } from './shared/library.ts'
import type { DatasetManifest, Manifest } from './shared/manifest.ts'
import {
  PY_ENV,
  TIER_DEFAULTS,
  createArgs,
  fuseArgs,
  mergeArgs,
  parseTrainLine,
  preferArgs,
  registerModelfile,
  runConfigYaml,
  trainArgs,
  type FineTune,
  type PreferParams,
  type Quantize,
  type TrainParams,
} from './shared/recipes.ts'

/**
 * The recipes behind `train`, `fuse`, `register` and `export` (plan §6).
 * Each composes real commands and hands them to the pipeline runner; the
 * manifests they write make the chain data → run → adapter → fused → Ollama
 * model readable by following `inputs`.
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ws = (...p: string[]) => path.join(WORKSPACE, ...p)
const now = () => new Date().toISOString()
const exists = (p: string) => fs.access(p).then(() => true, () => false)
const readJson = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return null
  }
}
const writeJson = (p: string, v: unknown) => fs.writeFile(p, JSON.stringify(v, null, 2) + '\n')

function flags(words: string[]) {
  const pos: string[] = []
  const opts: Record<string, string> = {}
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('--')) opts[words[i].slice(2)] = words[++i] ?? ''
    else pos.push(words[i])
  }
  return { pos, opts }
}

function only(opts: Record<string, string>, allowed: string[], cmd: string) {
  const bad = Object.keys(opts).find((k) => !allowed.includes(k))
  if (bad) print(`${cmd}: unknown option --${bad} (takes ${allowed.map((a) => `--${a}`).join(' ')})`)
  return !bad
}

/**
 * Memory guard (plan §3.1.7): MLX and a loaded chat model don't fit together
 * on 16GB, so every model Ollama has in memory is unloaded first. Ollama
 * reloads one on the next chat.
 */
const unloadStep: Step = {
  kind: 'do',
  display: 'ollama stop <every loaded model>   (free memory for MLX)',
  run: async () => {
    const res = await fetch(new URL('/api/ps', OLLAMA_URL)).catch(() => null)
    const { models = [] } = ((await res?.json().catch(() => ({}))) ?? {}) as { models?: { name: string }[] }
    if (!models.length) return print('  nothing loaded')
    for (const m of models) {
      await ollamaPost('/api/generate', { model: m.name, keep_alive: 0 })
      print(`  stopped ${m.name}`)
    }
  },
}

/** Licenses of a trained artifact: the base's and the data's, both carried along. */
const licenseOf = (base: string, data: DatasetManifest | null) =>
  `${HF_BASES.find((b) => b.id === base)?.license ?? 'unknown'} (base ${base}) + ${data?.license ?? 'unknown'} (data ${data?.name ?? '?'})`

/* ---------- train ---------- */

async function train(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  if (!only(opts, ['base', 'data', 'type', 'rank', 'layers', 'lr', 'iters', 'batch', 'max-seq', 'eval-every'], 'train')) return false
  const d = TIER_DEFAULTS[status.tier]
  const p: TrainParams = {
    name: pos[0] ?? '',
    base: opts.base ?? d.base,
    data: opts.data ?? '',
    type: (opts.type ?? d.type) as FineTune,
    rank: Number(opts.rank ?? d.rank),
    layers: Number(opts.layers ?? d.layers),
    lr: Number(opts.lr ?? d.lr),
    iters: Number(opts.iters ?? d.iters),
    batch: Number(opts.batch ?? d.batch),
    maxSeq: Number(opts['max-seq'] ?? d.maxSeq),
    evalEvery: Number(opts['eval-every'] ?? d.evalEvery),
  }
  if (!NAME.test(p.name) || !p.data) {
    print('usage: train <adapter-name> --data <dataset> [--base <hf id>] [--type lora|dora|full] [--rank 8] [--layers 8] [--lr 1e-4] [--iters 200] [--batch 4] [--max-seq 1024] [--eval-every 50]')
    return false
  }
  if (!['lora', 'dora', 'full'].includes(p.type) || [p.rank, p.layers, p.lr, p.iters, p.batch, p.maxSeq, p.evalEvery].some((n) => !Number.isFinite(n) || n === 0)) {
    print('train: --type is lora, dora or full; the numbers must be numbers')
    return false
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(p.base)) {
    print('train: --base is a Hugging Face model id, like HuggingFaceTB/SmolLM2-360M-Instruct')
    return false
  }
  // mlx-lm refuses more layers than the model has, after loading it; say so before starting.
  const known = HF_BASES.find((b) => b.id === p.base)
  if (known && p.layers > known.layers) {
    print(`train: ${p.base.split('/')[1]} has ${known.layers} layers, so --layers can be at most ${known.layers}`)
    return false
  }
  if (/4bit|3bit|8bit|bnb|awq|gptq/i.test(p.base)) {
    print('train: train on an fp16/bf16 base, not a quantized repo (plan §8)')
    return false
  }
  const data = await readJson<DatasetManifest>(ws('data', p.data, 'manifest.json'))
  if (!data) {
    print(`train: no dataset ${p.data} in workspace/data`)
    return false
  }
  if (!data.counts.valid) {
    print(`train: ${p.data} has no validation rows; run data split ${p.data} first`)
    return false
  }
  if (await exists(ws('adapters', p.name))) {
    print(`train: workspace/adapters/${p.name} already exists; choose another name`)
    return false
  }
  if (status.tier === '16' && /1\.7B/i.test(p.base) && p.batch > 1) print('  note: 1.7B on a 16GB machine wants --batch 1; this may run out of memory')

  const stamp = now().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const runName = `${stamp}-${p.name}`
  const runDir = ws('runs', runName)
  const runRel = `workspace/runs/${runName}`
  const argv = trainArgs(p, runRel)
  const started = Date.now()
  const losses: { iter: number; trainLoss?: number; valLoss?: number; tokensPerSec?: number }[] = []
  await fs.mkdir(runDir, { recursive: true })
  const lossFile = path.join(runDir, 'loss.jsonl')
  await fs.writeFile(lossFile, '')

  const manifest = (ok: boolean | null) => ({
    name: runName,
    kind: 'run',
    created: new Date(started).toISOString(),
    license: licenseOf(p.base, data),
    inputs: [p.base, `workspace/data/${p.data}`],
    command: [line, [...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...argv].join(' ')],
    recipe: 'train',
    params: p,
    adapter: `workspace/adapters/${p.name}`,
    status: ok === null ? 'running' : ok ? 'finished' : 'failed',
    seconds: ok === null ? undefined : Math.round((Date.now() - started) / 1000),
    final: { trainLoss: losses.findLast((l) => l.trainLoss !== undefined)?.trainLoss, valLoss: losses.findLast((l) => l.valLoss !== undefined)?.valLoss },
  })

  const ok = await runRecipe({
    recipe: 'train',
    params: p,
    logFile: path.join(runDir, 'log.txt'),
    outputs: [`workspace/adapters/${p.name}`, runRel],
    steps: [
      unloadStep,
      {
        kind: 'do',
        display: `write ${runRel}/config.yaml, command.txt, manifest.json`,
        run: async () => {
          await fs.writeFile(path.join(runDir, 'config.yaml'), runConfigYaml(p))
          await fs.writeFile(path.join(runDir, 'command.txt'), [line, '', [...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...argv].join(' '), ''].join('\n'))
          await writeJson(path.join(runDir, 'manifest.json'), manifest(null))
        },
      },
      {
        kind: 'spawn',
        argv,
        env: PY_ENV,
        onLine: (l, runId) => {
          const m = parseTrainLine(l)
          if (!m) return
          losses.push(m)
          void fs.appendFile(lossFile, JSON.stringify(m) + '\n')
          broadcast({ type: 'pipeline.metric', runId, ...m })
        },
      },
      {
        kind: 'do',
        display: `write manifests: workspace/adapters/${p.name}, workspace/hf/${p.base.replace('/', '--')}`,
        run: async () => {
          const adapter: Manifest = {
            name: p.name,
            kind: 'adapter',
            created: now(),
            license: licenseOf(p.base, data),
            inputs: [p.base, `workspace/data/${p.data}`, runRel],
            command: [line],
            method: p.type,
            base: p.base,
            data: p.data,
            run: runName,
            rank: p.rank,
            layers: p.layers,
            scale: 20,
            iters: p.iters,
            final: manifest(true).final,
          }
          await writeJson(ws('adapters', p.name, 'manifest.json'), adapter)
          await writeBaseManifest(p.base, argv)
        },
      },
    ],
  })
  await writeJson(path.join(runDir, 'manifest.json'), manifest(ok))
  return ok
}

/** workspace/hf/<org--name>/manifest.json: the trains-on inventory entry, with the license read from Hugging Face. */
async function writeBaseManifest(base: string, argv: string[]) {
  const file = ws('hf', base.replace('/', '--'), 'manifest.json')
  if (await exists(file)) return
  let license = HF_BASES.find((b) => b.id === base)?.license ?? 'unknown'
  let checked = false
  try {
    const d = (await (await fetch(`https://huggingface.co/api/models/${base}`)).json()) as { cardData?: { license?: string } }
    if (d.cardData?.license) {
      license = d.cardData.license === 'apache-2.0' ? 'Apache 2.0' : d.cardData.license
      checked = true
    }
  } catch {
    // offline: keep the listed license
  }
  await fs.mkdir(path.dirname(file), { recursive: true })
  await writeJson(file, {
    name: base,
    kind: 'hf-base',
    created: now(),
    license,
    licenseChecked: checked,
    inputs: [`https://huggingface.co/${base}`],
    command: [argv.join(' ')],
    cache: `workspace/hf/hub/models--${base.replace('/', '--')}`,
  })
}

/* ---------- prefer (DPO) ---------- */

async function prefer(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  if (!only(opts, ['model', 'data', 'beta', 'iters', 'lr', 'rank', 'layers'], 'prefer')) return false
  const p: PreferParams = {
    name: pos[0] ?? '',
    model: opts.model ?? HF_BASES[0].id,
    data: opts.data ?? '',
    beta: Number(opts.beta ?? 0.1),
    iters: Number(opts.iters ?? 100),
    lr: Number(opts.lr ?? 2e-5),
    rank: Number(opts.rank ?? 8),
    layers: Number(opts.layers ?? 8),
  }
  if (!NAME.test(p.name) || !p.data) {
    print('usage: prefer <adapter-name> --data <preference set> [--model <hf id or workspace/fused/NAME>] [--beta 0.1] [--iters 100] [--lr 2e-5] [--rank 8] [--layers 8]')
    return false
  }
  if ([p.beta, p.iters, p.lr, p.rank, p.layers].some((n) => !Number.isFinite(n) || n <= 0)) return print('prefer: the numbers must be positive numbers'), false
  const knownBase = HF_BASES.find((b) => b.id === p.model)
  if (knownBase && p.layers > knownBase.layers) return print(`prefer: ${p.model.split('/')[1]} has ${knownBase.layers} layers, so --layers can be at most ${knownBase.layers}`), false
  // The model is a Hugging Face id or a fused model in the workspace, nothing else.
  let hfBase = p.model
  if (p.model.startsWith('workspace/fused/')) {
    const fused = await readJson<{ base: string; hfBase?: string }>(ws('fused', p.model.slice('workspace/fused/'.length), 'manifest.json'))
    if (!fused) return print(`prefer: no fused model at ${p.model}`), false
    hfBase = fused.hfBase ?? fused.base
  } else if (!/^[\w.-]+\/[\w.-]+$/.test(p.model)) return print('prefer: --model is a Hugging Face id or workspace/fused/<name>'), false
  const data = await readJson<DatasetManifest>(ws('data', p.data, 'manifest.json'))
  if (!data || data.format !== 'preference') return print(`prefer: ${p.data} is not a preference set (data new <name> --format preference)`), false
  if (data.counts.train < 2 || !data.counts.valid) return print(`prefer: ${p.data} needs at least 2 pairs and some held out; run data split ${p.data}`), false
  if (await exists(ws('adapters', p.name))) return print(`prefer: workspace/adapters/${p.name} already exists; choose another name`), false

  const stamp = now().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const runName = `${stamp}-${p.name}`
  const runDir = ws('runs', runName)
  const runRel = `workspace/runs/${runName}`
  const argv = preferArgs(p, runRel)
  const shown = [...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...argv].join(' ')
  const started = Date.now()
  await fs.mkdir(runDir, { recursive: true })
  const lossFile = path.join(runDir, 'loss.jsonl')
  await fs.writeFile(lossFile, '')
  const results = () => readJson<{ heldOut: { n: number; before: number; after: number; rewardAccuracy?: number } }>(path.join(runDir, 'results.json'))
  const manifest = async (ok: boolean | null) => ({
    name: runName,
    kind: 'run',
    created: new Date(started).toISOString(),
    license: licenseOf(hfBase, data),
    inputs: [p.model, `workspace/data/${p.data}`],
    command: [line, shown],
    recipe: 'prefer',
    params: p,
    adapter: `workspace/adapters/${p.name}`,
    status: ok === null ? 'running' : ok ? 'finished' : 'failed',
    seconds: ok === null ? undefined : Math.round((Date.now() - started) / 1000),
    heldOut: (await results())?.heldOut,
  })

  const ok = await runRecipe({
    recipe: 'prefer',
    params: p,
    logFile: path.join(runDir, 'log.txt'),
    outputs: [`workspace/adapters/${p.name}`, runRel],
    steps: [
      unloadStep,
      {
        kind: 'do',
        display: `write ${runRel}/command.txt, manifest.json`,
        run: async () => {
          await fs.writeFile(path.join(runDir, 'command.txt'), [line, '', shown, ''].join('\n'))
          await writeJson(path.join(runDir, 'manifest.json'), await manifest(null))
        },
      },
      {
        kind: 'spawn',
        argv,
        env: PY_ENV,
        onLine: (l, runId) => {
          const m = parseTrainLine(l)
          if (!m) return
          void fs.appendFile(lossFile, JSON.stringify(m) + '\n')
          broadcast({ type: 'pipeline.metric', runId, ...m })
        },
      },
      {
        kind: 'do',
        display: `write workspace/adapters/${p.name}/manifest.json`,
        run: async () => {
          await writeJson(ws('adapters', p.name, 'manifest.json'), {
            name: p.name,
            kind: 'adapter',
            created: now(),
            license: licenseOf(hfBase, data),
            inputs: [p.model, `workspace/data/${p.data}`, runRel],
            command: [line],
            method: 'dpo',
            base: p.model,
            hfBase,
            data: p.data,
            run: runName,
            rank: p.rank,
            layers: p.layers,
            scale: 20,
            iters: p.iters,
            beta: p.beta,
            heldOut: (await results())?.heldOut,
          })
        },
      },
    ],
  })
  await writeJson(path.join(runDir, 'manifest.json'), await manifest(ok))
  return ok
}

/* ---------- fuse / register / export ---------- */

interface AdapterManifest extends Manifest {
  /** what the adapter sits on: a Hugging Face id, or workspace/fused/<name> for one made on a fused model */
  base: string
  /** the Hugging Face model at the root of the lineage (sets the chat template on export) */
  hfBase?: string
  rank: number
  layers: number
  method: string
  /** where it lives: trained adapters and merges are both adapters to fuse */
  dir: 'adapters' | 'merges'
}

function fuseStep(adapter: AdapterManifest, out: string, line: string): Step[] {
  return [
    unloadStep,
    { kind: 'spawn', argv: fuseArgs(adapter.base, adapter.name, out, adapter.dir), env: PY_ENV },
    {
      kind: 'do',
      display: `write workspace/fused/${out}/manifest.json`,
      run: () =>
        writeJson(ws('fused', out, 'manifest.json'), {
          name: out,
          kind: 'fused',
          created: now(),
          license: adapter.license,
          inputs: [`workspace/${adapter.dir}/${adapter.name}`, adapter.base],
          command: [line, ['HF_HOME=workspace/hf', ...fuseArgs(adapter.base, adapter.name, out, adapter.dir)].join(' ')],
          adapter: adapter.name,
          base: adapter.base,
          hfBase: adapter.hfBase ?? adapter.base,
        }),
    },
  ]
}

function registerSteps(o: { fused: string; model: string; quantize: Quantize; system?: string; base: string; adapter: string; license: string }): Step[] {
  const template = HF_BASES.find((b) => b.id === o.base)?.template
  return [
    {
      kind: 'do',
      display: `write workspace/modelfiles/${o.model}.Modelfile`,
      run: async () => {
        await fs.mkdir(ws('modelfiles'), { recursive: true })
        await fs.writeFile(ws('modelfiles', `${o.model}.Modelfile`), registerModelfile({ ...o, template }))
      },
    },
    { kind: 'spawn', argv: createArgs(o.model, o.quantize), env: { OLLAMA_HOST: OLLAMA_URL.origin } },
    {
      kind: 'do',
      display: `ollama list  (refresh the runs-on inventory)`,
      run: async () => broadcast({ type: 'ollama.changed', model: o.model, change: 'created' }),
    },
  ]
}

/** A trained adapter, or else a merge of two. */
async function adapterOrNull(name: string): Promise<AdapterManifest | null> {
  if (!NAME.test(name)) return null
  for (const dir of ['adapters', 'merges'] as const) {
    const m = await readJson<AdapterManifest>(ws(dir, name, 'manifest.json'))
    if (m) return { ...m, dir }
  }
  return null
}

/* ---------- merge ---------- */

async function merge(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  if (!only(opts, ['a', 'b', 't', 'method'], 'merge')) return false
  const name = pos[0] ?? ''
  const t = Number(opts.t ?? 0.5)
  const method = opts.method ?? 'linear'
  if (!NAME.test(name) || !opts.a || !opts.b) {
    print('usage: merge <name> --a <adapter> --b <adapter> [--t 0.5] [--method linear]')
    return false
  }
  if (method !== 'linear') return print('merge: only --method linear so far (SLERP comes later)'), false
  if (!(t >= 0 && t <= 1)) return print('merge: --t is between 0 (all A) and 1 (all B)'), false
  if (await exists(ws('merges', name))) return print(`merge: workspace/merges/${name} already exists; choose another name`), false
  const a = await readJson<AdapterManifest>(ws('adapters', opts.a, 'manifest.json'))
  const b = await readJson<AdapterManifest>(ws('adapters', opts.b, 'manifest.json'))
  if (!a || !b) return print(`merge: no adapter ${!a ? opts.a : opts.b} in workspace/adapters`), false
  // The script checks the tensors themselves; this catches the obvious mismatch before Python starts.
  // A Prefer (DPO) adapter is a LoRA adapter underneath, so it blends with a trained LoRA one.
  const tensors = (m: AdapterManifest) => (m.method === 'dpo' ? 'lora' : m.method)
  const differ: string[] = (['base', 'rank', 'layers'] as const).filter((k) => a[k] !== b[k])
  if (tensors(a) !== tensors(b)) differ.push('type')
  if (differ.length) return print(`merge: A and B differ in ${differ.join(', ')}; they need the same base, type, rank and layers`), false

  const argv = mergeArgs(a.name, b.name, t, name)
  return runRecipe({
    recipe: 'merge',
    params: { name, a: a.name, b: b.name, t, method },
    outputs: [`workspace/merges/${name}`],
    steps: [
      { kind: 'spawn', argv },
      {
        kind: 'do',
        display: `write workspace/merges/${name}/manifest.json`,
        run: () =>
          writeJson(ws('merges', name, 'manifest.json'), {
            name,
            kind: 'merge',
            created: now(),
            license: a.license === b.license ? a.license : `${a.license} · ${b.license}`,
            inputs: [`workspace/adapters/${a.name}`, `workspace/adapters/${b.name}`],
            command: [line, argv.join(' ')],
            method,
            ratio: t,
            a: a.name,
            b: b.name,
            base: a.base,
            // stacked side by side (merge_adapters.py), so the ranks add up
            rank: tensors(a) === 'full' ? a.rank : a.rank * 2,
            layers: a.layers,
            data: `${(a as Manifest & { data?: string }).data} + ${(b as Manifest & { data?: string }).data}`,
          }),
      },
    ],
  })
}

async function fuse(args: string[], line: string) {
  const { pos, opts } = flags(args)
  if (!only(opts, ['name'], 'fuse')) return false
  const adapter = await adapterOrNull(pos[0] ?? '')
  if (!adapter) {
    print('usage: fuse <adapter or merge> [--name <fused name>]   (from workspace/adapters or workspace/merges)')
    return false
  }
  const out = opts.name ?? adapter.name
  if (!NAME.test(out)) return print('fuse: names are lowercase letters, digits and . _ -'), false
  return runRecipe({ recipe: 'fuse', params: { adapter: adapter.name, name: out }, outputs: [`workspace/fused/${out}`], steps: fuseStep(adapter, out, line) })
}

const QUANT = new Set(['int8', 'int4', 'none'])

async function register(args: string[]) {
  const { pos, opts } = flags(args)
  if (!only(opts, ['name', 'quantize', 'system'], 'register')) return false
  const fused = await readJson<Manifest & { adapter: string; base: string; hfBase?: string }>(ws('fused', pos[0] ?? '', 'manifest.json'))
  if (!fused) {
    print('usage: register <fused> [--name <ollama model>] [--quantize int8|int4|none] [--system "<text>"]')
    return false
  }
  const quantize = (opts.quantize ?? 'int8') as Quantize
  if (!QUANT.has(quantize)) return print('register: --quantize is int8, int4 or none (what this Ollama can quantize safetensors to)'), false
  const model = opts.name ?? fused.name
  if (!NAME.test(model)) return print('register: names are lowercase letters, digits and . _ -'), false
  return runRecipe({
    recipe: 'register',
    params: { fused: fused.name, model, quantize },
    outputs: [`ollama:${model}`],
    steps: registerSteps({ fused: fused.name, model, quantize, system: opts.system, base: fused.hfBase ?? fused.base, adapter: fused.adapter, license: fused.license }),
  })
}

/** export = fuse + register, run once. (The plan's GGUF step is skipped: see shared/recipes.ts.) */
async function exportRecipe(args: string[], line: string) {
  const { pos, opts } = flags(args)
  if (!only(opts, ['name', 'quantize', 'system'], 'export')) return false
  const adapter = await adapterOrNull(pos[0] ?? '')
  if (!adapter) {
    print('usage: export <adapter or merge> [--name <ollama model>] [--quantize int8|int4|none] [--system "<text>"]')
    return false
  }
  const quantize = (opts.quantize ?? 'int8') as Quantize
  if (!QUANT.has(quantize)) return print('export: --quantize is int8, int4 or none'), false
  const model = opts.name ?? adapter.name
  if (!NAME.test(model)) return print('export: names are lowercase letters, digits and . _ -'), false
  const base = HF_BASES.find((b) => b.id === adapter.base)
  if (base && base.architecture !== 'llama') print(`  note: ${adapter.base} is ${base.architecture}; Ollama's safetensors import may not support it`)
  return runRecipe({
    recipe: 'export',
    params: { adapter: adapter.name, model, quantize },
    outputs: [`workspace/fused/${adapter.name}`, `ollama:${model}`],
    steps: [
      ...fuseStep(adapter, adapter.name, line),
      ...registerSteps({ fused: adapter.name, model, quantize, system: opts.system, base: adapter.hfBase ?? adapter.base, adapter: adapter.name, license: adapter.license }),
    ],
  })
}

export async function recipeCommand(cmd: string, args: string[], line: string): Promise<boolean> {
  switch (cmd) {
    case 'train':
      return train(args, line)
    case 'fuse':
      return fuse(args, line)
    case 'register':
      return register(args)
    case 'export':
      return exportRecipe(args, line)
    case 'merge':
      return merge(args, line)
    case 'prefer':
      return prefer(args, line)
  }
  return false
}

