import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { runRecipe } from './pipeline.ts'
import { encoderPresent } from './tools.ts'
import { IMAGE_EXT, encoderModel } from './shared/kinds.ts'
import { PY_ENV, UV_DREAM } from './shared/recipes.ts'
import { joinWords } from './shared/quote.ts'
import { hasModel } from './papers.ts'

/**
 * `dream …`: a dream installation. A visitor is shown four pictures, one for
 * each of who, what, when and where; they choose the one most like their
 * dream; the installation answers with a reading from the Zhougong jiemeng
 * (周公解夢) and a new picture. The work is python/variable_machine/dream.py,
 * which loads Kandinsky 2.2 the way latent.py does, and SigLIP the way mood.py does.
 *
 *   dream make <name> --book raw/<book> --who images/<set> --what images/<set> --when images/<set> --where images/<set> [--drawn 0]
 *   dream choose <name> <who|what|when|where> <picture> [--dream "<a few words>"]
 *   dream respond <name> [--model qwen3:4b]
 *
 * The room page (#room/<name>) runs choose and respond for the visitor.
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SET = /^(?:workspace\/)?images\/([a-z0-9][a-z0-9._-]{0,63})\/?$/
const RAW = /^(?:workspace\/)?raw\/([a-z0-9][a-z0-9._-]{0,63})\/?$/
const CATEGORIES = ['who', 'what', 'when', 'where'] as const
type Category = (typeof CATEGORIES)[number]
const ws = (...p: string[]) => path.join(WORKSPACE, ...p)
const exists = (p: string) => fs.access(p).then(() => true, () => false)
const readJson = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return null
  }
}
const SCRIPT = 'python/variable_machine/dream.py'
const shown = (argv: string[]) => joinWords([...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...argv])
export const DREAM_MODEL = 'qwen3:4b'

export interface DreamPicture {
  file: string
  drawn: boolean
  words: { zh: string; en: string; score: number }[]
}
export interface Dream {
  categories: Record<Category, { folder: string; pictures: DreamPicture[] }>
  drawn: number
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
  for (const name of ['kandinsky', 'siglip']) {
    const k = encoderModel(name)!
    if (!(await encoderPresent(k))) return print(`dream needs ${name} first: model get ${name} (${k.license}, about ${k.mb >= 1000 ? `${(k.mb / 1000).toFixed(1)} GB` : `${k.mb} MB`})`), false
  }
  return true
}

async function images(set: string): Promise<string[]> {
  return (await fs.readdir(ws('images', set)).catch(() => [] as string[])).filter((f) => IMAGE_EXT.test(f) && !f.startsWith('.'))
}

/** `dream make <name> --book raw/<book> --who images/<set> … [--drawn 0]`: the four categories' pictures matched to the dream book, into workspace/dreams/<name>/. */
async function make(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name] = pos
  const book = RAW.exec(opts.book ?? '')?.[1]
  const sets = Object.fromEntries(CATEGORIES.map((c) => [c, SET.exec(opts[c] ?? '')?.[1]])) as Record<Category, string | undefined>
  const drawn = opts.drawn === undefined ? 0 : Number(opts.drawn)
  const known = ['book', 'drawn', ...CATEGORIES]
  if (!name || !NAME.test(name) || pos.length !== 1 || !book || CATEGORIES.some((c) => !sets[c]) || Object.keys(opts).some((o) => !known.includes(o)) || !Number.isInteger(drawn) || drawn < 0 || drawn > 8) {
    print('usage: dream make <name> --book raw/<book> --who images/<set> --what images/<set> --when images/<set> --where images/<set> [--drawn 0]   (into workspace/dreams/<name>/; --drawn N: Kandinsky draws N more pictures for each category from its centre, 0 to 8)')
    return false
  }
  if (!(await exists(ws('raw', book, 'source.txt')))) return print(`dream make: no workspace/raw/${book}; bring the dream book in first: data raw txt <Wikisource address> ${book} --license "public domain"`), false
  for (const c of CATEGORIES) {
    const n = (await images(sets[c]!)).length
    if (!n) return print(`dream make: no pictures in workspace/images/${sets[c]} (the ${c} pictures)`), false
    if (drawn && n < 4) return print(`dream make: --drawn draws from the centre of each category's pictures; ${sets[c]} has ${n}, and a centre needs 4 at the least`), false
  }
  if (await exists(ws('dreams', name))) return print(`dream make: workspace/dreams/${name} exists; choose another name, or trash dreams/${name}`), false
  if (!(await ready())) return false
  const out = `workspace/dreams/${name}`
  const argv = [...UV_DREAM, 'python', SCRIPT, 'make', out, '--book', `workspace/raw/${book}`, ...CATEGORIES.flatMap((c) => [`--${c}`, `workspace/images/${sets[c]}`]), ...(drawn ? ['--drawn', String(drawn)] : [])]
  return runRecipe({
    recipe: 'dream-make',
    params: { name, book, ...sets, drawn },
    outputs: [`${out}/dream.json`, `${out}/book.json`],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `write ${out}/manifest.json`,
        run: async () => {
          const licenses = await Promise.all(CATEGORIES.map(async (c) => `${c}: ${(await readJson<{ license?: string }>(ws('images', sets[c]!, 'manifest.json')))?.license ?? 'as the pictures'}`))
          const priv = (await Promise.all(CATEGORIES.map((c) => readJson<{ private?: boolean }>(ws('images', sets[c]!, 'manifest.json'))))).some((m) => m?.private)
          const bookM = await readJson<{ license?: string }>(ws('raw', book, 'manifest.json'))
          const made = await readJson<Dream>(ws('dreams', name, 'dream.json'))
          const pictures = made ? CATEGORIES.reduce((n, c) => n + made.categories[c].pictures.length, 0) : 0
          const manifest = {
            name,
            kind: 'dream',
            created: new Date().toISOString(),
            license: `pictures: ${licenses.join('; ')} · dream book: ${bookM?.license ?? 'as the book'} · models: Kandinsky 2.2 and SigLIP (Apache 2.0)`,
            inputs: [`workspace/raw/${book}`, ...CATEGORIES.map((c) => `workspace/images/${sets[c]}`), 'workspace/tools/kandinsky', 'workspace/tools/siglip'],
            command: [line, shown(argv)],
            book,
            sets,
            drawn,
            pictures,
            ...(priv ? { private: true } : {}),
          }
          await fs.writeFile(ws('dreams', name, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
          broadcast({ type: 'workspace.changed', path: `dreams/${name}/manifest.json`, kind: 'add' })
          print(`  check the words each picture got in ${out}/dream.json; then the room: http://localhost:${process.env.VARIABLE_MACHINE_PORT ?? 4817}/#room/${name}`)
          print(`  or by hand: dream choose ${name} where <picture>, then dream respond ${name}`)
        },
      },
    ],
  })
}

/** `dream choose <name> <category> <picture> [--dream "…"]`: the visitor's choice, into workspace/dreams/<name>/choice.json. */
async function choose(args: string[]): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name, category, picture] = pos
  const usage = () => (print('usage: dream choose <name> <who|what|when|where> <picture> [--dream "<a few words>"]   (picture: one of that category\'s, as dream.json names it, e.g. images/<set>/<file>)'), false)
  if (!name || !NAME.test(name) || pos.length !== 3 || !CATEGORIES.includes(category as Category) || Object.keys(opts).some((o) => !['dream', 'shown'].includes(o))) return usage()
  const dream = await readJson<Dream>(ws('dreams', name, 'dream.json'))
  if (!dream) return print(`dream choose: no workspace/dreams/${name}; make it first with dream make ${name} …`), false
  const pics = dream.categories[category as Category].pictures
  const p = pics.find((x) => x.file === picture || path.basename(x.file) === picture)
  if (!p) return print(`dream choose: ${picture} isn't one of the ${category} pictures (${pics.slice(0, 3).map((x) => x.file).join(', ')} …)`), false
  // the other pictures on the wall: given by the room page as who=…,what=…, or the first of each category
  const given = Object.fromEntries((opts.shown ?? '').split(',').filter(Boolean).map((kv) => kv.split('=')))
  const shownNow = Object.fromEntries(CATEGORIES.map((c) => [c, c === category ? p.file : dream.categories[c].pictures.find((x) => x.file === given[c])?.file ?? dream.categories[c].pictures[0].file]))
  const dreamWords = (opts.dream ?? '').trim().slice(0, 500)
  const at = new Date().toISOString()
  await fs.writeFile(ws('dreams', name, 'choice.json'), JSON.stringify({ category, picture: p.file, shown: shownNow, dream: dreamWords, at }, null, 2) + '\n')
  broadcast({ type: 'workspace.changed', path: `dreams/${name}/choice.json`, kind: 'change' })
  print(`  chosen: the ${category}, ${p.file} · nearest words: ${p.words.map((w) => `${w.en} ${w.zh}`).join(', ')}`)
  print(`  next: dream respond ${name}`)
  return true
}

/** `dream respond <name> [--model qwen3:4b]`: the reading and the response picture, into workspace/dreams/<name>/responses/<n>/. */
async function respond(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name] = pos
  const model = opts.model ?? DREAM_MODEL
  if (!name || !NAME.test(name) || pos.length !== 1 || Object.keys(opts).some((o) => o !== 'model') || !/^[\w.:/-]+$/.test(model)) {
    print(`usage: dream respond <name> [--model ${DREAM_MODEL}]   (answers the last dream choose: a reading from the dream book, and a picture)`)
    return false
  }
  if (!(await exists(ws('dreams', name, 'choice.json')))) return print(`dream respond: nothing chosen yet; dream choose ${name} <who|what|when|where> <picture>`), false
  if (!(await ready())) return false
  if (!(await hasModel(model))) print(`  ${model} isn't in Ollama, so the response quotes the book with no reading: ollama pull ${model} (about 2.5 GB, Apache 2.0)`)
  const out = `workspace/dreams/${name}`
  const argv = [...UV_DREAM, 'python', SCRIPT, 'respond', out, '--model', model]
  return runRecipe({
    recipe: 'dream-respond',
    params: { name, model },
    outputs: [`${out}/latest.json`],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `add the response to ${out}/manifest.json`,
        run: async () => {
          const latest = await readJson<{ response: string }>(ws('dreams', name, 'latest.json'))
          const m = await readJson<Record<string, unknown> & { command: string[]; responses?: number }>(ws('dreams', name, 'manifest.json'))
          if (m) {
            m.responses = (m.responses ?? 0) + 1
            await fs.writeFile(ws('dreams', name, 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
          }
          broadcast({ type: 'workspace.changed', path: `dreams/${name}/manifest.json`, kind: 'change' })
          if (latest) print(`  open it: http://localhost:${process.env.VARIABLE_MACHINE_PORT ?? 4817}/api/workspace/file?path=${encodeURIComponent(latest.response.replace(/json$/, 'html'))}`)
          void line
        },
      },
    ],
  })
}

export async function dreamCommand(args: string[], line: string): Promise<boolean> {
  const [sub, ...rest] = args
  if (sub === 'make') return make(rest, line)
  if (sub === 'choose') return choose(rest)
  if (sub === 'respond') return respond(rest, line)
  print('usage: dream make <name> --book raw/<book> --who images/<set> --what images/<set> --when images/<set> --where images/<set> [--drawn 0] | dream choose <name> <who|what|when|where> <picture> [--dream "…"] | dream respond <name> [--model qwen3:4b]')
  return false
}
