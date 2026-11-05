import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { ROOT, WORKSPACE } from '../config.ts'
import { print } from '../hub.ts'
import { formatBytes } from '../run.ts'
import type { DatasetManifest } from '../shared/manifest.ts'
import type { TableProfile } from '../shared/tableProfile.ts'
import { readRoles, readTable } from '../table.ts'
import { demoHtml, readme, researchReadme, type PackageInfo } from './pages.ts'
import { finalOf, type Decision, type ResearchManifest, type Seen } from '../shared/research.ts'
import { EMBED, WRITER } from '../papers.ts'
import type { ResearchConfig } from './research.ts'
import { ENCODER_MODELS } from '../shared/kinds.ts'

/**
 * `package <model>`: a folder to take a trained "ask the table" model into
 * another project (workspace/packages/<model>/): the model as Ollama made it,
 * the table, its roles, ask.js, demo.html and a README. A relevance judge
 * (trained on `papers judge`) gets research.js and its topic instead. `zip packages/<model>`
 * then makes it one file.
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ws = (...p: string[]) => path.join(WORKSPACE, ...p)
const readJson = async <T>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return null
  }
}

/** ask.js: the runner and the ask function, bundled into one file that works in a page, in Node and on the command line. */
async function bundleAsk(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(import.meta.dirname, 'ask.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'askTable',
    platform: 'neutral',
    target: 'es2020',
    external: ['fs', 'path', 'dgram', 'buffer'],
    legalComments: 'none',
    banner: { js: '/* ask.js, made by Variable Machine: question → Ollama → query → runner → answer. See README.md. The query format is described in the runner below (tableQuery). */' },
    footer: { js: "if (typeof module === 'object' && module.exports) { module.exports = askTable; if (require.main === module) askTable.cli(process.argv.slice(2), __dirname).catch((e) => { console.error(e.message); process.exit(1) }) }" },
  })
  return out.outputFiles[0].text
}

interface Adapter {
  name: string
  base: string
  data: string
}

/**
 * The model, into <dir>/model: the fused weights its Ollama model was made from
 * (Ollama keeps a model as separate tensors, and refuses LoRA adapters, so
 * neither can be copied out), a Modelfile that makes it again, and the adapter.
 */
async function copyModel(dir: string, model: string, mf: string, adapter: Adapter, what: string): Promise<boolean> {
  const fused = /^FROM \.\.\/fused\/(\S+)$/m.exec(mf)?.[1]
  if (!fused || !(await fs.access(ws('fused', fused, 'model.safetensors')).then(() => true, () => false))) return print(`package: workspace/fused/${fused ?? '?'} isn't here; export ${adapter.name} again`), false
  if (await fs.access(dir).then(() => true, () => false)) return print(`package: workspace/packages/${model} already exists; trash packages/${model} first to make it again`), false
  const files = (await fs.readdir(ws('fused', fused))).filter((f) => f !== 'manifest.json')
  let size = 0
  for (const f of files) size += (await fs.stat(ws('fused', fused, f))).size
  const free = await fs.statfs(WORKSPACE).then((s) => s.bavail * s.bsize, () => Infinity)
  if (free < size * 3) return print(`package: about ${formatBytes(size * 3)} needed (the model, and its zip) and ${formatBytes(free)} free`), false

  await fs.mkdir(path.join(dir, 'model', 'adapter'), { recursive: true })
  await fs.mkdir(path.join(dir, 'model', 'weights'), { recursive: true })
  print(`  copy workspace/fused/${fused} → model/weights (${formatBytes(size)})`)
  for (const f of files) await fs.copyFile(ws('fused', fused, f), path.join(dir, 'model', 'weights', f))
  await fs.writeFile(
    path.join(dir, 'model', 'Modelfile'),
    mf
      .replace(/^# made by Variable Machine.*$/m, `# ${model}: ${what}. Made by Variable Machine from adapter ${adapter.name} on ${adapter.base}.\n# In the package's folder, once: ollama create ${model} -q int8 -f model/Modelfile`)
      .replace(/^FROM \.\.\/fused\/\S+$/m, 'FROM ./weights')
      .replace(/^PARAMETER temperature .*$/m, 'PARAMETER temperature 0'),
  )
  for (const f of ['adapters.safetensors', 'adapter_config.json', 'manifest.json']) await fs.copyFile(ws('adapters', adapter.name, f), path.join(dir, 'model', 'adapter', f)).catch(() => null)
  return true
}

/** research.js: the research bot's whole loop for Node, bundled with the search code (shared/research.ts) into one file. */
async function bundleResearch(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(import.meta.dirname, 'research.ts')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    legalComments: 'none',
    banner: { js: '#!/usr/bin/env node\n/* research.js, made by Variable Machine: topic → searches → real papers and posts → the judge → a reading list. See README.md. */' },
  })
  return out.outputFiles[0].text
}

/** `package <judge>`: a relevance judge, with research.js that runs the whole loop on the student's topic. */
async function researchPackage(model: string, mf: string, adapter: Adapter, data: DatasetManifest, line: string): Promise<boolean> {
  const { folder, topic } = data.research!
  const r = ws('research', folder)
  const m = await readJson<ResearchManifest>(path.join(r, 'manifest.json'))
  if (!m) return print(`package: workspace/research/${folder} isn't here; the judge's topic comes from it`), false
  const dir = ws('packages', model)
  if (!(await copyModel(dir, model, mf, adapter, `judges relevance to "${topic}"`))) return false
  const config: ResearchConfig = { topic, judge: model, writer: WRITER, embed: EMBED, ollama: 'http://127.0.0.1:11434', seeds: m.seeds, feeds: m.feeds, queries: m.queries, top: 40, per: 10 }
  await fs.writeFile(path.join(dir, 'research.json'), JSON.stringify(config, null, 2) + '\n')
  // the library, with the decisions made so far, so research.js shows only what is new and the reading list keeps what was kept
  const screen = (await readJson<Record<string, Decision>>(path.join(r, 'screen.json'))) ?? {}
  const library = (await fs.readFile(path.join(r, 'library.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as Seen)
  await fs.writeFile(path.join(dir, 'library.jsonl'), library.map((x) => JSON.stringify({ ...x, decision: finalOf(screen[x.key]), reason: screen[x.key]?.student?.reason ?? screen[x.key]?.screen?.reason, sim: screen[x.key]?.sim })).join('\n') + '\n')
  await fs.copyFile(path.join(r, 'seeds.json'), path.join(dir, 'seeds.json')).catch(() => null)
  await fs.writeFile(path.join(dir, 'research.js'), await bundleResearch(), { mode: 0o755 })
  const check = await readJson<{ n: number; agree: number }>(path.join(r, 'check.json'))
  await fs.writeFile(path.join(dir, 'README.md'), researchReadme({ model, topic, base: adapter.base, adapter: adapter.name, dataset: data.name, rows: data.counts.train + data.counts.valid, seen: m.runs.at(-1)?.found ?? 0, ...(check && { check }) }))
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ name: model, kind: 'package', created: new Date().toISOString(), license: `${adapter.base} (Apache 2.0) + ${data.license} (data ${data.name})`, inputs: [`ollama:${model}`, `workspace/adapters/${adapter.name}`, `workspace/data/${data.name}`, `workspace/research/${folder}`], command: [line], model, research: folder }, null, 2) + '\n',
  )
  print(`  ◂ workspace/packages/${model}: model/ (Modelfile, weights/, adapter/), research.js, research.json, library.jsonl, README.md`)
  print(`  try it: node workspace/packages/${model}/research.js   ·   next: zip packages/${model}`)
  return true
}

/**
 * `package <classifier>`: a mood classifier (mood train) as a folder: the
 * classifier, its labels.md and check, mood.py and classify.py, and
 * get-encoder.sh, which fetches SigLIP (about 214 MB) once, so the zip stays
 * small. It runs with Python and four packages, no Variable Machine.
 */
async function classifierPackage(name: string, line: string): Promise<boolean> {
  const from = ws('classifiers', name)
  const m = await readJson<{ license: string; data: string; labels: string[]; check?: { setAside: number; accuracy: number; macroF1: number; commonest: number; commonestLabel?: string; textsAlone: number; labelsAlone: number } }>(path.join(from, 'manifest.json'))
  if (!m) return print(`package: workspace/classifiers/${name} has no manifest`), false
  const dir = ws('packages', name)
  if (await fs.access(dir).then(() => true, () => false)) return print(`package: workspace/packages/${name} already exists; trash packages/${name} first to make it again`), false
  const enc = ENCODER_MODELS[0]
  await fs.mkdir(path.join(dir, 'classifier'), { recursive: true })
  for (const f of ['classifier.npz', 'passages.json', 'passages.npz', 'labels.md', 'check.json', 'manifest.json']) await fs.copyFile(path.join(from, f), path.join(dir, 'classifier', f))
  await fs.copyFile(path.join(ROOT, 'python', 'variable_machine', 'mood.py'), path.join(dir, 'mood.py'))
  await fs.writeFile(path.join(dir, 'classify.py'), CLASSIFY_PY)
  await fs.writeFile(
    path.join(dir, 'get-encoder.sh'),
    `#!/bin/sh\n# SigLIP base (${enc.original}, ${enc.license}) as ONNX (${enc.repo}): about ${enc.mb} MB, once.\nset -e\ncd "$(dirname "$0")"\n${enc.files.map((f) => `curl -fL --create-dirs -o encoder/${f} https://huggingface.co/${enc.repo}/resolve/main/${f}`).join('\n')}\n`,
    { mode: 0o755 },
  )
  const c = m.check
  const pc = (x: number) => `${Math.round(x * 100)}%`
  await fs.writeFile(
    path.join(dir, 'README.md'),
    `# ${name}: picture moods

Sorts pictures into ${m.labels.join(', ')}: what a picture conveys by its look (colour, light, what is in it). It can't tell what anyone in a picture feels, and isn't meant to.

- **How it works:** SigLIP (${enc.original}, ${enc.license}) turns each picture into 768 numbers; a small classifier (\`classifier/classifier.npz\`, numpy) trained on ${m.data} gives each mood a share of 100%. Each mood started from its sentences in \`classifier/labels.md\`, from the texts it was given.${c ? `\n- **How often it's right:** on ${c.setAside} pictures set aside, never trained on, ${pc(c.accuracy)} (balanced F1 ${c.macroF1.toFixed(2)}). Always guessing the commonest mood${c.commonestLabel ? ` (${c.commonestLabel})` : ''}: ${pc(c.commonest)}. The texts alone: ${pc(c.textsAlone)}. Pictures unlike its training pictures do worse.` : ''}
- **The reason** each picture gets is what was measured in its colours, then the sentence from labels.md nearest the picture among that mood's sentences. The sentence is found by nearness, not written, and isn't why it chose.
- **License:** ${m.license}. The texts' sentences in labels.md keep their own licenses (a Wikipedia sentence is CC BY-SA 4.0: credit the article).

## Use it

Once, in this folder (about ${enc.mb} MB):

\`\`\`bash
sh get-encoder.sh
\`\`\`

Then, with [uv](https://docs.astral.sh/uv/):

\`\`\`bash
uv run --with onnxruntime --with pillow --with tokenizers --with numpy python classify.py path/to/pictures
\`\`\`

or with pip: \`pip install onnxruntime pillow tokenizers numpy\`, then \`python classify.py path/to/pictures\`.

It writes \`moods/gallery.html\` (a contact sheet), \`moods/moods.csv\` and \`moods/moods.json\`: for each picture its mood, confidence, every mood's share, the reason, and the colour measurements. Read \`moods.json\` from TouchDesigner, Max, p5.js or a web page.

Made by Variable Machine: \`${line}\`
`,
  )
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ name, kind: 'package', created: new Date().toISOString(), license: m.license, inputs: [`workspace/classifiers/${name}`, `https://huggingface.co/${enc.repo}`], command: [line], classifier: name }, null, 2) + '\n',
  )
  print(`  ◂ workspace/packages/${name}: classifier/, mood.py, classify.py, get-encoder.sh, README.md`)
  print(`  try it: sh workspace/packages/${name}/get-encoder.sh, then classify.py on a folder   ·   next: zip packages/${name}`)
  return true
}

const CLASSIFY_PY = `"""Sort a folder of pictures by mood with the classifier in ./classifier.

    python classify.py <folder of pictures> [<out folder>]

Writes <out folder>/gallery.html, moods.csv and moods.json (default: ./moods).
Needs the encoder once: sh get-encoder.sh. See README.md.
"""
import sys
from pathlib import Path

import mood

here = Path(__file__).resolve().parent
mood.ENCODER = here / "encoder"
if len(sys.argv) not in (2, 3):
    sys.exit(__doc__)
mood.gallery(here / "classifier", Path(sys.argv[1]), Path(sys.argv[2] if len(sys.argv) == 3 else "moods"))
`

export async function packageCommand(args: string[], line: string): Promise<boolean> {
  const model = (args[0] ?? '').replace(/:latest$/, '')
  if (!NAME.test(model) || args.length !== 1) {
    print('usage: package <model>   a trained "ask the table" model, a relevance judge or a mood classifier, as a folder to use in another project (then: zip packages/<model>)')
    return false
  }
  if (await fs.access(ws('classifiers', model, 'classifier.npz')).then(() => true, () => false)) return classifierPackage(model, line)
  // the chain: Modelfile → adapter → dataset → table
  const mf = await fs.readFile(ws('modelfiles', `${model}.Modelfile`), 'utf8').catch(() => '')
  const adapterName = /made by Variable Machine from adapter (\S+)/.exec(mf)?.[1]
  const adapter = adapterName ? await readJson<{ name: string; base: string; data: string }>(ws('adapters', adapterName, 'manifest.json')) : null
  const data = adapter ? await readJson<DatasetManifest>(ws('data', adapter.data, 'manifest.json')) : null
  if (adapter && data?.research) return researchPackage(model, mf, adapter, data, line)
  if (!adapter || !data?.table || !data.ask) {
    print(`package: ${model} isn't a model trained to ask a table, or a relevance judge, here. Train one on a set made by data questions or papers judge, export it, then package it.`)
    return false
  }
  const table = await readTable(data.table)
  const roles = await readRoles(data.table)
  const profile = await readJson<TableProfile>(ws(data.table, 'profile.json'))
  if (!table || !roles) return print(`package: ${data.table} isn't here; bring the table in again`), false
  const dir = ws('packages', model)
  if (!(await copyModel(dir, model, mf, adapter, `asks ${roles.title ?? data.table}`))) return false
  await fs.mkdir(path.join(dir, 'data'), { recursive: true })
  const license = roles.license ?? data.license
  // the table, without the columns that don't take part in questions (ids, map coordinates in another system)
  const keep = table.columns.map((c, i) => [c, i] as const).filter(([c]) => !['id', 'other'].includes(roles.columns.find((x) => x.name === c)?.role ?? ''))
  const slim = { columns: keep.map(([c]) => c), rows: table.rows.map((r) => keep.map(([, i]) => r[i] ?? '')) }
  const slimRoles = { ...roles, columns: roles.columns.filter((c) => slim.columns.includes(c.name)) }
  const config = { model, system: data.ask.system, ollama: 'http://127.0.0.1:11434' }
  await fs.writeFile(path.join(dir, 'data', 'table.json'), JSON.stringify(slim))
  await fs.writeFile(path.join(dir, 'data', 'table.js'), `/* ${roles.title ?? data.table}: the table, its roles and settings, for a web page (see README.md). ${license}. */\nvar ASK_DATA = ${JSON.stringify({ table: slim, roles: slimRoles, config })};\n`)
  await fs.writeFile(path.join(dir, 'roles.json'), JSON.stringify(slimRoles, null, 2) + '\n')
  await fs.writeFile(path.join(dir, 'ask.json'), JSON.stringify(config, null, 2) + '\n')
  await fs.writeFile(path.join(dir, 'ask.js'), await bundleAsk())

  // examples for the demo: a few of the questions set aside, which it never trained on
  const valid = (await fs.readFile(ws('data', data.name, 'valid.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { messages: { role: string; content: string }[] }).messages.find((m) => m.role === 'user')?.content ?? '')
  const check = await readJson<{ same: number; n: number }>(ws('data', data.name, `check-${model.replace(/[^\w.-]/g, '_')}.json`))
  const info: PackageInfo = {
    model,
    title: roles.title ?? data.table,
    license,
    credit: profile?.title ? `${profile.title}${data.sources[0]?.url?.includes('dc.gov') ? ', Open Data DC' : ''}` : (roles.title ?? data.table),
    ...(roles.page && { page: roles.page }),
    ...(roles.source && { source: roles.source }),
    rows: table.rows.length,
    range: profile?.range ? `${profile.range.from} to ${profile.range.to}` : 'no dates',
    noun: roles.noun,
    examples: valid.filter((q) => q.length < 90).slice(0, 6),
    ...(check && { checked: { same: check.same, n: check.n } }),
    base: adapter.base,
    adapter: adapter.name,
    dataset: data.name,
  }
  await fs.writeFile(path.join(dir, 'demo.html'), demoHtml(info))
  await fs.writeFile(path.join(dir, 'README.md'), readme(info))
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ name: model, kind: 'package', created: new Date().toISOString(), license: `${adapter.base} (Apache 2.0) + ${license} (data ${data.table})`, inputs: [`ollama:${model}`, `workspace/adapters/${adapter.name}`, `workspace/data/${data.name}`, `workspace/${data.table}`], command: [line], model, table: data.table }, null, 2) + '\n',
  )
  print(`  ◂ workspace/packages/${model}: model/ (Modelfile, weights/, adapter/), data/table.json, roles.json, ask.js, demo.html, README.md`)
  print(`  try it: node workspace/packages/${model}/ask.js "${info.examples[0] ?? 'a question'}"   ·   next: zip packages/${model}`)
  return true
}
