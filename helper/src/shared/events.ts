/** The WebSocket protocol (plan §5). One union per direction so both ends stay honest. Shared by helper and UI. */

export type Tier = '16' | '32' | '64+'

export interface Status {
  ollama: boolean
  ollamaVersion?: string
  uv: boolean
  mlx: boolean
  memoryGB: number
  tier: Tier
  arch: string
}

/** A file a page run made: where it went, what it was made from, which tool made it. */
export interface PageOutput {
  path: string
  from: string
  tool: string
}

export type ServerEvent =
  | ({ type: 'status' } & Status)
  | { type: 'terminal.output'; text: string }
  | { type: 'terminal.busy'; busy: boolean }
  /** A GUI-run command (see `command` below) has finished. */
  | { type: 'command.done'; id: string; ok: boolean }
  /** Ollama's model list changed (pull, rm, create): re-read /api/tags. */
  | { type: 'ollama.changed'; model: string; change: 'pulled' | 'removed' | 'created' }
  | { type: 'ollama.progress'; model: string; status: string; completed?: number; total?: number }
  /** `model get` downloading a file: bytes so far, and the total when the server says it. done: finished (or stopped). */
  | { type: 'download.progress'; name: string; file: string; completed: number; total?: number; done?: boolean }
  | { type: 'pipeline.started'; runId: string; recipe: string; params: unknown; commands: string[] }
  | { type: 'pipeline.step'; runId: string; index: number; command: string }
  | { type: 'pipeline.line'; runId: string; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'pipeline.metric'; runId: string; iter: number; trainLoss?: number; valLoss?: number; tokensPerSec?: number }
  | { type: 'pipeline.finished'; runId: string; ok: boolean; outputs: string[] }
  | { type: 'workspace.changed'; path: string; kind: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' }
  | { type: 'heartbeat'; at: number }
  /** Run a command in this page (the image tools run with onnxruntime-web, not in the helper). */
  | { type: 'page.run'; id: string; words: string[] }
  /** ctrl-c: drop that page run. */
  | { type: 'page.stop'; id: string }

export type ClientEvent =
  | { type: 'terminal.input'; line: string }
  /** A command the GUI composed. Same parser and allowlist as typed lines; echoed with ▸ instead of ›. */
  | { type: 'command'; id: string; line: string }
  /** Write workspace/modelfiles/<name>.Modelfile (queued with commands, so a following create sees it). */
  | { type: 'modelfile.save'; name: string; text: string }
  /** Keep a variant made on the Modelfile tab; otherwise it's removed when Variable Machine stops. */
  | { type: 'modelfile.keep'; name: string }
  | { type: 'terminal.stop' }
  | { type: 'pipeline.run'; recipe: string; params: unknown }
  | { type: 'pipeline.stop'; runId: string }
  | { type: 'ollama.unload'; model: string }
  /** This page can run page commands (look …). */
  | { type: 'page.ready' }
  /** The gesture tab's live test named a gesture; sent on as OSC when `gesture send` is on for that set. */
  | { type: 'gesture.live'; name: string; label: string; confidence: number }
  /** A page run finished; what it made has already been uploaded into workspace/outputs/. */
  | { type: 'page.done'; id: string; ok: boolean; message?: string; outputs: PageOutput[] }
