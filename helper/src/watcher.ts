import path from 'node:path'
import { watch } from 'chokidar'
import { WORKSPACE } from './config.ts'
import { broadcast } from './hub.ts'
import { isConflicted, tidyConflict } from './conflicts.ts'

/**
 * The workspace is the state (plan §3). chokidar turns file changes into
 * `workspace.changed` events; the UI re-reads manifests when one arrives.
 * HF snapshots are big and churn during downloads, so their insides are skipped.
 */
export function watchWorkspace() {
  const watcher = watch(WORKSPACE, {
    ignoreInitial: true,
    // .incoming is unzip's scratch space and .part a download in progress: neither is state yet.
    ignored: (p) => /\/hf\/[^/]+\/(?!manifest\.json$)/.test(p) || path.basename(p) === '.DS_Store' || p.includes('/shared/.incoming') || p.endsWith('.part'),
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  })
  for (const kind of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) {
    watcher.on(kind, (p: string) => {
      // A sync service's "[conflicted]" copy isn't state: tidy it (see conflicts.ts) instead of announcing it.
      if (kind === 'add' && isConflicted(p)) return void tidyConflict(p)
      broadcast({ type: 'workspace.changed', path: path.relative(WORKSPACE, p), kind })
    })
  }
  return watcher
}

/** The built page too: a rebuild rewrites index.html, which is when a sync service renames it. */
export function watchBuild(dir: string) {
  return watch(dir, { ignoreInitial: true, depth: 1, awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 } }).on('add', (p: string) => {
    if (isConflicted(p)) void tidyConflict(p)
  })
}
