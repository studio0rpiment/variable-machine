import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** Repo root: helper/src/ → ../.. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const WORKSPACE = path.join(ROOT, 'workspace')
export const UI_DIST = path.join(ROOT, 'ui', 'dist')
export const PYTHON_PROJECT = path.join(ROOT, 'python')

/** Localhost only, never 0.0.0.0 — there is no auth. */
export const HOST = '127.0.0.1'
export const PORT = Number(process.env.RETENSION_PORT ?? 4817)
export const OLLAMA_URL = new URL(process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434')

/** The folders §4 of the plan lays out; created on startup so the watcher and `ls` have something to show. */
export const WORKSPACE_DIRS = ['hf', 'data', 'runs', 'adapters', 'fused', 'gguf', 'merges', 'chat', 'modelfiles']
