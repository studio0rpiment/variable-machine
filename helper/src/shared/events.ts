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

export type ServerEvent =
  | ({ type: 'status' } & Status)
  | { type: 'terminal.output'; text: string }
  | { type: 'terminal.busy'; busy: boolean }
  /** A GUI-run command (see `command` below) has finished. */
  | { type: 'command.done'; id: string; ok: boolean }
  /** Ollama's model list changed (pull, rm, create): re-read /api/tags. */
  | { type: 'ollama.changed'; model: string; change: 'pulled' | 'removed' | 'created' }
  | { type: 'ollama.progress'; model: string; status: string; completed?: number; total?: number }
  | { type: 'pipeline.started'; runId: string; recipe: string; params: unknown; commands: string[] }
  | { type: 'pipeline.step'; runId: string; index: number; command: string }
  | { type: 'pipeline.line'; runId: string; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'pipeline.metric'; runId: string; iter: number; trainLoss?: number; valLoss?: number; tokensPerSec?: number }
  | { type: 'pipeline.finished'; runId: string; ok: boolean; outputs: string[] }
  | { type: 'workspace.changed'; path: string; kind: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' }
  | { type: 'heartbeat'; at: number }

export type ClientEvent =
  | { type: 'terminal.input'; line: string }
  /** A command the GUI composed. Same parser and allowlist as typed lines; echoed with ▸ instead of ›. */
  | { type: 'command'; id: string; line: string }
  /** Write workspace/modelfiles/<name>.Modelfile (queued with commands, so a following create sees it). */
  | { type: 'modelfile.save'; name: string; text: string }
  | { type: 'terminal.stop' }
  | { type: 'pipeline.run'; recipe: string; params: unknown }
  | { type: 'pipeline.stop'; runId: string }
  | { type: 'ollama.unload'; model: string }
