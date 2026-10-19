import path from 'node:path'
import { watch } from 'chokidar'
import { WORKSPACE } from './config.ts'
import { broadcast } from './hub.ts'

/**
 * The workspace is the state (plan §3). chokidar turns file changes into
 * `workspace.changed` events; the UI re-reads manifests when one arrives.
 * HF snapshots are big and churn during downloads, so their insides are skipped.
 */
export function watchWorkspace() {
  const watcher = watch(WORKSPACE, {
    ignoreInitial: true,
    ignored: (p) => /\/hf\/[^/]+\/(?!manifest\.json$)/.test(p) || path.basename(p) === '.DS_Store',
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  })
  for (const kind of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) {
    watcher.on(kind, (p: string) => broadcast({ type: 'workspace.changed', path: path.relative(WORKSPACE, p), kind }))
  }
  return watcher
}
