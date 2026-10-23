import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { spawnStreamed } from './run.ts'
import { KINDS, TOOL_MODELS, toolModel, type ToolModel } from './shared/kinds.ts'

/**
 * `model get <name>`: download a ready-made tool model (shared/kinds.ts) into
 * workspace/tools/<name>/ with curl, one file at a time, so every download is
 * a command you can read. A manifest records where it came from and its
 * license. `model list` shows what is here; `trash tools/<name>` removes one.
 */

const dir = (t: ToolModel) => path.join(WORKSPACE, 'tools', t.name)
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

async function get(t: ToolModel): Promise<boolean> {
  if (await toolPresent(t)) {
    print(`  already here: workspace/tools/${t.name}`)
    return true
  }
  print(`  ${t.name}: ${t.repo} · ${t.license} · about ${t.mb} MB · ${KINDS[t.kind].id} (${KINDS[t.kind].what})`)
  for (const f of t.files) {
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

export async function modelCommand(args: string[]): Promise<boolean> {
  const [sub, name, ...rest] = args
  if (sub === 'list' && !name) {
    for (const t of TOOL_MODELS) print(`  ${(await toolPresent(t)) ? '●' : '○'} ${t.name.padEnd(8)} ${t.kind} · ${t.action} · ${t.repo} · ${t.license} · ${t.mb} MB`)
    print('  ● here   ○ not downloaded: model get <name>')
    return true
  }
  const t = name ? toolModel(name) : undefined
  if (sub === 'get' && t && !rest.length) return get(t)
  print(`usage: model list | model get <${TOOL_MODELS.map((x) => x.name).join('|')}>`)
  return false
}
