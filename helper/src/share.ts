import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { spawnStreamed } from './run.ts'

/**
 * Sharing (plan §3: "sharing an artifact = zipping its folder").
 *   zip <data|adapters|merges|runs|fused|images|audio|gestures>/<name>   → workspace/shared/<kind>-<name>.zip
 *   unzip <file.zip in workspace/shared>           → back into the right folder, by its manifest
 * macOS's own `ditto` does the zipping, so there is nothing to install.
 */

/** What a manifest's kind means for where the folder lives. */
const HOME_OF: Record<string, string> = { dataset: 'data', adapter: 'adapters', merge: 'merges', run: 'runs', fused: 'fused', images: 'images', audio: 'audio', gesture: 'gestures' }
const SHAREABLE = new Set(Object.values(HOME_OF))
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const ZIP = /^[\w.-]+\.zip$/

const shared = path.join(WORKSPACE, 'shared')

function list(zip: string): Promise<string[] | null> {
  return new Promise((resolve) => execFile('zipinfo', ['-1', zip], { maxBuffer: 16 * 2 ** 20 }, (err, out) => resolve(err ? null : String(out).split('\n').filter(Boolean))))
}

async function size(p: string): Promise<number> {
  const st = await fs.stat(p)
  if (!st.isDirectory()) return st.size
  let n = 0
  for (const e of await fs.readdir(p)) n += await size(path.join(p, e))
  return n
}

export async function zipCommand(args: string[]): Promise<boolean> {
  const [target] = args
  const [kind, name] = (target ?? '').replace(/^workspace\//, '').split('/')
  if (!SHAREABLE.has(kind) || !name || !NAME.test(name) || args.length !== 1) {
    print('usage: zip <data|adapters|merges|runs|fused|images|audio|gestures>/<name>')
    return false
  }
  const folder = path.join(WORKSPACE, kind, name)
  try {
    await fs.access(path.join(folder, 'manifest.json'))
  } catch {
    print(`zip: workspace/${kind}/${name} has no manifest.json, so it isn't an artifact this app can share`)
    return false
  }
  const mb = (await size(folder)) / 2 ** 20
  if (mb > 500) print(`  note: ${Math.round(mb)} MB. A fused model is a whole model; the adapter it came from is a few MB and rebuilds it (export).`)
  await fs.mkdir(shared, { recursive: true })
  const out = `workspace/shared/${kind}-${name}.zip`
  // --keepParent: the zip holds <name>/…, with the manifest saying what kind of thing it is.
  const ok = await spawnStreamed('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', `workspace/${kind}/${name}`, out])
  if (ok) print(`  ◂ ${out}`)
  return ok
}

export async function unzipCommand(args: string[]): Promise<boolean> {
  const file = (args[0] ?? '').replace(/^(workspace\/)?shared\//, '')
  if (!ZIP.test(file) || args.length !== 1) {
    print('usage: unzip <file.zip>   (the zip goes in workspace/shared first)')
    return false
  }
  const zip = path.join(shared, file)
  const entries = await list(zip)
  if (!entries) {
    print(`unzip: can't read workspace/shared/${file}`)
    return false
  }
  // Refuse anything that would land outside one top folder: absolute paths, .., or several roots.
  const roots = new Set(entries.filter((e) => !e.startsWith('__MACOSX/')).map((e) => e.split('/')[0]))
  if (entries.some((e) => e.startsWith('/') || e.split('/').includes('..')) || roots.size !== 1) {
    print('unzip: refused. An artifact zip holds one folder, with no absolute paths and no ..')
    return false
  }
  const [root] = roots
  if (!entries.includes(`${root}/manifest.json`)) {
    print(`unzip: refused. ${root}/manifest.json is missing, so there's no telling what this is`)
    return false
  }
  const incoming = path.join(shared, '.incoming', file.replace(/\.zip$/, ''))
  await fs.rm(incoming, { recursive: true, force: true })
  await fs.mkdir(incoming, { recursive: true })
  const ok = await spawnStreamed('ditto', ['-x', '-k', `workspace/shared/${file}`, path.relative(path.dirname(WORKSPACE), incoming)])
  if (!ok) return false
  try {
    // A link inside an artifact could point anywhere on this computer: the app would read it, or append to it.
    if (await hasLink(path.join(incoming, root))) {
      print('unzip: refused. The zip holds a link to somewhere else on the computer; an artifact holds plain files')
      return false
    }
    const manifest = JSON.parse(await fs.readFile(path.join(incoming, root, 'manifest.json'), 'utf8')) as { kind?: string; name?: string; license?: string }
    const home = HOME_OF[manifest.kind ?? '']
    if (!home) {
      print(`unzip: manifest kind "${manifest.kind}" isn't something this app knows where to put`)
      return false
    }
    const dest = path.join(WORKSPACE, home, root)
    try {
      await fs.access(dest)
      print(`unzip: workspace/${home}/${root} already exists; nothing was overwritten. Rename or remove it first.`)
      return false
    } catch {
      // free: carry on
    }
    await fs.rename(path.join(incoming, root), dest)
    print(`  ◂ workspace/${home}/${root} · ${manifest.kind} · ${manifest.license ?? 'no license recorded'}`)
    return true
  } finally {
    await fs.rm(incoming, { recursive: true, force: true })
  }
}

/** True if anything under dir is a symbolic link. */
async function hasLink(dir: string): Promise<boolean> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) return true
    if (e.isDirectory() && (await hasLink(path.join(dir, e.name)))) return true
  }
  return false
}
