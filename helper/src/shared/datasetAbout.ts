import type { DatasetManifest } from './manifest.ts'

/**
 * A plain description of a dataset: its own "about" when it has one (written
 * at import, or by `data describe`), else one put together from where its rows
 * came from. Used on the Data tab's cards and written into manifests at import.
 */

const CATEGORY: Record<string, string> = {
  open_qa: 'open questions about anything',
  general_qa: 'general questions',
  classification: 'sorting things into groups',
  closed_qa: 'questions answered from a given passage',
  brainstorming: 'brainstorming lists of ideas',
  information_extraction: 'pulling facts out of a passage',
  summarization: 'summaries of a passage',
  creative_writing: 'creative writing: stories, poems, letters',
}

/** What one source contributes, in a phrase. */
function sourcePhrase(id: string, kind: string, command: string[]): string {
  if (id === 'databricks/databricks-dolly-15k') {
    const cat = command.join(' ').match(/--category (\w+)/)?.[1]
    return `questions and answers written by Databricks employees in 2023${cat ? `, only ${CATEGORY[cat] ?? cat}` : ', on everyday topics: facts, advice, summaries, brainstorming, stories'}`
  }
  if (id === 'OpenAssistant/oasst1') return 'conversations written and ranked by OpenAssistant volunteers, each a first question with its best-rated reply'
  if (id.startsWith('HuggingFaceTB/smoltalk')) return `conversations Hugging Face generated to teach small models to chat (${id.split('/').pop()})`
  if (id.startsWith('raw/')) {
    // A template fills questions from a table's rows; otherwise a model wrote rows from its passages.
    const t = command.find((c) => c.startsWith(`data template ${id} `))
    if (t) {
      const q = t.match(/--question "([^"]+)"/)?.[1]
      return `the rows of the table ${id.slice(4)}, made into questions and answers by a template${q ? ` ("${q}")` : ''}`
    }
    return `passages of ${id.slice(4)}, which a model turned into questions and answers`
  }
  if (id.startsWith('uploads/')) return `a file you brought in (${id.slice(8)})`
  if (id.startsWith('examples/')) return 'examples written for Variable Machine'
  if (kind === 'chat-log') return 'answers from your Chat log: two models answered the same question and the better one was marked'
  if (kind === 'generated') return `rows ${id} wrote`
  if (kind === 'typed') return 'rows typed by hand'
  if (kind === 'import' && id.includes('/')) return `rows from ${id} on Hugging Face`
  return `rows from ${id}`
}

export function describeDataset(m: Pick<DatasetManifest, 'about' | 'format' | 'sources' | 'command'>): string {
  if (typeof m.about === 'string' && m.about.trim()) return m.about.trim()
  if (!m.sources.length) return m.format === 'preference' ? 'Empty so far: add pairs of answers, one marked better.' : 'Empty so far: add questions with the answers you want.'
  // The biggest source first: it is what the dataset mostly is.
  const parts = [...m.sources].sort((a, b) => b.rows - a.rows).map((s) => sourcePhrase(s.id, s.kind, m.command))
  const what = parts.length > 1 ? `${parts[0]}; also ${parts.slice(1).join('; ')}` : parts[0]
  return what.charAt(0).toUpperCase() + what.slice(1) + '.'
}
