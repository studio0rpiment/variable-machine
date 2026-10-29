// The page's words, one Markdown file per tab in src/text/ (gesture.md, …), to be
// read and edited in the order the page shows them. Each file holds every word
// on its tab: headings, buttons, hints, placeholders, aria-labels, and the tab's
// explanation flags where they appear. This makes src/text/words.ts from them
// (and hands their flags to flags.mjs, for src/explain/text.ts), then checks the
// page's code against them, so a build fails, naming the entry, when a name is
// missing, unused or misspelt, or a placeholder doesn't match.
//
// An entry: "### Title", then the name in backticks on the next line, then the
// text (one paragraph). The title is only for finding your way, except on a
// flag, where it is the flag's bold title; a flag says so after its name:
// "`move.camera` flag". "#" and "##" lines are headings for finding your way.
//
// In the text: {name} is a placeholder the page fills ("{n} examples"); `code`,
// *italic* and **bold** are shown as such.
//
// In the code: say('gesture.record.tap') gives an entry as a string, rich(...)
// as something to show (with its code, italic and bold); both take the
// placeholders' values: say('gesture.record.count', { n: 12 }).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEXT_DIR = fileURLToPath(new URL('../src/text/', import.meta.url))
const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const WORDS_TS = path.join(TEXT_DIR, 'words.ts')
/** made from the Markdown, so not looked through for uses */
const GENERATED = [WORDS_TS, path.join(SRC, 'explain/text.ts'), path.join(TEXT_DIR, 'say.ts')]

/**
 * One file per tab, by the tab's id, and shared.md for what every tab shows (the
 * top bar, the terminal). A file not named here is a mistake, most likely a typo.
 */
export const TAB_FILES = ['shared', 'start', 'about', 'projects', 'models', 'modelfile', 'data', 'train', 'prefer', 'merge', 'adapters', 'chat', 'share', 'segmentation', 'speech', 'gesture']

const SLOT = /\{([^{}]*)\}/g

/** The placeholders in a text: "{n} of {k}" → ['n', 'k']. */
export function slotsOf(text) {
  return [...new Set([...text.matchAll(SLOT)].map((m) => m[1]))]
}

/** Inline marks in a text: `code`, **bold**, *italic*. */
const MARKS = /`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*/

export function parseTab(md, file) {
  const tab = path.basename(file, '.md')
  const where = `src/text/${tab}.md`
  const entries = []
  let cur = null
  const done = () => {
    if (!cur) return
    if (!cur.id) throw new Error(`${where}: "### ${cur.title}" needs its name in backticks on the next line`)
    const text = cur.lines.join(' ').replace(/\s+/g, ' ').trim()
    if (!text) throw new Error(`${where}: ${cur.id} has no text`)
    for (const s of slotsOf(text)) if (!/^\w+$/.test(s)) throw new Error(`${where}: ${cur.id} has a placeholder {${s}}: a placeholder is one word, like {name}`)
    if (/[{}]/.test(text.replace(SLOT, ''))) throw new Error(`${where}: ${cur.id} has a { or } without its other half`)
    const bare = text.replace(new RegExp(MARKS, 'g'), '')
    if (/[`*]/.test(bare)) throw new Error(`${where}: ${cur.id} has a \` or * without its other half (\`code\`, *italic*, **bold**)`)
    if (cur.flag) {
      if (slotsOf(text).length) throw new Error(`${where}: ${cur.id} is a flag, and a flag can't have placeholders`)
      if (cur.id.startsWith('panel.') && cur.id !== `panel.${tab}`) throw new Error(`${where}: ${cur.id} is another tab's flag: it belongs in ${cur.id.slice(6)}.md`)
    } else if (!cur.id.startsWith(`${tab}.`)) throw new Error(`${where}: ${cur.id} should start with "${tab}." (the file's name), or be marked a flag`)
    entries.push({ id: cur.id, title: cur.title, text, flag: cur.flag, tab })
    cur = null
  }
  for (const line of md.split('\n')) {
    const title = /^###\s+(.+?)\s*$/.exec(line)
    if (title) {
      done()
      cur = { title: title[1], id: '', flag: false, lines: [] }
      continue
    }
    if (/^#{1,2}\s/.test(line)) {
      done()
      continue
    }
    if (!cur) continue
    const id = /^`([\w.]+)`(\s+flag)?\s*$/.exec(line)
    if (!cur.id && id) {
      cur.id = id[1]
      cur.flag = !!id[2]
    } else if (!cur.id && line.trim()) throw new Error(`${where}: "### ${cur.title}" needs its name in backticks on the next line, before the text`)
    else cur.lines.push(line)
  }
  done()
  return entries
}

/** Every tab file there is, read and checked, in TAB_FILES order. */
export function readTabs() {
  if (!fs.existsSync(TEXT_DIR)) return []
  const files = fs.readdirSync(TEXT_DIR).filter((f) => f.endsWith('.md'))
  for (const f of files)
    if (!TAB_FILES.includes(f.slice(0, -3))) throw new Error(`src/text/${f}: no tab is called ${f.slice(0, -3)}. The files are named by tab: ${TAB_FILES.map((t) => `${t}.md`).join(', ')}`)
  const entries = []
  for (const t of TAB_FILES) {
    const file = path.join(TEXT_DIR, `${t}.md`)
    if (!fs.existsSync(file)) continue
    for (const e of parseTab(fs.readFileSync(file, 'utf8'), file)) {
      const twice = entries.find((x) => x.id === e.id)
      if (twice) throw new Error(`src/text/${t}.md: ${e.id} appears twice${twice.tab === t ? '' : ` (also in ${twice.tab}.md)`}`)
      entries.push(e)
    }
  }
  return entries
}

/** The flags in the tab files, for flags.mjs to put in src/explain/text.ts beside flags.md's. */
export function tabFlags() {
  return readTabs()
    .filter((e) => e.flag)
    .map(({ id, title, text, tab }) => ({ id, title, text, tab }))
}

export function wordsToTs(entries) {
  const s = (v) => JSON.stringify(v)
  const words = entries.filter((e) => !e.flag)
  const marked = words.filter((e) => MARKS.test(e.text))
  return [
    '/**',
    " * The page's words, made from the tab files in src/text/*.md by",
    ' * ui/scripts/text.mjs on every build. Edit the Markdown, not this file: it is',
    ' * written over. Use them with say() and rich() from ./say.',
    ' */',
    'export const WORDS = {',
    ...words.map((e) => `  ${s(e.id)}: ${s(e.text)},`),
    '} as const',
    '',
    '/** The entries with `code`, *italic* or **bold** in them: shown with rich(), not say(). */',
    `export type MarkedId = ${marked.length ? marked.map((e) => s(e.id)).join(' | ') : 'never'}`,
    '',
  ].join('\n')
}

/** Every .ts and .tsx file in src, but the made ones. */
function sources(dir = SRC) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return sources(p)
    return /\.tsx?$/.test(d.name) && !GENERATED.includes(p) ? [p] : []
  })
}

/** The top-level keys of the object literal starting at code[at] ("{"): { n, k: x.k } → n, k; and where it ends. */
function keysAt(code, at) {
  let depth = 0
  let part = ''
  const parts = []
  let i = at
  for (; i < code.length; i++) {
    const c = code[i]
    if (c === '{' || c === '(' || c === '[') depth++
    if (c === '}' || c === ')' || c === ']') depth--
    if (depth === 0) break
    if (c === "'" || c === '"' || c === '`') {
      // a string: skip it, braces inside it don't count (template ${} included)
      const q = c
      let j = i + 1
      let inner = 0
      for (; j < code.length; j++) {
        if (code[j] === '\\') j++
        else if (q === '`' && code[j] === '$' && code[j + 1] === '{') (inner++, j++)
        else if (q === '`' && inner && code[j] === '}') inner--
        else if (code[j] === q && !inner) break
      }
      part += code.slice(i, j + 1)
      i = j
      continue
    }
    if (depth === 1 && c === ',') (parts.push(part), (part = ''))
    else if (!(depth === 1 && c === '{' && i === at)) part += c
  }
  parts.push(part)
  const keys = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => /^(\w+)\s*(:|$)/.exec(p)?.[1] ?? null)
  return { keys, end: i }
}

const lineOf = (code, at) => code.slice(0, at).split('\n').length

/** Distance between two names, to suggest the one meant. */
function near(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/**
 * Check the code against the entries: every say()/rich() names an entry that
 * exists, with exactly its placeholders; say() isn't used on an entry with
 * marks; every entry and every flag in a tab file is used somewhere.
 * Returns the problems, each a sentence naming the entry.
 */
export function checkUses(entries) {
  const problems = []
  const byId = new Map(entries.map((e) => [e.id, e]))
  const used = new Set()
  const files = sources()
  const texts = files.map((f) => fs.readFileSync(f, 'utf8'))
  files.forEach((file, n) => {
    const code = texts[n]
    const rel = path.relative(SRC, file)
    for (const m of code.matchAll(/\b(say|rich)\(/g)) {
      const at = m.index + m[0].length
      const where = `src/${rel}:${lineOf(code, m.index)}`
      const lit = /^\s*(['"])([\w.]+)\1\s*(,\s*)?/.exec(code.slice(at))
      if (!lit) {
        problems.push(`${where}: ${m[1]}() needs the entry's name written out in quotes, so the build can check it`)
        continue
      }
      const id = lit[2]
      const e = byId.get(id)
      if (!e || e.flag) {
        const guess = [...byId.values()].filter((x) => !x.flag).sort((a, b) => near(id, a.id) - near(id, b.id))[0]
        problems.push(`${where}: ${id} is not an entry in any tab file${guess && near(id, guess.id) <= 4 ? ` (did you mean ${guess.id}, in ${guess.tab}.md?)` : ''}`)
        continue
      }
      used.add(id)
      if (m[1] === 'say' && MARKS.test(e.text)) problems.push(`${where}: ${id} has \`code\`, *italic* or **bold** in it, so it is shown with rich(), not say()`)
      const want = slotsOf(e.text)
      let given = []
      const after = at + lit[0].length
      if (lit[3]) {
        if (code[after] !== '{') {
          problems.push(`${where}: ${id}'s placeholders need to be given as { name: value, … } right there, so the build can check them`)
          continue
        }
        const { keys } = keysAt(code, after)
        if (keys.includes(null)) {
          problems.push(`${where}: ${id}'s placeholders need to be given by name, as { name: value, … }`)
          continue
        }
        given = keys
      }
      const missing = want.filter((k) => !given.includes(k))
      const extra = given.filter((k) => !want.includes(k))
      if (missing.length || extra.length)
        problems.push(
          `${where}: ${id} (${e.tab}.md) ${[missing.length && `has ${missing.map((k) => `{${k}}`).join(', ')}, not given here`, extra.length && `has no ${extra.map((k) => `{${k}}`).join(', ')}, given here`].filter(Boolean).join('; ')}`,
        )
    }
  })
  for (const e of entries) {
    if (e.flag) {
      // a tab's own flag is shown on its name in the top bar (App.tsx: `panel.${tab}`)
      if (e.id === `panel.${e.tab}`) continue
      if (!texts.some((t) => t.includes(`'${e.id}'`) || t.includes(`"${e.id}"`))) problems.push(`src/text/${e.tab}.md: the flag ${e.id} is not used anywhere on the page`)
    } else if (!used.has(e.id)) problems.push(`src/text/${e.tab}.md: ${e.id} is not used anywhere on the page`)
  }
  return problems
}

/**
 * Every flag the code names as <Explained id="…"> exists, in flags.md or a tab
 * file. (tsc checks this too, but the build doesn't run tsc.)
 */
export function checkFlagNames(ids) {
  const problems = []
  for (const file of sources()) {
    const code = fs.readFileSync(file, 'utf8')
    for (const m of code.matchAll(/<Explained\b[^>]*?\bid=(?:"([\w.]+)"|\{'([\w.]+)'\})/g)) {
      const id = m[1] ?? m[2]
      if (!ids.includes(id)) problems.push(`src/${path.relative(SRC, file)}:${lineOf(code, m.index)}: the flag ${id} is not in flags.md or any tab file`)
    }
  }
  return problems
}

/** Write words.ts from the tab files (only when it would change, so a watch build doesn't loop), then check the code against them. */
export function writeWords() {
  const entries = readTabs()
  const ts = wordsToTs(entries)
  const old = fs.existsSync(WORDS_TS) ? fs.readFileSync(WORDS_TS, 'utf8') : ''
  if (ts !== old) fs.writeFileSync(WORDS_TS, ts)
  const problems = checkUses(entries)
  if (problems.length) throw new Error(`The page's words don't match the code:\n  ${problems.join('\n  ')}`)
  return ts !== old
}

/** The tab files, for a watch build to follow. */
export function tabFiles() {
  return TAB_FILES.map((t) => path.join(TEXT_DIR, `${t}.md`)).filter((f) => fs.existsSync(f))
}
