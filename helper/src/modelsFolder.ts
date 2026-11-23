import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { spawnStreamed } from './run.ts'

/**
 * Where downloaded models are kept. By default each copy of Variable Machine
 * keeps them in its own workspace (workspace/hf/hub for Hugging Face models,
 * workspace/tools for the ready-made tool models and Kandinsky). With a models
 * folder chosen, those two become links to the same folders there, so every
 * copy on this Mac (and a drive's worth of space) shares one download of each.
 *
 * The choice is kept in ~/.variable-machine/settings.json, which every copy
 * reads; VARIABLE_MACHINE_MODELS overrides it for one run. Ollama's models are
 * already shared: Ollama keeps them in one place for every copy.
 */

/** The workspace folders that hold downloads, as opposed to what the student makes. */
export const SHARED = ['hf/hub', 'tools'] as const

const SETTINGS = path.join(os.homedir(), '.variable-machine', 'settings.json')

function readSettings(): { modelsFolder?: string } {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) as { modelsFolder?: string }
  } catch {
    return {}
  }
}

function writeSettings(patch: { modelsFolder?: string }) {
  const next = { ...readSettings(), ...patch }
  if (!patch.modelsFolder) delete next.modelsFolder
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true })
  fs.writeFileSync(SETTINGS, JSON.stringify(next, null, 2) + '\n')
}

/** The chosen models folder, or undefined for the workspace. */
export function modelsFolder(): string | undefined {
  const f = process.env.VARIABLE_MACHINE_MODELS || readSettings().modelsFolder
  return f ? path.resolve(f.replace(/^~(?=\/|$)/, os.homedir())) : undefined
}

const isLink = (p: string) => fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() ?? false
const entries = (p: string) => (fs.existsSync(p) ? fs.readdirSync(p).filter((e) => e !== '.DS_Store') : [])

/** Whether the chosen folder is there (a drive can be unplugged). */
export function modelsFolderReachable(): boolean {
  const f = modelsFolder()
  return !f || fs.existsSync(f)
}

/**
 * The real folders the shared links lead to, each with the workspace path it
 * stands for. The workspace's own checks (a link mustn't lead out of it) let
 * these through.
 */
export function sharedRoots(): { link: string; real: string }[] {
  const roots: { link: string; real: string }[] = []
  for (const s of SHARED) {
    const link = path.join(WORKSPACE, s)
    if (!isLink(link)) continue
    try {
      roots.push({ link, real: fs.realpathSync(link) })
    } catch {
      // the drive isn't plugged in
    }
  }
  return roots
}

/** A real path inside a shared folder, as the workspace path it stands for; else null. */
export function asWorkspacePath(real: string): string | null {
  for (const r of sharedRoots()) {
    const rel = path.relative(r.real, real)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return path.join(r.link, rel)
  }
  return null
}

/**
 * At startup: with a models folder chosen, make each shared workspace folder a
 * link to it, when that folder is missing or empty. One that already holds
 * models is left alone, with a line saying how to move them (models folder),
 * so a startup never moves gigabytes unasked.
 */
export function linkModelsFolder() {
  const f = modelsFolder()
  if (!f) return
  if (!fs.existsSync(f)) {
    print(`models folder ${f} isn't there (is the drive plugged in?): models already downloaded can't be used, and new ones can't be downloaded, until it is`)
    return
  }
  for (const s of SHARED) {
    const local = path.join(WORKSPACE, s)
    const dest = path.join(f, s)
    fs.mkdirSync(dest, { recursive: true })
    if (isLink(local)) {
      if (fs.readlinkSync(local) !== dest) relink(local, dest)
      continue
    }
    if (entries(local).length) {
      print(`workspace/${s} has models of its own. To move them into ${f}, so every copy shares them: models folder "${f}"`)
      continue
    }
    if (fs.existsSync(local)) fs.rmdirSync(local)
    fs.mkdirSync(path.dirname(local), { recursive: true })
    fs.symlinkSync(dest, local)
  }
}

function relink(local: string, dest: string) {
  fs.unlinkSync(local)
  fs.symlinkSync(dest, local)
}

/** mv, which also moves across drives. */
const mv = (from: string, to: string) => spawnStreamed('mv', [from, to])

/**
 * models folder                    where models are kept
 * models folder <path>             keep them there: this workspace's downloads move in, and every copy uses it
 * models folder workspace          back to each copy's own workspace
 */
export async function modelsCommand(args: string[]): Promise<boolean> {
  const [sub, ...rest] = args
  if (sub !== 'folder') {
    print('models folder [<path>|workspace]   where downloaded models are kept (Hugging Face models, tool models, Kandinsky)')
    return sub === 'help'
  }
  const target = rest.join(' ').trim()
  const now = modelsFolder()
  if (!target) {
    print(now ? `models are kept in ${now}${modelsFolderReachable() ? '' : ' (not there now: is the drive plugged in?)'}` : 'models are kept in this workspace (workspace/hf/hub, workspace/tools)')
    print('Ollama keeps its own models in one place for every copy: ~/.ollama/models')
    return true
  }
  if (process.env.VARIABLE_MACHINE_MODELS) {
    print('VARIABLE_MACHINE_MODELS is set for this run, so the choice is made there: unset it to choose here')
    return false
  }
  if (target === 'workspace') return backToWorkspace(now)

  const f = path.resolve(target.replace(/^~(?=\/|$)/, os.homedir()))
  const parent = path.dirname(f)
  if (!fs.existsSync(parent)) {
    print(`${parent} isn't there: plug in the drive, or choose a folder that exists`)
    return false
  }
  const ws = fs.realpathSync(WORKSPACE)
  if (path.relative(ws, f) === '' || !path.relative(ws, f).startsWith('..')) {
    print('choose a folder outside the workspace')
    return false
  }
  fs.mkdirSync(f, { recursive: true })
  writeSettings({ modelsFolder: f })
  print(`models folder: ${f} (kept in ${SETTINGS}, for every copy on this Mac)`)

  let ok = true
  for (const s of SHARED) {
    const local = path.join(WORKSPACE, s)
    const dest = path.join(f, s)
    fs.mkdirSync(dest, { recursive: true })
    if (isLink(local)) {
      if (fs.readlinkSync(local) !== dest) {
        print(`workspace/${s} now leads to ${dest}; the models in ${fs.readlinkSync(local)} stay there`)
        relink(local, dest)
      }
      continue
    }
    // move this workspace's downloads in; one the folder already has stays aside, to trash or keep
    const aside = path.join(WORKSPACE, 'models-already-shared', s)
    for (const e of entries(local)) {
      const from = path.join(local, e)
      if (fs.existsSync(path.join(dest, e))) {
        if (e === 'CACHEDIR.TAG' || e === 'version.txt' || e === '.locks') continue
        fs.mkdirSync(aside, { recursive: true })
        print(`${e} is already in ${dest}: this copy goes to workspace/models-already-shared/${s}/ (trash it when you're sure)`)
        ok = (await mv(from, path.join(aside, e))) && ok
      } else {
        print(`moving workspace/${s}/${e} → ${dest}/`)
        ok = (await mv(from, path.join(dest, e))) && ok
      }
    }
    if (!ok) {
      print(`not everything moved: workspace/${s} stays a folder of its own; run models folder "${f}" again`)
      continue
    }
    // what's left are the cache's own bookkeeping files the folder already has
    for (const e of entries(local)) fs.rmSync(path.join(local, e), { recursive: true, force: true })
    if (fs.existsSync(local)) fs.rmdirSync(local)
    fs.symlinkSync(dest, local)
    print(`workspace/${s} → ${dest}`)
  }
  return ok
}

async function backToWorkspace(now: string | undefined): Promise<boolean> {
  writeSettings({})
  for (const s of SHARED) {
    const local = path.join(WORKSPACE, s)
    if (!isLink(local)) continue
    fs.unlinkSync(local)
    fs.mkdirSync(local, { recursive: true })
  }
  print(`models are kept in this workspace again; the ones in ${now ?? 'the models folder'} stay there, and are downloaded again here when needed`)
  return true
}
