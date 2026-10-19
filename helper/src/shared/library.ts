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
  /** Rough memory during LoRA (plan §11). */
  loraGB: number
  runsAs: string
}

export const HF_BASES: HfBase[] = [
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', license: 'Apache 2.0', architecture: 'llama', loraGB: 2, runsAs: 'smollm2:360m' },
  { id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', license: 'Apache 2.0', architecture: 'llama', loraGB: 8, runsAs: 'smollm2:1.7b' },
]
