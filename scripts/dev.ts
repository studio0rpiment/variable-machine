import { spawn } from 'node:child_process'

/**
 * `npm run dev`: rebuild the UI on every save and restart the helper on every
 * helper save. Both are file-watch driven. Reload the page to see UI changes.
 */
const env = { ...process.env, RETENSION_OPEN: process.env.RETENSION_OPEN ?? '1' }
const run = (args: string[]) => spawn('npm', args, { stdio: 'inherit', env })

const first = run(['run', 'build', '-w', 'ui'])
first.on('close', (code) => {
  if (code !== 0) process.exit(code ?? 1)
  const children = [run(['run', 'watch', '-w', 'ui']), run(['run', 'dev', '-w', 'helper'])]
  const stop = () => children.forEach((c) => c.kill('SIGTERM'))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  children.forEach((c) => c.on('close', () => { stop(); process.exit(0) }))
})
