import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { runRecipe } from './pipeline.ts'
import { encoderPresent } from './tools.ts'
import { IMAGE_EXT, encoderModel } from './shared/kinds.ts'
import { PY_ENV, UV_LATENT } from './shared/recipes.ts'
import { joinWords } from './shared/quote.ts'

/**
 * `latent …`: the latent image of a collection, the picture a set of images
 * holds without any one of them showing it. The work is
 * python/variable_machine/latent.py, run in the python project's `latent`
 * extra (torch, diffusers): Kandinsky 2.2's encoder puts each picture into
 * 1280 numbers, the collection's mean and main axes are fitted to them, and
 * Kandinsky's decoder turns the mean back into a picture.
 *
 *   latent crop images/<screenshots> <set> [--grid]   screenshots cut down to the pictures in them: images/<set>/
 *   latent make <name> images/<set>              the latent image, its axes, the pixel average and the check: latents/<name>/
 *   latent train <name> [--steps 800]            the decoder learns the collection (LoRA), and draws the latent image again
 *   latent gallery <name> images/<set> [--brings 4]   every picture measured against it: outputs/<set>-<name>/
 *
 * A mean and a few directions of spread is all it is. "Subconscious" is the
 * project's frame; the card's texts give that frame its history.
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SET = /^(?:workspace\/)?images\/([a-z0-9][a-z0-9._-]{0,63})\/?$/
const ws = (...p: string[]) => path.join(WORKSPACE, ...p)
const exists = (p: string) => fs.access(p).then(() => true, () => false)
const readJson = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return null
  }
}
const SCRIPT = 'python/variable_machine/latent.py'
const shown = (argv: string[]) => joinWords([...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...argv])

export interface LatentCheck {
  pictures: number
  centreAcrossHalves: number
  axis1AcrossHalves: number
  asideFitRatio: number
  centreStable: boolean
  axesStable: boolean
  asideFits: boolean
  axisShares: number[]
}

function flags(words: string[]) {
  const pos: string[] = []
  const opts: Record<string, string> = {}
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('--')) opts[words[i].slice(2)] = words[++i] ?? ''
    else pos.push(words[i])
  }
  return { pos, opts }
}

async function ready(): Promise<boolean> {
  const k = encoderModel('kandinsky')!
  if (!(await encoderPresent(k))) {
    print(`latent needs Kandinsky 2.2 first: model get kandinsky (${k.license}, about ${(k.mb / 1000).toFixed(1)} GB)`)
    return false
  }
  const gb = os.totalmem() / 2 ** 30
  if (gb < 15) {
    print(`latent: this Mac has ${gb.toFixed(0)} GB of memory; Kandinsky needs 16 GB or more (it peaks at about 8 GB, 9 GB to train)`)
    return false
  }
  return true
}

async function images(set: string): Promise<string[]> {
  return (await fs.readdir(ws('images', set)).catch(() => [] as string[])).filter((f) => IMAGE_EXT.test(f) && !f.startsWith('.'))
}

/** Screenshots hold other people's posts: a set made from them is kept out of zips (share.ts), and so is all made from it. */
export const PRIVATE = "screenshots of other people's posts: student project only, kept on this computer"

/** `latent crop images/<screenshots> <set> [--grid]`: each screenshot cut down to its picture (or, with --grid, the Saved grid's thumbnails), into images/<set>/. */
async function cropShots(args: string[], line: string): Promise<boolean> {
  const grid = args.includes('--grid')
  const { pos, opts } = flags(args.filter((a) => a !== '--grid'))
  const [folder, name] = pos
  const from = SET.exec(folder ?? '')?.[1]
  if (!from || !name || !NAME.test(name) || pos.length !== 2 || Object.keys(opts).length) {
    print('usage: latent crop images/<screenshots> <set> [--grid]   (screenshots of posts, stories or reels cut down to their pictures, into workspace/images/<set>/; --grid: screenshots of the Saved grid, one picture a thumbnail)')
    return false
  }
  const n = (await images(from)).length
  if (!n) return print(`latent crop: no pictures in workspace/images/${from}`), false
  if (await exists(ws('images', name))) return print(`latent crop: workspace/images/${name} exists; choose another name`), false
  const out = `workspace/images/${name}`
  const argv = [...UV_LATENT, 'python', SCRIPT, 'crop', `workspace/images/${from}`, out, ...(grid ? ['--grid'] : [])]
  return runRecipe({
    recipe: 'latent-crop',
    params: { from, name, grid },
    outputs: [`${out}/crops.json`],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `write ${out}/manifest.json, and mark both sets private`,
        run: async () => {
          const crops = await readJson<{ crops: { file: string }[] }>(ws('images', name, 'crops.json'))
          const manifest = {
            name,
            kind: 'images',
            created: new Date().toISOString(),
            license: PRIVATE,
            private: true,
            about: `${crops?.crops.length ?? 0} pictures cut from ${n} screenshots in images/${from}${grid ? ' (the Saved grid)' : ''}`,
            inputs: [`workspace/images/${from}`],
            command: [line, shown(argv)],
            crop: { from, grid },
          }
          await fs.writeFile(ws('images', name, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
          const src = ws('images', from, 'manifest.json')
          const m = (await readJson<Record<string, unknown>>(src)) ?? { name: from, kind: 'images', created: manifest.created, inputs: [], command: 'uploaded' }
          await fs.writeFile(src, JSON.stringify({ ...m, license: PRIVATE, private: true }, null, 2) + '\n')
          broadcast({ type: 'workspace.changed', path: `images/${name}/manifest.json`, kind: 'add' })
          print(`  look through ${out} before going on: a picture with large plain areas can be cut short, and a story's text over the picture stays in it`)
          print(`  next: latent make ${name} images/${name}`)
        },
      },
    ],
  })
}

/** `latent make <name> images/<set>`: the collection's latent image, axes, pixel average and check, into workspace/latents/<name>/. */
async function make(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name, folder] = pos
  const set = SET.exec(folder ?? '')?.[1]
  if (!name || !NAME.test(name) || !set || pos.length !== 2 || Object.keys(opts).length) {
    print('usage: latent make <name> images/<set>   (the latent image of the pictures in workspace/images/<set>, into workspace/latents/<name>/)')
    return false
  }
  const n = (await images(set)).length
  if (n < 12) return print(`latent make: workspace/images/${set} has ${n} pictures; a latent image needs 12 at the least (15 screenshots will do), and 30 before it draws its axes`), false
  if (await exists(ws('latents', name))) return print(`latent make: workspace/latents/${name} exists; choose another name, or trash latents/${name}`), false
  if (!(await ready())) return false
  const out = `workspace/latents/${name}`
  const argv = [...UV_LATENT, 'python', SCRIPT, 'make', `workspace/images/${set}`, out]
  const k = encoderModel('kandinsky')!
  return runRecipe({
    recipe: 'latent-make',
    params: { name, set },
    outputs: [`${out}/latent.png`, `${out}/check.json`],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `write ${out}/manifest.json`,
        run: async () => {
          const setM = await readJson<{ license?: string; private?: boolean }>(ws('images', set, 'manifest.json'))
          const check = await readJson<LatentCheck>(ws('latents', name, 'check.json'))
          const manifest = {
            name,
            kind: 'latent',
            created: new Date().toISOString(),
            license: `pictures: ${setM?.license ?? 'as the pictures it came from'} · model ${k.repos ? Object.values(k.repos).join(' and ') : k.repo} (${k.license})`,
            inputs: [`workspace/images/${set}`, 'workspace/tools/kandinsky'],
            command: [line, shown(argv)],
            set,
            pictures: n,
            check,
            ...(setM?.private ? { private: true } : {}),
          }
          await fs.writeFile(ws('latents', name, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
          broadcast({ type: 'workspace.changed', path: `latents/${name}/manifest.json`, kind: 'add' })
          if (n < 30) print(`  ${n} pictures: the centre and what each picture brings, but no axes; they need 30 pictures or more`)
          else if (check && !check.axesStable) print(`  axis 1 changes with the half of the collection (${check.axis1AcrossHalves.toFixed(2)}; stable at 0.7): read the axes as a sketch until there are about 100 pictures`)
          print(`  next: latent gallery ${name} images/${set}, or latent train ${name} (about ${Math.max(1, Math.round((Math.min(800, n * 20) * 1.5) / 60))} min) so the decoder learns the collection's look`)
        },
      },
    ],
  })
}

/** `latent train <name> [--steps 800]`: the decoder learns the collection (LoRA), then draws the latent image and its axes again. */
async function train(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name] = pos
  if (!name || !NAME.test(name) || pos.length !== 1 || Object.keys(opts).some((o) => o !== 'steps')) {
    print('usage: latent train <name> [--steps 800]   (50 to 5000; about 1.5 s a step; 20 a picture, up to 800, when not given)')
    return false
  }
  const m = await readJson<{ set: string; command: string[]; pictures?: number }>(ws('latents', name, 'manifest.json'))
  if (!m) return print(`latent train: no workspace/latents/${name}; make it first with latent make ${name} images/<set>`), false
  // a few pictures and many steps: the decoder learns the pictures themselves, not their look. 20 steps a picture (40 views of each) is the most.
  const steps = opts.steps === undefined ? Math.min(800, Math.max(50, (m.pictures ?? 40) * 20)) : Number(opts.steps)
  if (!Number.isInteger(steps) || steps < 50 || steps > 5000) return print('latent train: --steps is 50 to 5000'), false
  if (await exists(ws('latents', name, 'lora.safetensors'))) return print(`latent train: ${name} is trained already; make the latent image again under a new name to train it again`), false
  if (!(await ready())) return false
  print(`  about ${Math.round((steps * 1.5) / 60)} minutes for ${steps} steps, and 9 GB of memory`)
  const out = `workspace/latents/${name}`
  const argv = [...UV_LATENT, 'python', SCRIPT, 'train', out, `workspace/images/${m.set}`, '--steps', String(steps)]
  return runRecipe({
    recipe: 'latent-train',
    params: { name, steps },
    outputs: [`${out}/lora.safetensors`, `${out}/latent-trained.png`],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `add the training to ${out}/manifest.json`,
        run: async () => {
          const manifest = (await readJson<Record<string, unknown> & { command: string[] }>(ws('latents', name, 'manifest.json')))!
          manifest.command = [...manifest.command, line, shown(argv)]
          manifest.trained = await readJson(ws('latents', name, 'trained.json'))
          await fs.writeFile(ws('latents', name, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
          broadcast({ type: 'workspace.changed', path: `latents/${name}/manifest.json`, kind: 'change' })
        },
      },
    ],
  })
}

/** `latent gallery <name> images/<set> [--brings 4]`: a contact sheet of the set measured against the latent image, with JSON. */
async function gallery(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name, folder] = pos
  const set = SET.exec(folder ?? '')?.[1]
  const brings = opts.brings === undefined ? 4 : Number(opts.brings)
  if (!name || !NAME.test(name) || !set || pos.length !== 2 || Object.keys(opts).some((o) => o !== 'brings') || !Number.isInteger(brings) || brings < 0 || brings > 24) {
    print('usage: latent gallery <name> images/<set> [--brings 4]   (into workspace/outputs/<set>-<name>/; --brings: how many pictures get a picture of what they bring, 0 to 24)')
    return false
  }
  if (!(await exists(ws('latents', name, 'stats.npz')))) return print(`latent gallery: no latent image workspace/latents/${name}; make one with latent make ${name} images/<set>`), false
  if (!(await images(set)).length) return print(`latent gallery: no pictures in workspace/images/${set}`), false
  if (!(await ready())) return false
  const outName = `${set}-${name}`
  const out = `workspace/outputs/${outName}`
  const argv = [...UV_LATENT, 'python', SCRIPT, 'gallery', `workspace/latents/${name}`, `workspace/images/${set}`, out, '--brings', String(brings)]
  return runRecipe({
    recipe: 'latent-gallery',
    params: { name, set },
    outputs: [`${out}/gallery.html`, `${out}/latent.json`],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `write ${out}/manifest.json`,
        run: async () => {
          const setM = await readJson<{ license?: string; private?: boolean }>(ws('images', set, 'manifest.json'))
          const latM = await readJson<{ private?: boolean }>(ws('latents', name, 'manifest.json'))
          const now = new Date().toISOString()
          const manifest = {
            name: outName,
            kind: 'outputs',
            created: now,
            license: setM?.license ?? 'as the pictures it came from',
            inputs: [`workspace/images/${set}`, `workspace/latents/${name}`],
            command: line,
            items: ['gallery.html', 'latent.json'].map((file) => ({ file, from: `images/${set}`, tool: 'latent', command: line, created: now })),
            ...(setM?.private || latM?.private ? { private: true } : {}),
          }
          await fs.writeFile(ws('outputs', outName, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
          broadcast({ type: 'workspace.changed', path: `outputs/${outName}/manifest.json`, kind: 'add' })
          print(`  open it: http://localhost:${process.env.VARIABLE_MACHINE_PORT ?? 4817}/api/workspace/file?path=${encodeURIComponent(`outputs/${outName}/gallery.html`)}`)
        },
      },
    ],
  })
}

export async function latentCommand(args: string[], line: string): Promise<boolean> {
  const [sub, ...rest] = args
  if (sub === 'crop') return cropShots(rest, line)
  if (sub === 'make') return make(rest, line)
  if (sub === 'train') return train(rest, line)
  if (sub === 'gallery') return gallery(rest, line)
  print('usage: latent crop images/<screenshots> <set> [--grid] | latent make <name> images/<set> | latent train <name> [--steps 800] | latent gallery <name> images/<set> [--brings 4]')
  return false
}
