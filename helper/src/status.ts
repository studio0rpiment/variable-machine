import { execFile } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { OLLAMA_URL, PYTHON_PROJECT, ROOT, WORKSPACE } from './config.ts'
import { broadcast } from './hub.ts'
import { PY_ENV } from './shared/recipes.ts'
import type { Status, Tier } from './shared/events.ts'

function run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20_000 }, (err, stdout) => resolve({ ok: !err, out: String(stdout).trim() }))
  })
}

function tierFor(gb: number): Tier {
  if (gb >= 64) return '64+'
  if (gb >= 32) return '32'
  return '16'
}

const memoryGB = Math.round(os.totalmem() / 2 ** 30)

export const status: Status = {
  ollama: false,
  uv: false,
  mlx: false,
  memoryGB,
  tier: tierFor(memoryGB),
  arch: process.arch,
  // one project, or a few (dream,dream-trained), for a student who works on only those: the page opens into the first one's walkthrough
  ...(/^[a-z][a-z-]{0,31}(,[a-z][a-z-]{0,31}){0,7}$/.test(process.env.VARIABLE_MACHINE_PROJECT ?? '') ? { project: process.env.VARIABLE_MACHINE_PROJECT } : {}),
}

function update(patch: Partial<Status>) {
  const changed = Object.entries(patch).some(([k, v]) => JSON.stringify(status[k as keyof Status]) !== JSON.stringify(v))
  Object.assign(status, patch)
  if (changed) broadcast({ type: 'status', ...status })
}

/** Ask Ollama for its version. Also called whenever the proxy sees Ollama answer or fail, so status changes ride on real traffic instead of a poll. */
export async function probeOllama() {
  try {
    const res = await fetch(new URL('/api/version', OLLAMA_URL))
    const { version } = (await res.json()) as { version: string }
    update({ ollama: true, ollamaVersion: version })
  } catch {
    update({ ollama: false })
  }
}

export function markOllama(ok: boolean) {
  if (ok !== status.ollama) void probeOllama()
}

/**
 * Startup probe (plan §3.1.8): memory → tier, then `ollama`, `uv` and mlx-lm.
 * mlx is only checked inside an already-synced python/.venv (`--no-sync`), so
 * the probe never starts a download.
 */
export async function probe() {
  const mem = await run('sysctl', ['-n', 'hw.memsize'])
  if (mem.ok) {
    const gb = Math.round(Number(mem.out) / 2 ** 30)
    update({ memoryGB: gb, tier: tierFor(gb) })
  }
  const [uv] = await Promise.all([run('uv', ['--version']), probeOllama(), probeVersion(), probeNetwork()])
  update({ uv: uv.ok })
  if (uv.ok && fs.existsSync(path.join(PYTHON_PROJECT, '.venv'))) {
    const mlx = await run('uv', ['run', '--project', PYTHON_PROJECT, '--no-sync', 'python', '-c', 'import mlx_lm'])
    update({ mlx: mlx.ok })
  }
}

/** The release install.sh wrote into .vm-version; in a git checkout, `git describe --tags` (v0.5.0, or v0.5.0-3-g1a2b3c4 after it). */
async function readVersion(): Promise<string | undefined> {
  try {
    const v = (await fs.promises.readFile(path.join(ROOT, '.vm-version'), 'utf8')).trim()
    if (v) return v
  } catch {
    // not installed by install.sh
  }
  const git = await run('git', ['-C', ROOT, 'describe', '--tags', '--always'])
  return git.ok && git.out ? git.out : undefined
}

/** Hugging Face models in workspace/hf/hub with weights in a snapshot: the ones that load offline. */
async function readDownloaded(): Promise<string[]> {
  const hub = path.join(WORKSPACE, 'hf', 'hub')
  const dirs = (await fs.promises.readdir(hub).catch(() => [] as string[])).filter((d) => d.startsWith('models--'))
  const found: string[] = []
  for (const d of dirs) {
    const snaps = path.join(hub, d, 'snapshots')
    for (const r of await fs.promises.readdir(snaps).catch(() => [] as string[])) {
      const files = await fs.promises.readdir(path.join(snaps, r)).catch(() => [] as string[])
      if (files.some((f) => /\.(safetensors|gguf|onnx)$/.test(f))) {
        found.push(d.slice('models--'.length).replace('--', '/'))
        break
      }
    }
  }
  return found.sort()
}

/**
 * Online or not: Hugging Face asked once a minute, 4 s at most (VARIABLE_MACHINE_OFFLINE=1 says offline
 * without asking: a room with no internet, or to try it). Offline, every Python command gets
 * HF_HUB_OFFLINE=1 and UV_OFFLINE=1, so what is already downloaded is used straight away.
 */
export async function probeNetwork() {
  let online = false
  if (process.env.VARIABLE_MACHINE_OFFLINE !== '1') {
    try {
      await fetch('https://huggingface.co/api/whoami-v2', { method: 'HEAD', signal: AbortSignal.timeout(4000) })
      online = true
    } catch {
      online = false
    }
  }
  if (online) {
    delete PY_ENV.HF_HUB_OFFLINE
    delete PY_ENV.UV_OFFLINE
  } else {
    PY_ENV.HF_HUB_OFFLINE = '1'
    PY_ENV.UV_OFFLINE = '1'
  }
  update({ online, downloaded: await readDownloaded() })
}

export async function probeVersion() {
  update({ version: await readVersion() })
}

setInterval(() => void probeNetwork(), 60_000).unref()
