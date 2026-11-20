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
 * `dream …`: a dream installation. Four cards for each quality (who, what,
 * when, where) make the deck; a visitor chooses one card of each, a
 * combination; each combination has an interpretation, written from the
 * guide texts the student chose, and variations, pictures drawn for it. The
 * work is python/variable_machine/dream.py, which loads Kandinsky 2.2 the way
 * latent.py does, and SigLIP the way mood.py does.
 *
 *   dream cards <prefix>                                       a demo deck, drawn from prompts: images/<prefix>-who … -where
 *   dream deck <name> --who images/<set> --what … --when … --where …   the deck: workspace/dreams/<name>/
 *   dream guide <name> raw/<text> uploads/<file> … [--embed nomic-embed-text]   the guide texts
 *   dream interpret <name> (--combination 1-2-3-4 | --all) [--model qwen3:4b|none]
 *   dream draw <name> (--combination 1-2-3-4 | --all) [--variations 2] [--with cards|prior]
 *   dream choose <name> --who 1 --what 3 --when 2 --where 4 [--dream "…"]
 *   dream respond <name> [--model …] [--with …] [--variations 2] [--read-words]
 *
 * The room page (#room/<name>) runs choose and respond for the visitor.
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SET = /^(?:workspace\/)?images\/([a-z0-9][a-z0-9._-]{0,63})\/?$/
const TEXT = /^(?:workspace\/)?((?:raw\/[a-z0-9][a-z0-9._-]{0,63})|(?:uploads\/[\w.-]+\.(?:txt|md)))\/?$/
const COMBINATION = /^[1-8]-[1-8]-[1-8]-[1-8]$/
export const QUALITIES = ['who', 'what', 'when', 'where'] as const
export type Quality = (typeof QUALITIES)[number]
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
export const DREAM_EMBED = 'nomic-embed-text'
const port = () => process.env.VARIABLE_MACHINE_PORT ?? 4817

export interface DreamCard {
  n: number
  file: string
  title: string
  words: { zh: string; en: string; score: number }[]
}
export interface Deck {
  qualities: Record<Quality, { folder: string; cards: DreamCard[] }>
  combinations: number
}

function flags(words: string[], bare: string[] = []) {
  const pos: string[] = []
  const opts: Record<string, string> = {}
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('--')) opts[words[i].slice(2)] = bare.includes(words[i].slice(2)) ? 'yes' : (words[++i] ?? '')
    else pos.push(words[i])
  }
  return { pos, opts }
}

async function need(...names: string[]): Promise<boolean> {
  for (const name of names) {
    const k = encoderModel(name)!
    if (!(await encoderPresent(k))) return print(`dream needs ${name} first: model get ${name} (${k.license}, about ${k.mb >= 1000 ? `${(k.mb / 1000).toFixed(1)} GB` : `${k.mb} MB`})`), false
  }
  return true
}

/** Run dream.py, then note in the dream's manifest what ran. */
function run(recipe: string, name: string | null, argv: string[], line: string, outputs: string[], params: Record<string, unknown>, after?: () => Promise<void>) {
  return runRecipe({
    recipe,
    params,
    outputs,
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: name ? `add it to workspace/dreams/${name}/manifest.json` : 'write the image sets\' manifests',
        run: async () => {
          if (name) {
            const p = ws('dreams', name, 'manifest.json')
            const m = (await readJson<Record<string, unknown> & { command: string[] }>(p)) ?? { name, kind: 'dream', created: new Date().toISOString(), command: [] as string[] }
            m.command = [...m.command, line, shown(argv)]
            Object.assign(m, await state(name))
            await fs.writeFile(p, JSON.stringify(m, null, 2) + '\n')
            broadcast({ type: 'workspace.changed', path: `dreams/${name}/manifest.json`, kind: 'change' })
          }
          await after?.()
        },
      },
    ],
  })
}

/** What a dream folder holds, for its manifest: the deck's sets, the guide texts, how many combinations are interpreted and drawn. */
async function state(name: string) {
  const deck = await readJson<Deck>(ws('dreams', name, 'deck.json'))
  const guide = await readJson<{ texts: { from: string }[]; book: string | null }>(ws('dreams', name, 'guide.json'))
  const combos = await fs.readdir(ws('dreams', name, 'combinations')).catch(() => [] as string[])
  let interpreted = 0
  let drawn = 0
  for (const c of combos) {
    if (await exists(ws('dreams', name, 'combinations', c, 'interpretation.json'))) interpreted++
    if (await exists(ws('dreams', name, 'combinations', c, 'v1.png'))) drawn++
  }
  return {
    ...(deck && { sets: Object.fromEntries(QUALITIES.map((q) => [q, deck.qualities[q].folder.replace(/^images\//, '')])), combinations: deck.combinations }),
    ...(guide && { guide: guide.texts.map((t) => t.from) }),
    interpreted,
    drawn,
  }
}

async function images(set: string): Promise<string[]> {
  return (await fs.readdir(ws('images', set)).catch(() => [] as string[])).filter((f) => IMAGE_EXT.test(f) && !f.startsWith('.'))
}

/** `dream cards <prefix>`: a demo deck of 16 cards, drawn by Kandinsky from prompts, into images/<prefix>-who … -where. */
async function cards(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [prefix] = pos
  if (!prefix || !NAME.test(prefix) || pos.length !== 1 || Object.keys(opts).length) return print('usage: dream cards <prefix>   (16 demo cards drawn from prompts, 4 each into workspace/images/<prefix>-who, -what, -when and -where)'), false
  for (const q of QUALITIES) if (await exists(ws('images', `${prefix}-${q}`))) return print(`dream cards: workspace/images/${prefix}-${q} exists; choose another prefix`), false
  if (!(await need('kandinsky', 'kandinsky-prior'))) return false
  print('  about 6 minutes: 16 prompts through the prior, then 16 pictures through the decoder')
  const argv = [...UV_DREAM, 'python', SCRIPT, 'cards', prefix]
  return run('dream-cards', null, argv, line, QUALITIES.map((q) => `workspace/images/${prefix}-${q}/cards.json`), { prefix }, async () => {
    for (const q of QUALITIES) {
      const credits = (await readJson<{ credits: { file: string; title: string; prompt: string }[] }>(ws('images', `${prefix}-${q}`, 'cards.json')))?.credits ?? []
      const manifest = {
        name: `${prefix}-${q}`,
        kind: 'images',
        created: new Date().toISOString(),
        license: 'drawn by Kandinsky 2.2 (Apache 2.0) from prompts written for the demo',
        about: `4 demo cards for ${q}, drawn from prompts`,
        inputs: ['workspace/tools/kandinsky', 'workspace/tools/kandinsky-prior'],
        command: [line, shown(argv)],
        credits: credits.map((c) => ({ file: c.file, title: c.title, license: 'Apache 2.0 model output', prompt: c.prompt })),
      }
      await fs.writeFile(ws('images', `${prefix}-${q}`, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
      broadcast({ type: 'workspace.changed', path: `images/${prefix}-${q}/manifest.json`, kind: 'add' })
    }
    print(`  next: dream deck <name> ${QUALITIES.map((q) => `--${q} images/${prefix}-${q}`).join(' ')}`)
  })
}

/** `dream deck <name> --who images/<set> …`: the deck, 4 cards a quality, each matched to the glossary, into workspace/dreams/<name>/. */
async function deck(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name] = pos
  const sets = Object.fromEntries(QUALITIES.map((q) => [q, SET.exec(opts[q] ?? '')?.[1]])) as Record<Quality, string | undefined>
  if (!name || !NAME.test(name) || pos.length !== 1 || QUALITIES.some((q) => !sets[q]) || Object.keys(opts).some((o) => !(QUALITIES as readonly string[]).includes(o))) {
    print('usage: dream deck <name> --who images/<set> --what images/<set> --when images/<set> --where images/<set>   (the first 4 pictures of each set are its cards; into workspace/dreams/<name>/)')
    return false
  }
  for (const q of QUALITIES) {
    const n = (await images(sets[q]!)).length
    if (n < 2) return print(`dream deck: workspace/images/${sets[q]} has ${n} pictures; a quality needs 2 cards at the least, and 4 make the deck`), false
  }
  if (await exists(ws('dreams', name, 'deck.json'))) return print(`dream deck: workspace/dreams/${name} has a deck; choose another name, or trash dreams/${name}`), false
  if (!(await need('kandinsky', 'siglip'))) return false
  const out = `workspace/dreams/${name}`
  await fs.mkdir(ws('dreams', name), { recursive: true })
  const argv = [...UV_DREAM, 'python', SCRIPT, 'deck', out, ...QUALITIES.flatMap((q) => [`--${q}`, `workspace/images/${sets[q]}`])]
  const priv = (await Promise.all(QUALITIES.map((q) => readJson<{ private?: boolean }>(ws('images', sets[q]!, 'manifest.json'))))).some((m) => m?.private)
  if (priv) await fs.writeFile(ws('dreams', name, 'manifest.json'), JSON.stringify({ name, kind: 'dream', created: new Date().toISOString(), command: [], private: true }, null, 2) + '\n')
  return run('dream-deck', name, argv, line, [`${out}/deck.json`], { name, ...sets }, async () => print(`  next: dream guide ${name} raw/zhougong-jiemeng … (the texts to interpret with)`))
}

/** `dream guide <name> <text> …`: the guide texts, cut into passages and measured, so each combination finds its nearest. */
async function guide(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name, ...texts] = pos
  const embed = opts.embed ?? DREAM_EMBED
  const bad = texts.filter((t) => !TEXT.test(t))
  if (!name || !NAME.test(name) || !texts.length || bad.length || Object.keys(opts).some((o) => o !== 'embed') || !/^[\w.:/-]+$/.test(embed)) {
    print(`usage: dream guide <name> raw/<text> [uploads/<file>.txt …] [--embed ${DREAM_EMBED}]   (the texts each combination is interpreted with: dream books and texts brought in with data raw, or your own writing uploaded as .txt or .md)`)
    if (bad.length) print(`  not a guide text: ${bad.join(', ')}`)
    return false
  }
  if (!(await exists(ws('dreams', name, 'deck.json')))) return print(`dream guide: no deck in workspace/dreams/${name}; dream deck ${name} … first`), false
  for (const t of texts) if (!(await exists(ws(t)))) return print(`dream guide: no workspace/${t}`), false
  if (!(await hasModel(embed))) return print(`dream guide needs ${embed} in Ollama, to find the passages nearest a combination: ollama pull ${embed} (274 MB, Apache 2.0)`), false
  // dream.py takes guide texts as the commands name them, from the workspace's root (raw/x, uploads/y.txt)
  const argv = [...UV_DREAM, 'python', SCRIPT, 'guide', `workspace/dreams/${name}`, ...texts.map((t) => t.replace(/^workspace\//, '')), '--embed', embed]
  return run('dream-guide', name, argv, line, [`workspace/dreams/${name}/guide.json`], { name, texts }, async () => print(`  next: dream interpret ${name} --combination 1-1-1-1, or --all for every combination`))
}

function combo(opts: Record<string, string>, usage: string): { argv: string[]; label: string } | null {
  if (opts.all && opts.combination) return print(usage), null
  if (opts.all) return { argv: ['--all'], label: 'all' }
  if (opts.combination && COMBINATION.test(opts.combination)) return { argv: ['--combination', opts.combination], label: opts.combination }
  print(usage)
  return null
}

/** `dream interpret <name> (--combination 1-2-3-4 | --all) [--model qwen3:4b|none]`. */
async function interpret(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args, ['all'])
  const [name] = pos
  const usage = `usage: dream interpret <name> (--combination 1-2-3-4 | --all) [--model ${DREAM_MODEL}|none]   (who-what-when-where card numbers; --all: every combination not interpreted yet, about 25 s each)`
  const model = opts.model ?? DREAM_MODEL
  if (!name || !NAME.test(name) || pos.length !== 1 || Object.keys(opts).some((o) => !['all', 'combination', 'model'].includes(o)) || !/^[\w.:/-]+$/.test(model)) return print(usage), false
  const c = combo(opts, usage)
  if (!c) return false
  if (!(await exists(ws('dreams', name, 'guide.json')))) return print(`dream interpret: no guide texts for ${name}; dream guide ${name} raw/<text> … first`), false
  if (model !== 'none' && !(await hasModel(model))) return print(`dream interpret needs ${model} in Ollama: ollama pull ${model}, or --model none for the passages alone`), false
  if (opts.all) {
    const n = (await readJson<Deck>(ws('dreams', name, 'deck.json')))?.combinations ?? 256
    print(`  ${n} combinations at about 25 s each: up to ${Math.round((n * 25) / 60)} minutes. Those interpreted already are kept; stop it any time and run it again to go on`)
  }
  const argv = [...UV_DREAM, 'python', SCRIPT, 'interpret', `workspace/dreams/${name}`, ...c.argv, '--model', model]
  return run('dream-interpret', name, argv, line, [], { name, combination: c.label, model }, async () => {
    if (!opts.all) print(`  open it: http://localhost:${port()}/api/workspace/file?path=${encodeURIComponent(`dreams/${name}/combinations/${opts.combination}/page.html`)}`)
  })
}

/** `dream draw <name> (--combination 1-2-3-4 | --all) [--variations 2] [--with cards|prior]`. */
async function draw(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args, ['all'])
  const [name] = pos
  const usage = 'usage: dream draw <name> (--combination 1-2-3-4 | --all) [--variations 2] [--with cards|prior]   (cards: the four cards mixed; prior: the cards and the interpretation\'s picture sentence, through Kandinsky\'s prior)'
  const variations = opts.variations === undefined ? 2 : Number(opts.variations)
  const way = opts.with ?? 'cards'
  if (!name || !NAME.test(name) || pos.length !== 1 || Object.keys(opts).some((o) => !['all', 'combination', 'variations', 'with'].includes(o)) || !Number.isInteger(variations) || variations < 1 || variations > 8 || !['cards', 'prior'].includes(way)) return print(usage), false
  const c = combo(opts, usage)
  if (!c) return false
  if (!(await exists(ws('dreams', name, 'deck.json')))) return print(`dream draw: no deck in workspace/dreams/${name}`), false
  if (!(await need('kandinsky', ...(way === 'prior' ? ['kandinsky-prior'] : [])))) return false
  if (opts.all) {
    const n = (await readJson<Deck>(ws('dreams', name, 'deck.json')))?.combinations ?? 256
    print(`  ${n * variations} pictures at about 20 s each: up to ${Math.round((n * variations * 20) / 60)} minutes. Those drawn already are kept; stop it any time and run it again to go on`)
  }
  const argv = [...UV_DREAM, 'python', SCRIPT, 'draw', `workspace/dreams/${name}`, ...c.argv, '--variations', String(variations), '--with', way]
  return run('dream-draw', name, argv, line, [], { name, combination: c.label, variations, with: way })
}

/** `dream choose <name> --who 1 --what 3 --when 2 --where 4 [--dream "…"]`: a visitor's combination, into choice.json. */
async function choose(args: string[]): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name] = pos
  const usage = () => (print('usage: dream choose <name> --who <n> --what <n> --when <n> --where <n> [--dream "<a few words>"]   (one card of each quality, by its number)'), false)
  if (!name || !NAME.test(name) || pos.length !== 1 || Object.keys(opts).some((o) => !['dream', ...QUALITIES].includes(o))) return usage()
  const deck = await readJson<Deck>(ws('dreams', name, 'deck.json'))
  if (!deck) return print(`dream choose: no deck in workspace/dreams/${name}`), false
  const c: Record<string, number> = {}
  for (const q of QUALITIES) {
    const n = Number(opts[q])
    const of = deck.qualities[q].cards.length
    if (!Number.isInteger(n) || n < 1 || n > of) return print(`dream choose: --${q} is a card number, 1 to ${of}`), false
    c[q] = n
  }
  const words = (opts.dream ?? '').trim().slice(0, 500)
  await fs.writeFile(ws('dreams', name, 'choice.json'), JSON.stringify({ ...c, dream: words, at: new Date().toISOString() }, null, 2) + '\n')
  broadcast({ type: 'workspace.changed', path: `dreams/${name}/choice.json`, kind: 'change' })
  print(`  chosen: ${QUALITIES.map((q) => `${q} ${c[q]} (${deck.qualities[q].cards[c[q] - 1].title || deck.qualities[q].cards[c[q] - 1].words.map((w) => w.en).join(', ')})`).join(' · ')}`)
  print(`  combination ${QUALITIES.map((q) => c[q]).join('-')}; next: dream respond ${name}`)
  return true
}

/** `dream respond <name>`: the last choice's interpretation and variations, made ahead of time or made now. */
async function respond(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args, ['read-words'])
  const [name] = pos
  const model = opts.model ?? DREAM_MODEL
  const variations = opts.variations === undefined ? 2 : Number(opts.variations)
  const way = opts.with ?? 'cards'
  if (!name || !NAME.test(name) || pos.length !== 1 || Object.keys(opts).some((o) => !['model', 'with', 'variations', 'read-words'].includes(o)) || !/^[\w.:/-]+$/.test(model) || !['cards', 'prior'].includes(way) || !Number.isInteger(variations) || variations < 1 || variations > 8) {
    print(`usage: dream respond <name> [--model ${DREAM_MODEL}|none] [--with cards|prior] [--variations 2] [--read-words]   (what was made ahead of time is shown at once; the rest is made now. --read-words: the visitor's words are read into a new interpretation)`)
    return false
  }
  if (!(await exists(ws('dreams', name, 'choice.json')))) return print(`dream respond: nothing chosen yet; dream choose ${name} --who 1 --what 1 --when 1 --where 1`), false
  if (!(await need('kandinsky', ...(way === 'prior' ? ['kandinsky-prior'] : [])))) return false
  if (model !== 'none' && !(await hasModel(model))) print(`  ${model} isn't in Ollama, so a combination not interpreted ahead gets the passages alone: ollama pull ${model}`)
  const out = `workspace/dreams/${name}`
  const argv = [...UV_DREAM, 'python', SCRIPT, 'respond', out, '--model', model, '--with', way, '--variations', String(variations), ...(opts['read-words'] ? ['--read-words'] : [])]
  return run('dream-respond', name, argv, line, [`${out}/latest.json`], { name, model, with: way }, async () => {
    const latest = await readJson<{ response: string }>(ws('dreams', name, 'latest.json'))
    const r = latest && (await readJson<{ page: string }>(ws(latest.response)))
    if (r) print(`  open it: http://localhost:${port()}/api/workspace/file?path=${encodeURIComponent(r.page)}`)
  })
}

export async function dreamCommand(args: string[], line: string): Promise<boolean> {
  const [sub, ...rest] = args
  if (sub === 'cards') return cards(rest, line)
  if (sub === 'deck') return deck(rest, line)
  if (sub === 'guide') return guide(rest, line)
  if (sub === 'interpret') return interpret(rest, line)
  if (sub === 'draw') return draw(rest, line)
  if (sub === 'choose') return choose(rest)
  if (sub === 'respond') return respond(rest, line)
  print('usage: dream cards <prefix> | dream deck <name> --who images/<set> … | dream guide <name> raw/<text> … | dream interpret <name> (--combination 1-2-3-4 | --all) | dream draw <name> (--combination … | --all) [--with cards|prior] | dream choose <name> --who n --what n --when n --where n | dream respond <name>')
  return false
}
