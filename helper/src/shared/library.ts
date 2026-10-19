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
  /** who made it */
  maker: string
  /** what it was built for, in plain language (shown on its card) */
  builtFor: string
  /** Family of the HF base this matches, so before/after comparisons line up. */
  trainsAs?: string
  /** Shown on the 16GB tier. */
  heavy?: boolean
}

export const OLLAMA_LIBRARY: LibraryModel[] = [
  {
    tag: 'qwen3:4b', license: 'Apache 2.0', open: true, role: 'generator for synthetic data', maker: 'Alibaba (Qwen team), 2025',
    builtFor: 'A general assistant that works in many languages. It can work through a problem step by step before it answers. Here it also writes new training examples.',
  },
  {
    tag: 'smollm2:360m', license: 'Apache 2.0', open: true, role: 'same family as the default training base', trainsAs: 'HuggingFaceTB/SmolLM2-360M-Instruct', maker: 'Hugging Face, 2024',
    builtFor: 'A very small assistant, made to run on phones and laptops. It is quick to change, and it makes plenty of mistakes. It is the same model the Train tab starts from, so comparing before and after is fair.',
  },
  {
    tag: 'smollm2:1.7b', license: 'Apache 2.0', open: true, role: 'same family as the larger training base', trainsAs: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', maker: 'Hugging Face, 2024',
    builtFor: 'The larger SmolLM2: still small, but noticeably better answers. It is the larger model the Train tab can start from.',
  },
  {
    tag: 'qwen2.5:1.5b', license: 'Apache 2.0', open: true, role: 'small chat / compare model', maker: 'Alibaba (Qwen team), 2024',
    builtFor: 'A small general assistant that works in many languages. A good second opinion next to SmolLM2.',
  },
  {
    tag: 'qwen2.5:3b', license: 'Qwen Research', open: false, role: 'chat / compare model; non-commercial license (the 1.5b and 7b are Apache 2.0)', maker: 'Alibaba (Qwen team), 2024',
    builtFor: 'A general assistant that works in many languages. Its license allows research only, not commercial use, unlike its 1.5b and 7b siblings.',
  },
  {
    tag: 'olmo2:7b', license: 'Apache 2.0', open: true, role: 'fully open, training data included (Dolma, Tulu 3)', heavy: true, maker: 'Allen Institute for AI, 2024',
    builtFor: 'Made for research into how language models are built. Everything is published: the training data, the code and the recipe. It is bigger and slower, and it holds less text at once.',
  },
  {
    tag: 'deepseek-r1:8b', license: 'MIT', open: true, role: 'an example of distillation, not a training base', heavy: true, maker: 'DeepSeek, 2025',
    builtFor: 'Built to reason through problems at length before answering. It is a smaller model taught to copy the reasoning of DeepSeek\'s much larger R1 model, which is called distillation.',
  },
  {
    tag: 'llama3.2:3b', license: 'Llama Community', open: false, role: 'the contrast case; never a training base', maker: 'Meta, 2024',
    builtFor: 'A small assistant for phones and laptops. Its license comes with Meta\'s own conditions, so it is here as the example of a model that is free to download but not open-license.',
  },
]

export interface HfBase {
  id: string
  license: string
  maker: string
  /** what it was built for, in plain language */
  builtFor: string
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
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', license: 'Apache 2.0', maker: 'Hugging Face, 2024', builtFor: 'The same tiny assistant as smollm2:360m, in the format training needs. The default starting point: quick to train on any 16GB Mac.', architecture: 'llama', template: 'chatml', params: '360M', loraGB: 2, runsAs: 'smollm2:360m' },
  { id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', license: 'Apache 2.0', maker: 'Hugging Face, 2024', builtFor: 'The larger SmolLM2, in the format training needs. Better results, but slower, and it needs more memory.', architecture: 'llama', template: 'chatml', params: '1.7B', loraGB: 8, runsAs: 'smollm2:1.7b' },
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
