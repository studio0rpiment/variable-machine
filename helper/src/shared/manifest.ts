/** Every artifact's manifest (plan §4): enough to say what it is, where it came from, and how it was made. */
export interface Manifest {
  name: string
  kind: string
  created: string
  license: string
  /** paths or URLs this was made from; follow them for lineage */
  inputs: string[]
  /** the commands that made it, in order */
  command: string[]
  [extra: string]: unknown
}

export interface DataSource {
  /** e.g. databricks/databricks-dolly-15k, or qwen3:4b for generated rows */
  id: string
  kind: 'import' | 'generated' | 'typed' | 'chat-log'
  license: string
  /** true when the license was read from the source itself at the time, not from our list */
  licenseChecked: boolean
  url?: string
  rows: number
}

export interface DatasetManifest extends Manifest {
  kind: 'dataset'
  /** chat: {"messages": […]} rows for SFT. preference: {"prompt", "chosen", "rejected"} rows for DPO. */
  format: 'chat' | 'preference'
  counts: { train: number; valid: number }
  split: { valid: number; seed: number } | null
  sources: DataSource[]
  tokens?: { total: number; max: number; overLimit: number; limit: number; estimate: true }
}
