/**
 * Name a license from its text, as `ollama show` returns it. Shared by the
 * helper and the UI (no imports, so both can load it).
 *
 * `open` means usable under Variable Machine's rule (plan §1): open license with
 * commercial use allowed. Unknown text is not assumed open.
 */
export interface LicenseInfo {
  name: string
  open: boolean
  note?: string
}

const RULES: { test: RegExp; info: LicenseInfo }[] = [
  { test: /Apache License[\s\S]{0,80}Version 2\.0/i, info: { name: 'Apache 2.0', open: true } },
  { test: /^\s*MIT License/i, info: { name: 'MIT', open: true } },
  { test: /Qwen RESEARCH LICENSE/i, info: { name: 'Qwen Research', open: false, note: 'non-commercial' } },
  { test: /Tongyi Qianwen LICENSE|Qwen LICENSE AGREEMENT/i, info: { name: 'Qwen License', open: false, note: 'custom terms' } },
  { test: /LLAMA 3\.\d COMMUNITY LICENSE/i, info: { name: 'Llama Community', open: false, note: 'custom terms' } },
  { test: /Gemma Terms of Use/i, info: { name: 'Gemma Terms', open: false, note: 'custom terms' } },
  { test: /Creative Commons Attribution[- ]NonCommercial|CC[- ]BY[- ]NC/i, info: { name: 'CC BY-NC', open: false, note: 'non-commercial' } },
  { test: /Creative Commons Attribution[- ]ShareAlike|CC[- ]BY[- ]SA/i, info: { name: 'CC BY-SA', open: true } },
]

export function identifyLicense(text: string | string[] | undefined): LicenseInfo {
  const all = Array.isArray(text) ? text.join('\n') : (text ?? '')
  if (!all.trim()) return { name: 'no license given', open: false }
  // A model can carry several licenses (e.g. a distill: MIT + its base's). Every one has to be open.
  const found = RULES.filter((r) => r.test.test(all)).map((r) => r.info)
  if (found.length === 0) return { name: 'unrecognised license', open: false, note: 'read it: ollama show <model> --license' }
  if (found.length === 1) return found[0]
  return { name: found.map((f) => f.name).join(' + '), open: found.every((f) => f.open), note: found.find((f) => !f.open)?.note }
}
