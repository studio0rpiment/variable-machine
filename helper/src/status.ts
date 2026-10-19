import { execFile } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { OLLAMA_URL, PYTHON_PROJECT } from './config.ts'
import { broadcast } from './hub.ts'
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
}

function update(patch: Partial<Status>) {
  const changed = Object.entries(patch).some(([k, v]) => status[k as keyof Status] !== v)
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
  const [uv] = await Promise.all([run('uv', ['--version']), probeOllama()])
  update({ uv: uv.ok })
  if (uv.ok && fs.existsSync(path.join(PYTHON_PROJECT, '.venv'))) {
    const mlx = await run('uv', ['run', '--project', PYTHON_PROJECT, '--no-sync', 'python', '-c', 'import mlx_lm'])
    update({ mlx: mlx.ok })
  }
}
