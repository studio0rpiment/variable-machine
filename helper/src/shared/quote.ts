/**
 * Shell-style words, both ways. The terminal is not a shell, but the lines it
 * echoes should be re-typable, so the GUI quotes the way the parser splits.
 */

/** Quote one word only if it needs it. Newlines become \n inside double quotes. */
export function quote(word: string): string {
  if (word !== '' && /^[\w@%+=:,./-]+$/.test(word)) return word
  return '"' + word.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
}

export function joinWords(words: string[]): string {
  return words.map(quote).join(' ')
}

/** Split a line into words: whitespace separates, '…' is literal, "…" honours \" \\ and \n. */
export function splitWords(line: string): string[] {
  const words: string[] = []
  let word = ''
  let inWord = false
  let quoteChar: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoteChar === "'") {
      if (c === "'") quoteChar = null
      else word += c
    } else if (quoteChar === '"') {
      if (c === '"') quoteChar = null
      else if (c === '\\' && i + 1 < line.length) {
        const n = line[++i]
        word += n === 'n' ? '\n' : n
      } else word += c
    } else if (c === '"' || c === "'") {
      quoteChar = c
      inWord = true
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word)
      word = ''
      inWord = false
    } else {
      word += c
      inWord = true
    }
  }
  if (quoteChar) throw new Error('unclosed quote')
  if (inWord) words.push(word)
  return words
}
