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
  /** for a table: its page on the portal, and what it is, so the table can be fetched again */
  page?: string
  about?: string
  rows: number
}

export interface DatasetManifest extends Manifest {
  kind: 'dataset'
  /**
   * chat: {"messages": […]} rows for SFT. preference: {"prompt", "chosen", "rejected"} rows for DPO.
   * picture: {"images": ["images/<photo>"], "messages": […]} rows for a model that sees (mlx-vlm).
   * text: {"text": "…"} rows, plain text to continue (mlx-lm's text format): a table's rows as they are.
   */
  format: 'chat' | 'preference' | 'picture' | 'text'
  /** picture sets: each photo copied in, where it came from, and its own license */
  photos?: { file: string; from: string; license: string; author?: string; url?: string }[]
  counts: { train: number; valid: number }
  split: { valid: number; seed: number } | null
  sources: DataSource[]
  tokens?: { total: number; max: number; overLimit: number; limit: number; estimate: true }
  /** a plain description, written at import or with `data describe`; see shared/datasetAbout.ts */
  about?: string
  /** made from a table (data questions, data rows): workspace/<table>, with its roles.json */
  table?: string
  /** a question → query set: the system line each row carries, the table's title, and what one row is */
  ask?: { system: string; title: string; noun: string }
  /** a voice set: results said as plain sentences, a news brief or captions */
  voice?: string
}
