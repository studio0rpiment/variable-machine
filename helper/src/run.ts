import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'

/** What is running in the terminal right now, so ctrl-c can stop it. */
let running: { child?: ChildProcess; abort?: AbortController } | null = null

export function setRunning(next: typeof running) {
  running = next
  broadcast({ type: 'terminal.busy', busy: running !== null })
}

export function stopRunning() {
  if (!running) return
  running.abort?.abort()
  running.child?.kill('SIGINT')
}

/** Raw text to every terminal, newlines made xterm-safe. */
export function write(text: string) {
  broadcast({ type: 'terminal.output', text: text.replace(/\r?\n/g, '\r\n') })
}

export function refuse(cmd: string) {
  print(`not allowed here: ${cmd}`)
  print(`type help for what is`)
  return false
}

/**
 * Resolve a path argument to somewhere inside workspace/, or null. Tries it
 * from the repo root first (`ls workspace/chat`), then from workspace/
 * (`ls chat`). Returns it relative to the repo root.
 */
export function scopePath(arg: string): string | null {
  const ws = fs.realpathSync(WORKSPACE)
  for (const base of [ROOT, WORKSPACE]) {
    let p = path.resolve(base, arg)
    try {
      p = fs.realpathSync(p) // follow symlinks before checking, so a link can't lead out
    } catch {
      // not there yet; the command will say so
    }
    const rel = path.relative(ws, p)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return path.relative(ROOT, path.join(WORKSPACE, rel)) || '.'
  }
  return null
}

/** Spawn a real program (no shell), stream its output to every terminal, resolve true on exit 0. */
export function spawnStreamed(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, shell: false, env: { ...process.env, ...env } })
    setRunning({ child })
    const out = (b: Buffer) => write(b.toString('utf8'))
    child.stdout.on('data', out)
    child.stderr.on('data', out)
    child.on('error', (err) => print(`${cmd}: ${err.message}`))
    child.on('close', (code) => {
      setRunning(null)
      resolve(code === 0)
    })
  })
}

export function formatBytes(n: number) {
  if (n >= 2 ** 30) return `${(n / 2 ** 30).toFixed(1)} GB`
  if (n >= 2 ** 20) return `${Math.round(n / 2 ** 20)} MB`
  return `${Math.round(n / 2 ** 10)} KB`
}
