// The explanation flags are written in src/explain/flags.md, to be easy to edit;
// the page imports them from src/explain/text.ts, which this makes from the
// Markdown on every build (see the flags plugin in vite.config.ts), so the code
// still knows every flag's name and a typo in one fails the build.
//
// flags.md: "### Title", then the name in backticks on the next line, then the
// text (one paragraph). "#" and "##" lines are headings for finding your way.
//
// The tabs are moving, one at a time, to a file each in src/text/ that holds all
// their words, flags included (see text.mjs). text.ts takes the flags from both;
// once every tab has moved, flags.md is gone.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkFlagNames, tabFiles, tabFlags, writeWords } from './text.mjs'

export const FLAGS_MD = fileURLToPath(new URL('../src/explain/flags.md', import.meta.url))
const TEXT_TS = fileURLToPath(new URL('../src/explain/text.ts', import.meta.url))

export function parseFlags(md) {
  const flags = []
  let cur = null
  const done = () => {
    if (!cur) return
    if (!cur.id) throw new Error(`flags.md: "### ${cur.title}" needs its name in backticks on the next line`)
    cur.text = cur.lines.join(' ').replace(/\s+/g, ' ').trim()
    if (!cur.text) throw new Error(`flags.md: ${cur.id} has no text`)
    if (flags.some((f) => f.id === cur.id)) throw new Error(`flags.md: ${cur.id} appears twice`)
    flags.push({ id: cur.id, title: cur.title, text: cur.text })
    cur = null
  }
  for (const line of md.split('\n')) {
    const title = /^###\s+(.+?)\s*$/.exec(line)
    if (title) {
      done()
      cur = { title: title[1], id: '', lines: [] }
      continue
    }
    if (/^#{1,2}\s/.test(line)) {
      done()
      continue
    }
    if (!cur) continue
    const id = /^`([\w.]+)`\s*$/.exec(line)
    if (!cur.id && id) cur.id = id[1]
    else if (!cur.id && line.trim()) throw new Error(`flags.md: "### ${cur.title}" needs its name in backticks on the next line, before the text`)
    else cur.lines.push(line)
  }
  done()
  return flags
}

export function flagsToTs(flags) {
  const s = (v) => JSON.stringify(v)
  return [
    '/**',
    ' * The explanation layer\'s words, made from flags.md by ui/scripts/flags.mjs on',
    ' * every build. Edit flags.md, not this file: it is written over.',
    ' */',
    'export interface Explanation {',
    '  title: string',
    '  text: string',
    '}',
    '',
    'export const EXPLAIN = {',
    ...flags.map((f) => `  ${s(f.id)}: { title: ${s(f.title)}, text: ${s(f.text)} },`),
    '} satisfies Record<string, Explanation>',
    '',
    'export type ExplainId = keyof typeof EXPLAIN',
    '',
  ].join('\n')
}

/** Write text.ts from flags.md and the tab files' flags, only when it would change (so a watch build doesn't loop). */
export function writeFlags() {
  const flags = parseFlags(fs.readFileSync(FLAGS_MD, 'utf8'))
  for (const f of tabFlags()) {
    if (flags.some((x) => x.id === f.id)) throw new Error(`${f.id} is in flags.md and in src/text/${f.tab}.md: keep it in ${f.tab}.md only`)
    flags.push({ id: f.id, title: f.title, text: f.text })
  }
  const problems = checkFlagNames(flags.map((f) => f.id))
  if (problems.length) throw new Error(`The flags don't match the code:\n  ${problems.join('\n  ')}`)
  const ts = flagsToTs(flags)
  const old = fs.existsSync(TEXT_TS) ? fs.readFileSync(TEXT_TS, 'utf8') : ''
  if (ts !== old) fs.writeFileSync(TEXT_TS, ts)
  return ts !== old
}

/** Both: the flags (text.ts) and the tab files' words (src/text/words.ts, checked against the code). */
export function writeText() {
  return [writeFlags(), writeWords()]
}

/** Vite plugin: make text.ts and words.ts at the start of every build, and again whenever flags.md or a tab file is saved. */
export function flagsPlugin() {
  return {
    name: 'variable-machine-flags',
    buildStart() {
      this.addWatchFile(FLAGS_MD)
      for (const f of tabFiles()) this.addWatchFile(f)
      writeText()
    },
    watchChange(id) {
      if (id === FLAGS_MD || tabFiles().includes(id)) writeText()
    },
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [flags, words] = writeText()
    console.log(flags ? 'wrote src/explain/text.ts from flags.md and src/text/*.md' : 'text.ts already matches flags.md and src/text/*.md')
    console.log(words ? 'wrote src/text/words.ts from src/text/*.md' : 'words.ts already matches src/text/*.md')
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
