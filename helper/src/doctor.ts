import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { OLLAMA_URL, PYTHON_PROJECT, WORKSPACE } from './config.ts'

/**
 * `doctor` (plan §10): is this machine ready? Each check says what it found
 * and, when something is missing, the one thing to do about it. Used by the
 * terminal and by `npm run doctor` (which works without the helper running).
 */

export interface Check {
  name: string
  ok: boolean
  /** true when it matters but doesn't block (e.g. a suggested model not pulled yet) */
  warn?: boolean
  found: string
  fix?: string
}

function run(cmd: string, args: string[], timeout = 20_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => execFile(cmd, args, { timeout }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || stderr).trim() })))
}

async function get(url: URL | string, timeout = 5000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout) // a request that never answers must not hang the doctor
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

export async function runDoctor(): Promise<Check[]> {
  const checks: Check[] = []
  const add = (c: Check) => checks.push(c)

  const apple = process.platform === 'darwin' && process.arch === 'arm64'
  add({ name: 'apple silicon', ok: apple, found: `${process.platform} ${process.arch}`, fix: apple ? undefined : 'MLX training needs an Apple Silicon Mac (M1 or later)' })

  const sw = await run('sw_vers', ['-productVersion'])
  const major = Number(sw.out.split('.')[0])
  add({ name: 'macOS', ok: major >= 14, found: sw.ok ? sw.out : 'unknown', fix: major >= 14 ? undefined : 'update to macOS 14 or later' })

  const gb = Math.round(os.totalmem() / 2 ** 30)
  add({ name: 'memory', ok: gb >= 16, found: `${gb}GB · tier ${gb >= 64 ? '64+' : gb >= 32 ? '32' : '16'}`, fix: gb >= 16 ? undefined : 'below the 16GB floor: training may run out of memory' })

  try {
    const st = await fs.statfs(WORKSPACE)
    const free = Math.round((st.bavail * st.bsize) / 2 ** 30)
    add({ name: 'free disk', ok: free >= 10, warn: free < 10, found: `${free}GB free where the workspace is`, fix: free >= 10 ? undefined : 'the base kit needs about 8GB; free some space' })
  } catch {
    add({ name: 'free disk', ok: false, warn: true, found: 'could not read', fix: 'check the workspace folder exists' })
  }

  const nodeMajor = Number(process.versions.node.split('.')[0])
  add({ name: 'node', ok: nodeMajor >= 22, found: process.versions.node, fix: nodeMajor >= 22 ? undefined : 'install Node 22 or newer (nodejs.org, or fnm/nvm)' })

  const ollamaBin = await run('ollama', ['--version'])
  let version = ''
  try {
    const res = await get(new URL('/api/version', OLLAMA_URL))
    version = ((await res.json()) as { version: string }).version
  } catch {
    // not running
  }
  add({
    name: 'ollama',
    ok: !!version,
    found: version ? `${version}, answering on ${OLLAMA_URL.host}` : ollamaBin.ok ? 'installed but not answering' : 'not found',
    fix: version ? undefined : ollamaBin.ok ? 'open the Ollama app' : 'install Ollama from ollama.com and open it',
  })

  if (version) {
    try {
      const res = await get(new URL('/api/tags', OLLAMA_URL))
      const names = ((await res.json()) as { models: { name: string }[] }).models.map((m) => m.name)
      const wanted = ['qwen3:4b', 'smollm2:360m']
      const missing = wanted.filter((w) => !names.some((n) => n === w || n === `${w}:latest`))
      add({ name: 'suggested models', ok: !missing.length, warn: !!missing.length, found: missing.length ? `missing ${missing.join(', ')}` : wanted.join(', '), fix: missing.length ? missing.map((m) => `ollama pull ${m}`).join(' · ') : undefined })
    } catch {
      // covered by the ollama check
    }
  }

  const uv = await run('uv', ['--version'])
  add({ name: 'uv', ok: uv.ok, found: uv.ok ? uv.out : 'not found', fix: uv.ok ? undefined : 'curl -LsSf https://astral.sh/uv/install.sh | sh' })

  if (uv.ok) {
    const synced = await fs.access(path.join(PYTHON_PROJECT, '.venv')).then(() => true, () => false)
    const mlx = synced ? await run('uv', ['run', '--project', PYTHON_PROJECT, '--no-sync', 'python', '-c', 'import mlx_lm; print(mlx_lm.__version__)'], 60_000) : { ok: false, out: '' }
    add({ name: 'mlx-lm', ok: mlx.ok, found: mlx.ok ? mlx.out.split('\n').at(-1)! : synced ? 'python/.venv exists but mlx_lm does not import' : 'python environment not set up', fix: mlx.ok ? undefined : 'uv sync --project python' })
  }

  try {
    const res = await get('https://huggingface.co/api/models/HuggingFaceTB/SmolLM2-360M-Instruct')
    add({ name: 'hugging face', ok: res.ok, found: res.ok ? 'reachable' : `answered ${res.status}`, fix: res.ok ? undefined : 'check the network; base models and datasets download from there' })
  } catch {
    add({ name: 'hugging face', ok: false, warn: true, found: 'not reachable', fix: 'offline? bases and datasets already in workspace/ still work' })
  }

  return checks
}

/** One line per check, for the terminal or a console. */
export function formatChecks(checks: Check[]): string[] {
  const width = Math.max(...checks.map((c) => c.name.length))
  const lines = checks.map((c) => `${c.ok ? 'ok  ' : c.warn ? 'note' : 'no  '}  ${c.name.padEnd(width)}  ${c.found}${c.fix ? `\n${' '.repeat(width + 8)}→ ${c.fix}` : ''}`)
  const blocking = checks.filter((c) => !c.ok && !c.warn).length
  lines.push(blocking ? `${blocking} thing${blocking > 1 ? 's' : ''} to fix before training` : 'ready')
  return lines
}
