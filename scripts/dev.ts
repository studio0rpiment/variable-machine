import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * `npm run dev`: start Ollama if it isn't running, then rebuild the UI on every
 * save and restart the helper on every helper save. Both are file-watch driven.
 * Reload the page to see UI changes.
 */
const env = { ...process.env, VARIABLE_MACHINE_OPEN: process.env.VARIABLE_MACHINE_OPEN ?? '1' }
const run = (args: string[]) => spawn('npm', args, { stdio: 'inherit', env })

const OLLAMA = process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://127.0.0.1:11434'

/**
 * Ollama answers on its port, or we start it: the Mac app if it's installed (it
 * lives in the menu bar and keeps running after this stops), else `ollama serve`
 * in the background. The helper copes with Ollama arriving a moment later.
 */
async function ensureOllama() {
  const up = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false)
  if (up) return console.log('ollama: already running')
  if (existsSync('/Applications/Ollama.app')) {
    console.log('ollama: starting the Ollama app')
    spawn('open', ['-g', '-a', 'Ollama'], { stdio: 'ignore' })
    return
  }
  console.log('ollama: starting `ollama serve`')
  const serve = spawn('ollama', ['serve'], { stdio: 'ignore', detached: true })
  serve.on('error', () => console.log('ollama: not found. Install it from https://ollama.com, then run npm run dev again.'))
  serve.unref()
}

await ensureOllama()
const first = run(['run', 'build', '-w', 'ui'])
first.on('close', (code) => {
  if (code !== 0) process.exit(code ?? 1)
  const children = [run(['run', 'watch', '-w', 'ui']), run(['run', 'dev', '-w', 'helper'])]
  const stop = () => children.forEach((c) => c.kill('SIGTERM'))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  children.forEach((c) => c.on('close', () => { stop(); process.exit(0) }))
})
