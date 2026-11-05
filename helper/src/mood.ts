import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { runRecipe } from './pipeline.ts'
import { encoderPresent } from './tools.ts'
import { ENCODER_MODELS, IMAGE_EXT } from './shared/kinds.ts'
import { PY_ENV, UV_MOOD } from './shared/recipes.ts'
import { joinWords } from './shared/quote.ts'
import type { DatasetManifest } from './shared/manifest.ts'

/**
 * `mood …`: what a picture conveys (its mood), learned from labelled pictures
 * and informed by texts. The work is python/variable_machine/mood.py, run in
 * the python project's `mood` extra (onnxruntime and Pillow): SigLIP turns
 * each picture and each sentence into an embedding, and a small classifier
 * (numpy) learns the moods on top.
 *
 *   mood describe <dataset> --texts raw/<a> [raw/<b> …]   each mood's prompt and sentences from the texts: data/<dataset>/labels.md
 *   mood train <name> --data <dataset>                   the classifier, checked on the rows set aside: classifiers/<name>/
 *   mood gallery <classifier> images/<set>               every picture's mood, confidence and reason: outputs/<set>-<classifier>/
 *
 * The dataset is a picture dataset (Data): each row a photo, the question
 * "What mood does this picture convey?" and the mood as its answer, so the
 * same rows also train a model that sees (SmolVLM) on the Train tab.
 *
 * It judges what a picture conveys by its look: colour, light, composition.
 * It never reads what a person in it feels.
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ws = (...p: string[]) => path.join(WORKSPACE, ...p)
const exists = (p: string) => fs.access(p).then(() => true, () => false)
const readJson = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return null
  }
}
const SCRIPT = 'python/variable_machine/mood.py'
const shown = (argv: string[]) => joinWords([...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...argv])

export interface MoodCheck {
  rows: { train: number; setAside: number }
  labels: string[]
  heldNear: number
  commonest: { label: string; accuracy: number; macroF1: number }
  textsAlone: { accuracy: number; macroF1: number }
  labelsAlone: { accuracy: number; macroF1: number }
  labelsAndTexts: { accuracy: number; macroF1: number; per: { precision: number; recall: number; f1: number; n: number }[] }
  confusion: number[][]
}

function flags(words: string[]) {
  const pos: string[] = []
  const opts: Record<string, string[]> = {}
  let key = ''
  for (const w of words) {
    if (w.startsWith('--')) opts[(key = w.slice(2))] = []
    else if (key) opts[key].push(w)
    else pos.push(w)
  }
  return { pos, opts }
}

async function needEncoder(): Promise<boolean> {
  const e = ENCODER_MODELS[0]
  if (await encoderPresent(e)) return true
  print(`mood needs its picture encoder first: model get ${e.name} (${e.repo}, ${e.license}, about ${e.mb} MB)`)
  return false
}

async function pictureSet(name: string): Promise<DatasetManifest | null> {
  const m = await readJson<DatasetManifest>(ws('data', name, 'manifest.json'))
  if (!m) return print(`no dataset called ${name}`), null
  if (m.format !== 'picture') return print(`mood: ${name} is a ${m.format} dataset; moods are learned from a picture dataset (each row a photo and its mood)`), null
  return m
}

/** `mood describe <dataset> --texts raw/<a> …`: each mood's prompt and the sentences from the texts that fit its pictures, into labels.md, to read and edit. */
async function describe(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name] = pos
  const texts = (opts.texts ?? []).map((t) => t.replace(/^workspace\//, ''))
  if (!name || pos.length !== 1 || !texts.length || Object.keys(opts).some((k) => k !== 'texts') || texts.some((t) => !/^raw\/[a-z0-9][a-z0-9._-]{0,63}$/.test(t))) {
    print('usage: mood describe <picture dataset> --texts raw/<text> [raw/<text> …]   (texts brought in on Data: data raw gutenberg … or data raw wikipedia …)')
    return false
  }
  if (!(await pictureSet(name)) || !(await needEncoder())) return false
  for (const t of texts) if (!(await exists(ws(t, 'chunks.jsonl')))) return print(`mood describe: no text at workspace/${t}`), false
  const out = `workspace/data/${name}/labels.md`
  if (await exists(ws('data', name, 'labels.md'))) return print(`mood describe: ${out} exists, and may have your edits; trash it or edit it rather than make it again`), false
  const argv = [...UV_MOOD, 'python', SCRIPT, 'describe', `workspace/data/${name}`, out, '--texts', ...texts.map((t) => `workspace/${t}`)]
  return runRecipe({
    recipe: 'mood-describe',
    params: { name, texts },
    outputs: [out],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `add ${texts.join(', ')} to workspace/data/${name}/manifest.json`,
        run: async () => {
          const m = (await readJson<DatasetManifest>(ws('data', name, 'manifest.json')))!
          m.texts = texts
          for (const t of texts) if (!m.inputs.includes(`workspace/${t}`)) m.inputs.push(`workspace/${t}`)
          if (m.command.at(-1) !== line) m.command.push(line)
          await fs.writeFile(ws('data', name, 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
          broadcast({ type: 'workspace.changed', path: `data/${name}/manifest.json`, kind: 'change' })
        },
      },
    ],
  })
}

/** `mood train <name> --data <dataset>`: the classifier, into workspace/classifiers/<name>/, with its check on the rows set aside. */
async function train(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name] = pos
  const data = opts.data?.[0]
  if (!name || !NAME.test(name) || pos.length !== 1 || !data || opts.data.length !== 1 || Object.keys(opts).some((k) => k !== 'data')) {
    print('usage: mood train <name> --data <picture dataset>   (the dataset split, with a labels.md from mood describe)')
    return false
  }
  const m = await pictureSet(data)
  if (!m || !(await needEncoder())) return false
  if (!m.counts.valid) return print(`mood train: ${data} has no rows set aside to check on: data split ${data} --valid 0.2`), false
  if (!(await exists(ws('data', data, 'labels.md')))) return print(`mood train: no workspace/data/${data}/labels.md; make it with mood describe ${data} --texts raw/<text> …`), false
  if (await exists(ws('classifiers', name))) return print(`mood train: workspace/classifiers/${name} exists; choose another name, or trash classifiers/${name}`), false
  const out = `workspace/classifiers/${name}`
  const argv = [...UV_MOOD, 'python', SCRIPT, 'train', `workspace/data/${data}`, `workspace/data/${data}/labels.md`, out]
  const enc = ENCODER_MODELS[0]
  return runRecipe({
    recipe: 'mood-train',
    params: { name, data },
    outputs: [out],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `write ${out}/manifest.json, and copy labels.md beside it`,
        run: async () => {
          await fs.copyFile(ws('data', data, 'labels.md'), ws('classifiers', name, 'labels.md'))
          const check = await readJson<MoodCheck>(ws('classifiers', name, 'check.json'))
          const manifest = {
            name,
            kind: 'classifier',
            created: new Date().toISOString(),
            license: `${m.license} (data ${data}) · encoder ${enc.repo} (${enc.license})`,
            inputs: [`workspace/data/${data}`, `workspace/tools/${enc.name}`, ...(Array.isArray(m.texts) ? (m.texts as string[]).map((t) => `workspace/${t}`) : [])],
            command: [line, shown(argv)],
            data,
            encoder: enc.repo,
            labels: check?.labels ?? [],
            check: check && { setAside: check.rows.setAside, accuracy: check.labelsAndTexts.accuracy, macroF1: check.labelsAndTexts.macroF1, commonest: check.commonest.accuracy, commonestLabel: check.commonest.label, textsAlone: check.textsAlone.accuracy, labelsAlone: check.labelsAlone.accuracy },
          }
          await fs.writeFile(ws('classifiers', name, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
          broadcast({ type: 'workspace.changed', path: `classifiers/${name}/manifest.json`, kind: 'add' })
        },
      },
    ],
  })
}

/** `mood gallery <classifier> images/<set>`: a contact sheet of the set, each picture's mood, confidence and reason, with CSV and JSON. */
async function gallery(args: string[], line: string): Promise<boolean> {
  const [name, folder, ...rest] = args
  const set = /^(?:workspace\/)?images\/([a-z0-9][a-z0-9._-]{0,63})\/?$/.exec(folder ?? '')?.[1]
  if (!name || !NAME.test(name) || !set || rest.length) {
    print('usage: mood gallery <classifier> images/<set>   (into workspace/outputs/<set>-<classifier>/)')
    return false
  }
  if (!(await exists(ws('classifiers', name, 'classifier.npz')))) return print(`mood gallery: no classifier workspace/classifiers/${name}; train one with mood train`), false
  const photos = (await fs.readdir(ws('images', set)).catch(() => [] as string[])).filter((f) => IMAGE_EXT.test(f))
  if (!photos.length) return print(`mood gallery: no pictures in workspace/images/${set}`), false
  if (!(await needEncoder())) return false
  const outName = `${set}-${name}`
  const out = `workspace/outputs/${outName}`
  const argv = [...UV_MOOD, 'python', SCRIPT, 'gallery', `workspace/classifiers/${name}`, `workspace/images/${set}`, out]
  return runRecipe({
    recipe: 'mood-gallery',
    params: { name, set },
    outputs: [`${out}/gallery.html`, `${out}/moods.csv`, `${out}/moods.json`],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `write ${out}/manifest.json`,
        run: async () => {
          const setM = await readJson<{ license?: string }>(ws('images', set, 'manifest.json'))
          const now = new Date().toISOString()
          const manifest = {
            name: outName,
            kind: 'outputs',
            created: now,
            license: setM?.license ?? 'as the photos it came from',
            inputs: [`workspace/images/${set}`, `workspace/classifiers/${name}`],
            command: line,
            items: ['gallery.html', 'moods.csv', 'moods.json'].map((file) => ({ file, from: `images/${set}`, tool: 'mood', command: line, created: now })),
          }
          await fs.writeFile(ws('outputs', outName, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
          broadcast({ type: 'workspace.changed', path: `outputs/${outName}/manifest.json`, kind: 'add' })
          print(`  open it: http://localhost:${process.env.VARIABLE_MACHINE_PORT ?? 4817}/api/workspace/file?path=${encodeURIComponent(`outputs/${outName}/gallery.html`)}`)
        },
      },
    ],
  })
}

export async function moodCommand(args: string[], line: string): Promise<boolean> {
  const [sub, ...rest] = args
  if (sub === 'describe') return describe(rest, line)
  if (sub === 'train') return train(rest, line)
  if (sub === 'gallery') return gallery(rest, line)
  print('usage: mood describe <dataset> --texts raw/<text> … | mood train <name> --data <dataset> | mood gallery <classifier> images/<set>')
  return false
}
