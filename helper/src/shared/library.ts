/**
 * The curated lists shipped with the app (plan §8). What it says about a
 * license is what to expect before pulling; once a model is pulled, the
 * Models panel shows the license Ollama actually reports, and says so when
 * the two disagree.
 */

export interface LibraryModel {
  tag: string
  license: string
  open: boolean
  role: string
  /** Family of the HF base this matches, so before/after comparisons line up. */
  trainsAs?: string
  /** Shown on the 16GB tier. */
  heavy?: boolean
}

export const OLLAMA_LIBRARY: LibraryModel[] = [
  { tag: 'qwen3:4b', license: 'Apache 2.0', open: true, role: 'generator for synthetic data' },
  { tag: 'smollm2:360m', license: 'Apache 2.0', open: true, role: 'same family as the default training base', trainsAs: 'HuggingFaceTB/SmolLM2-360M-Instruct' },
  { tag: 'smollm2:1.7b', license: 'Apache 2.0', open: true, role: 'same family as the larger training base', trainsAs: 'HuggingFaceTB/SmolLM2-1.7B-Instruct' },
  { tag: 'qwen2.5:1.5b', license: 'Apache 2.0', open: true, role: 'small chat / compare model' },
  { tag: 'qwen2.5:3b', license: 'Qwen Research', open: false, role: 'chat / compare model; non-commercial license (the 1.5b and 7b are Apache 2.0)' },
  { tag: 'olmo2:7b', license: 'Apache 2.0', open: true, role: 'fully open, training data included (Dolma, Tulu 3)', heavy: true },
  { tag: 'deepseek-r1:8b', license: 'MIT', open: true, role: 'an example of distillation, not a training base', heavy: true },
  { tag: 'llama3.2:3b', license: 'Llama Community', open: false, role: 'the contrast case; never a training base' },
]

export interface HfBase {
  id: string
  license: string
  architecture: string
  /** chat template to write into a registered model's Modelfile */
  template: 'chatml'
  params: string
  /** Rough memory during LoRA (plan §11). */
  loraGB: number
  /** the Ollama model of the same weights, untouched: the before in a before/after */
  runsAs: string
}

export const HF_BASES: HfBase[] = [
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', license: 'Apache 2.0', architecture: 'llama', template: 'chatml', params: '360M', loraGB: 2, runsAs: 'smollm2:360m' },
  { id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', license: 'Apache 2.0', architecture: 'llama', template: 'chatml', params: '1.7B', loraGB: 8, runsAs: 'smollm2:1.7b' },
]

export interface DataSourceInfo {
  repo: string
  file: string
  url: string
  /** expected license; the import reads the current one from Hugging Face */
  license: string
  about: string
  categories?: string[]
}

/** Datasets the Data panel can import (plan §8). Licenses are re-read from Hugging Face at import. */
export const DATA_SOURCES: Record<string, DataSourceInfo> = {
  dolly: {
    repo: 'databricks/databricks-dolly-15k',
    file: 'databricks-dolly-15k.jsonl',
    url: 'https://huggingface.co/datasets/databricks/databricks-dolly-15k/resolve/main/databricks-dolly-15k.jsonl',
    license: 'CC BY-SA 3.0',
    about: '15k instruction/response pairs written by Databricks employees',
    categories: ['open_qa', 'general_qa', 'classification', 'closed_qa', 'brainstorming', 'information_extraction', 'summarization', 'creative_writing'],
  },
}

/** oasst1: human-written conversation trees, flattened to single turns (first prompt + best-ranked reply). */
export const OASST1 = { repo: 'OpenAssistant/oasst1', license: 'Apache 2.0', about: 'human-written conversations from the OpenAssistant project; flattened to single turns (first prompt, top-ranked reply)' }

/**
 * SmolTalk's dataset card declares no license in its metadata; its License
 * section says only the subsets new in SmolTalk are Apache 2.0, while the rest
 * keep their source datasets' licenses. So only these are offered (checked 2026-10-19).
 */
export const SMOLTALK = {
  repo: 'HuggingFaceTB/smoltalk',
  license: 'Apache 2.0',
  subsets: ['smol-magpie-ultra', 'smol-constraints', 'smol-rewrite', 'smol-summarize'],
  about: 'synthetic conversations made for SmolLM2; only the subsets the card licenses as Apache 2.0',
}

/** Raw material for cross-domain sets: chunks a generator can be asked to write examples from. */
export const RAW_SOURCES = {
  gutenberg: { about: 'a public-domain book from Project Gutenberg, by its number (e.g. 1342 for Pride and Prejudice)', license: 'public domain in the USA (Project Gutenberg; check the laws of your country)' },
  csv: { about: 'a CSV from a URL, e.g. DDOT traffic counts from Open Data DC; give the license the source states' },
  txt: { about: 'a plain-text file from a URL; give the license the source states' },
}
