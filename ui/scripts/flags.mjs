// The explanation flags are written in src/explain/flags.md, to be easy to edit;
// the page imports them from src/explain/text.ts, which this makes from the
// Markdown on every build (see the flags plugin in vite.config.ts), so the code
// still knows every flag's name and a typo in one fails the build.
//
// flags.md: "### Title", then the name in backticks on the next line, then the
// text (one paragraph). "#" and "##" lines are headings for finding your way.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

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

/** Write text.ts from flags.md, only when it would change (so a watch build doesn't loop). */
export function writeFlags() {
  const ts = flagsToTs(parseFlags(fs.readFileSync(FLAGS_MD, 'utf8')))
  const old = fs.existsSync(TEXT_TS) ? fs.readFileSync(TEXT_TS, 'utf8') : ''
  if (ts !== old) fs.writeFileSync(TEXT_TS, ts)
  return ts !== old
}

/** Vite plugin: make text.ts at the start of every build, and again whenever flags.md is saved. */
export function flagsPlugin() {
  return {
    name: 'variable-machine-flags',
    buildStart() {
      this.addWatchFile(FLAGS_MD)
      writeFlags()
    },
    watchChange(id) {
      if (id === FLAGS_MD) writeFlags()
    },
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(writeFlags() ? 'wrote src/explain/text.ts from flags.md' : 'text.ts already matches flags.md')
