import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { listDir, readFile } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import type { PrefRow } from '@shared/chatRow'
import CommandPreview from './CommandPreview'
import { Keep, Reject } from '../icons'
import { Explained } from '../explain/Explained'

interface LogEntry {
  timestamp: string
  model: string
  prompt: string
  system?: string
  answer: string
}

interface Group {
  prompt: string
  answers: LogEntry[]
}

interface Props {
  dataset: string
  /** pairs already in the set, so nothing is added twice */
  existing: PrefRow[]
}

/** One answer per model per prompt: the latest. */
function groupLogs(entries: LogEntry[]): Group[] {
  const byPrompt = new Map<string, Map<string, LogEntry>>()
  for (const e of entries) {
    if (!e.prompt?.trim() || !e.answer?.trim()) continue
    const m = byPrompt.get(e.prompt) ?? new Map()
    const prev = m.get(e.model)
    if (!prev || prev.timestamp < e.timestamp) m.set(e.model, e)
    byPrompt.set(e.prompt, m)
  }
  return [...byPrompt.entries()]
    .map(([prompt, m]) => ({ prompt, answers: [...m.values()] }))
    .filter((g) => g.answers.length >= 2)
    .sort((a, b) => b.answers[0].timestamp.localeCompare(a.answers[0].timestamp))
}

const appendLine = (dataset: string, row: PrefRow, source: string) => joinWords(['data', 'append', dataset, JSON.stringify(row), '--source', source])

/**
 * Build a preference set from the chat log (plan §3.2 Data): prompts that got
 * two or more answers in Chat are listed with their answers; mark one chosen
 * and one rejected, or apply a rule ("prefer model X over model Y") to every
 * prompt both answered. Each pair is a `data append` with the source
 * recorded as chat-log.
 */
export default function PreferenceBuilder({ dataset, existing }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [pick, setPick] = useState<Record<string, { chosen?: string; rejected?: string }>>({})
  const [ruleChosen, setRuleChosen] = useState('')
  const [ruleRejected, setRuleRejected] = useState('')
  const [busy, setBusy] = useState('')
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    const files = (await listDir('chat')).filter((f) => f.name.endsWith('.jsonl'))
    const texts = await Promise.all(files.map((f) => readFile(`chat/${f.name}`)))
    const entries = texts.flatMap((t) =>
      (t ?? '').split('\n').flatMap((l) => {
        try {
          return l.trim() ? [JSON.parse(l) as LogEntry] : []
        } catch {
          return []
        }
      }),
    )
    setGroups(groupLogs(entries))
  }, [])
  useEffect(() => void load(), [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('chat/') && void load(), [load]),
  )

  const have = useMemo(() => new Set(existing.map((r) => `${r.prompt}\u0000${r.chosen}\u0000${r.rejected}`)), [existing])
  const isIn = (prompt: string, c: string, r: string) => have.has(`${prompt}\u0000${c}\u0000${r}`)
  const models = useMemo(() => [...new Set(groups.flatMap((g) => g.answers.map((a) => a.model)))].sort(), [groups])
  useEffect(() => {
    if (!ruleChosen && models[0]) setRuleChosen(models[0])
    if (!ruleRejected && models[1]) setRuleRejected(models[1])
  }, [models, ruleChosen, ruleRejected])

  const rulePairs = groups.flatMap((g) => {
    const c = g.answers.find((a) => a.model === ruleChosen)
    const r = g.answers.find((a) => a.model === ruleRejected)
    if (!c || !r || ruleChosen === ruleRejected || isIn(g.prompt, c.answer, r.answer)) return []
    return [{ prompt: g.prompt, chosen: c.answer, rejected: r.answer }]
  })

  const applyRule = async () => {
    setBusy('rule')
    for (const row of rulePairs) await runCommand(appendLine(dataset, row, 'chat-log'))
    setBusy('')
  }

  const addPair = async (g: Group) => {
    const p = pick[g.prompt]
    const c = g.answers.find((a) => a.model === p?.chosen)
    const r = g.answers.find((a) => a.model === p?.rejected)
    if (!c || !r) return
    setBusy(g.prompt)
    await runCommand(appendLine(dataset, { prompt: g.prompt, chosen: c.answer, rejected: r.answer }, 'chat-log'))
    setPick(({ [g.prompt]: _, ...rest }) => rest)
    setBusy('')
  }

  const PAGE = 8
  const pages = Math.max(1, Math.ceil(groups.length / PAGE))

  return (
    <div className="prefs">
      <p className="label label--muted prefs__intro">
        {groups.length} prompts in workspace/chat have answers from two or more models. Ask the same prompts of two models in Chat to make more.
      </p>

      <div className="prefs__rule">
        <span className="label label--muted">rule: prefer</span>
        <select value={ruleChosen} onChange={(e) => setRuleChosen(e.target.value)} aria-label="chosen model">
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <span className="label label--muted">over</span>
        <select value={ruleRejected} onChange={(e) => setRuleRejected(e.target.value)} aria-label="rejected model">
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <Explained id="data.rule">
          <CommandPreview
            command={`data append ${dataset} '<pair>' --source chat-log   × ${rulePairs.length}`}
            onRun={() => void applyRule()}
            disabled={!rulePairs.length}
            running={busy === 'rule'}
            label="append pairs"
          />
        </Explained>
      </div>

      <ol className="prefs__groups">
        {groups.slice(page * PAGE, page * PAGE + PAGE).map((g) => {
          const p = pick[g.prompt] ?? {}
          return (
            <li key={g.prompt} className="prefs__group">
              <p className="prefs__prompt">{g.prompt}</p>
              <div className="prefs__answers">
                {g.answers.map((a) => {
                  const role = p.chosen === a.model ? 'chosen' : p.rejected === a.model ? 'rejected' : ''
                  return (
                    <div key={a.model} className={`prefs__answer ${role ? `is-${role}` : ''}`.trim()}>
                      <span className="label label--muted">{a.model}{role ? ` · ${role}` : ''}</span>
                      <p>{a.answer}</p>
                      <div className="candidate__actions">
                        <Explained id="data.chosen">
                          <button type="button" className="icon-text" onClick={() => setPick((x) => ({ ...x, [g.prompt]: { ...p, chosen: a.model, rejected: p.rejected === a.model ? undefined : p.rejected } }))}>
                            <Keep size={1} /> chosen
                          </button>
                        </Explained>
                        <Explained id="data.rejected">
                          <button type="button" className="icon-text" onClick={() => setPick((x) => ({ ...x, [g.prompt]: { ...p, rejected: a.model, chosen: p.chosen === a.model ? undefined : p.chosen } }))}>
                            <Reject size={1} /> rejected
                          </button>
                        </Explained>
                      </div>
                    </div>
                  )
                })}
              </div>
              {p.chosen && p.rejected && (
                <CommandPreview command={`data append ${dataset} '<pair>' --source chat-log`} onRun={() => void addPair(g)} running={busy === g.prompt} label="append pair" />
              )}
            </li>
          )
        })}
      </ol>
      {pages > 1 && (
        <div className="rows__bar">
          <button type="button" className="text-button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            prev
          </button>
          <span className="label label--muted">
            page {page + 1} of {pages}
          </span>
          <button type="button" className="text-button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            next
          </button>
        </div>
      )}
    </div>
  )
}
