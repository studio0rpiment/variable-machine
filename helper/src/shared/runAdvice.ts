import { HF_BASES } from './library.ts'

/**
 * Plain-language advice around a training run, for students who change the
 * settings without knowing what they cost: before it starts (will it fall
 * apart, run out of memory, take ages?) and after it fails (why, and what to
 * change). Shared by the Train and Prefer tabs.
 */

export interface Advice {
  level: 'warn' | 'stop'
  text: string
}

interface Settings {
  base: string
  type?: 'lora' | 'dora' | 'full'
  rank: number
  layers: number
  lr: number
  batch?: number
  maxSeq?: number
}

/** Memory (GB) the machine can give training, by tier: what is left after macOS and the app. */
const BUDGET: Record<string, number> = { '16': 10, '32': 22, '64+': 45 }

/**
 * A rough memory estimate for a run, calibrated on runs made here: the 1.7B
 * model with DoRA, rank 32, 24 layers, batch 4 and max seq 2048 ran out of
 * memory on a 32GB Mac; the tier defaults don't.
 */
export function estimateGB(s: Settings): number {
  const base = HF_BASES.find((b) => b.id === s.base)
  const g = base?.loraGB ?? 8
  const type = { lora: 1, dora: 1.4, full: 3 }[s.type ?? 'lora']
  return g * type * ((s.batch ?? 4) / 4) * ((s.maxSeq ?? 1024) / 1024) * Math.pow(s.rank / 8, 0.15) * Math.pow(s.layers / 16, 0.3)
}

export function adviseBefore(s: Settings, tier: string, kind: 'train' | 'prefer'): Advice[] {
  const out: Advice[] = []
  const base = HF_BASES.find((b) => b.id === s.base)
  if (base && s.layers > base.layers) out.push({ level: 'stop', text: `${base.params} has only ${base.layers} layers: choose ${base.layers} or fewer.` })
  const high = kind === 'prefer' ? 1e-4 : 3e-4
  if (s.lr >= high)
    out.push({ level: 'warn', text: `A learning rate of ${s.lr.toExponential(0)} usually makes a small model fall apart: the loss climbs instead of falling and the answers turn to nonsense. ${kind === 'prefer' ? '2e-5' : '1e-4'} is a safe start.` })
  const gb = estimateGB(s)
  const budget = BUDGET[tier] ?? 10
  if (gb > budget)
    out.push({ level: 'warn', text: `These settings need about ${Math.round(gb)}GB and this Mac can give training about ${budget}GB, so it will likely run out of memory. Lower the batch, the max seq or the rank, use LoRA instead of ${s.type === 'full' ? 'full fine-tuning' : 'DoRA'}, or train the smaller model.` })
  else if (gb > budget * 0.85)
    out.push({ level: 'warn', text: `These settings use most of this Mac's memory (about ${Math.round(gb)} of ${budget}GB): close other apps, or it may slow to a crawl.` })
  const slow = (s.type === 'dora' ? 1.6 : s.type === 'full' ? 2.5 : 1) * ((s.maxSeq ?? 1024) / 1024) * (s.layers / 16)
  if (slow >= 2.5) out.push({ level: 'warn', text: `${s.type === 'dora' ? 'DoRA, ' : ''}${s.layers} layers and max seq ${s.maxSeq ?? 1024} make each step several times slower than the recommended settings. Fine for a long run; for a class, keep to the recommended settings.` })
  return out
}

/** Why a run failed, read from its log, with what to change. Null when the log doesn't say. */
export function diagnose(log: string, stopped = false): string | null {
  if (/Insufficient Memory|OutOfMemory|out of memory|MTLCommandBuffer.*memory/i.test(log))
    return 'It ran out of memory. Train again with a smaller batch (1 or 2), a lower max seq (1024), LoRA instead of DoRA, fewer layers, or the smaller model. The recommended settings fit.'
  const layers = /Requested to train (\d+) layers but the model only has (\d+) layers/.exec(log)
  if (layers) return `The model has only ${layers[2]} layers and the run asked for ${layers[1]}. Choose ${layers[2]} or fewer.`
  if (/nan|inf/i.test(log.split('\n').filter((l) => /^\s*\d+\s/.test(l)).slice(-3).join('\n')))
    return 'The loss became NaN (not a number): the learning rate is far too high. Use 1e-4 or lower.'
  if (/No such file|does not exist|valid\.jsonl|train\.jsonl/i.test(log) && /Error/i.test(log))
    return 'Training couldn\'t read the dataset. Check and split it on the Data tab first.'
  if (/ConnectionError|Max retries|getaddrinfo|Temporary failure in name resolution/i.test(log))
    return 'It couldn\'t download the base model from Hugging Face. Check the internet connection and train again; once downloaded, it is kept.'
  if (stopped) return 'It was stopped before it finished.'
  const iters = log.split('\n').filter((l) => /^\s*\d+\s+\S/.test(l))
  if (iters.length && !/Traceback/.test(log))
    return 'It stopped partway without an error: it was stopped, the app was closed, or macOS ended it to free memory. Train again with the recommended settings, with other apps closed.'
  const err = /\n(\w*Error: .+)\s*$/.exec(log.trim())
  return err ? `It failed with: ${err[1]}` : null
}

/** A loss that climbs, or sits far above where a model starts: the steps are too big. */
export function diverging(points: { trainLoss?: number }[]): boolean {
  const t = points.filter((p) => p.trainLoss !== undefined).map((p) => p.trainLoss!)
  if (t.length < 4) return false
  const first = t[0]
  const recent = t.slice(-3).reduce((a, b) => a + b, 0) / 3
  return recent > first * 1.15 || recent > 6
}
