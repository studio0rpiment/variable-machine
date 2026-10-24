import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { spawnStreamed } from './run.ts'
import { KINDS, SEE_MODELS, TOOL_MODELS, seeModelfile, toolModel, type SeeModel, type ToolModel } from './shared/kinds.ts'
import { ollamaCommand } from './ollamaCommands.ts'

/**
 * `model get <name>`: download a ready-made tool model (shared/kinds.ts) into
 * workspace/tools/<name>/ with curl, one file at a time, so every download is
 * a command you can read. A manifest records where it came from and its
 * license. `model list` shows what is here; `trash tools/<name>` removes one.
 *
 * A model that sees (SEE_MODELS) is fetched the same way, as its two GGUF
 * files, and then made into an Ollama model with `ollama create`, because
 * it isn't in Ollama's library to pull.
 */

const dir = (t: { name: string }) => path.join(WORKSPACE, 'tools', t.name)
const exists = (p: string) => fs.access(p).then(() => true, () => false)

export async function toolPresent(t: ToolModel) {
  for (const f of t.files) if (!(await exists(path.join(dir(t), f)))) return false
  return exists(path.join(dir(t), 'manifest.json'))
}

async function hubLicense(repo: string): Promise<string | null> {
  try {
    const j = (await (await fetch(`https://huggingface.co/api/models/${repo}`)).json()) as { cardData?: { license?: string } }
    return j.cardData?.license ?? null
  } catch {
    return null
  }
}

/** Fetch a repo's files into workspace/tools/<name>/, skipping any already there. */
async function fetchFiles(t: { name: string; repo: string }, files: string[]): Promise<boolean> {
  for (const f of files) {
    const dest = path.join(dir(t), f)
    if (await exists(dest)) continue
    const rel = path.relative(path.dirname(WORKSPACE), dest)
    const url = `https://huggingface.co/${t.repo}/resolve/main/${f}`
    // curl writes to .part and the file is renamed only once complete, so a stopped download never looks finished
    print(`▸ curl -fL --create-dirs -o ${rel}.part ${url}`)
    const ok = await spawnStreamed('curl', ['-fL', '--progress-bar', '--create-dirs', '-o', `${dest}.part`, url])
    if (!ok) {
      print(`  ${f} didn't download; run model get ${t.name} again to carry on`)
      return false
    }
    await fs.rename(`${dest}.part`, dest)
  }
  return true
}

async function get(t: ToolModel): Promise<boolean> {
  if (await toolPresent(t)) {
    print(`  already here: workspace/tools/${t.name}`)
    return true
  }
  print(`  ${t.name}: ${t.repo} · ${t.license} · about ${t.mb} MB · ${KINDS[t.kind].id} (${KINDS[t.kind].what})`)
  if (!(await fetchFiles(t, t.files))) return false
  const declared = await hubLicense(t.repo)
  const manifest = {
    name: t.name,
    kind: 'tool-model',
    modelKind: t.kind,
    task: t.task,
    created: new Date().toISOString(),
    license: declared ?? t.license,
    licenseChecked: !!declared,
    inputs: t.files.map((f) => `https://huggingface.co/${t.repo}/resolve/main/${f}`),
    command: `model get ${t.name}`,
    runsIn: 'the page (onnxruntime-web)',
    needs: t.needs,
  }
  await fs.writeFile(path.join(dir(t), 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  print(`  ◂ workspace/tools/${t.name} · license ${manifest.license}${declared ? ' (read from Hugging Face)' : ' (expected; Hugging Face did not say)'}`)
  broadcast({ type: 'workspace.changed', path: `tools/${t.name}/manifest.json`, kind: 'add' })
  return true
}

export const seePresent = (s: SeeModel) => exists(path.join(dir(s), 'manifest.json'))

/**
 * A model that sees: its language model and projector GGUFs into
 * workspace/tools/<name>/, a Modelfile naming both, and `ollama create`.
 */
async function getSee(s: SeeModel): Promise<boolean> {
  print(`  ${s.name}: ${s.repo} · ${s.license} · about ${s.mb} MB · ${KINDS.sees.id} (${KINDS.sees.what}) · trains from ${s.hf}`)
  if (!(await fetchFiles(s, [s.gguf, s.mmproj]))) return false
  const declared = await hubLicense(s.repo)
  const license = declared === 'apache-2.0' ? 'Apache 2.0' : (declared ?? s.license)
  const modelfile = `workspace/modelfiles/${s.name}.Modelfile`
  print(`▸ write ${modelfile}   (two FROM lines: the language model, then the projector that turns a picture into its tokens)`)
  await fs.mkdir(path.join(WORKSPACE, 'modelfiles'), { recursive: true })
  await fs.writeFile(
    path.join(WORKSPACE, 'modelfiles', `${s.name}.Modelfile`),
    seeModelfile({ gguf: `../tools/${s.name}/${s.gguf}`, mmproj: `../tools/${s.name}/${s.mmproj}`, license, note: `${s.hf}, as ${s.repo}: made by Variable Machine (model get ${s.name})` }),
  )
  print(`▸ ollama create ${s.tag} -f ${modelfile}`)
  if (!(await ollamaCommand(['create', s.tag, '-f', modelfile]))) return false
  const manifest = {
    name: s.name,
    kind: 'tool-model',
    modelKind: s.kind,
    created: new Date().toISOString(),
    license,
    licenseChecked: !!declared,
    inputs: [s.gguf, s.mmproj].map((f) => `https://huggingface.co/${s.repo}/resolve/main/${f}`),
    command: [`model get ${s.name}`, `ollama create ${s.tag} -f ${modelfile}`],
    runsIn: 'Ollama',
    ollama: s.tag,
    hf: s.hf,
  }
  await fs.writeFile(path.join(dir(s), 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  print(`  ◂ ${s.tag} in Ollama · workspace/tools/${s.name} · license ${license}${declared ? ' (read from Hugging Face)' : ' (expected; Hugging Face did not say)'}`)
  broadcast({ type: 'workspace.changed', path: `tools/${s.name}/manifest.json`, kind: 'add' })
  return true
}

export async function modelCommand(args: string[]): Promise<boolean> {
  const [sub, name, ...rest] = args
  if (sub === 'list' && !name) {
    for (const t of TOOL_MODELS) print(`  ${(await toolPresent(t)) ? '●' : '○'} ${t.name.padEnd(12)} ${t.kind} · ${t.action} · ${t.repo} · ${t.license} · ${t.mb} MB`)
    for (const s of SEE_MODELS) print(`  ${(await seePresent(s)) ? '●' : '○'} ${s.name.padEnd(12)} ${s.kind} · ${s.tag} in Ollama · ${s.repo} · ${s.license} · ${s.mb} MB`)
    print('  ● here   ○ not downloaded: model get <name>')
    return true
  }
  const t = name ? toolModel(name) : undefined
  if (sub === 'get' && t && !rest.length) return get(t)
  const s = name ? SEE_MODELS.find((x) => x.name === name) : undefined
  if (sub === 'get' && s && !rest.length) return getSee(s)
  print(`usage: model list | model get <${[...TOOL_MODELS, ...SEE_MODELS].map((x) => x.name).join('|')}>`)
  return false
}
