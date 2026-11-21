import { useCallback, useEffect, useRef, useState } from 'react'
import { joinWords } from '@shared/quote'
import type { DraftRow } from '@shared/manifest'
import { useHelperEvent } from '../hooks/useHelper'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { runCommand } from '../lib/helper'
import { listDir, readFile, readManifests } from '../lib/workspace'
import ModelSelect from './ModelSelect'
import CommandPreview from './CommandPreview'
import NextBox from './NextBox'
import { Keep, Reject } from '../icons'
import { Explained } from '../explain/Explained'
import { say } from '../text/say'

const PAGE = 10

/** The fields a reader's rows already have: the keys of the first answer that is a JSON object. */
function fieldsOf(train: string): string {
  for (const l of train.split('\n').filter(Boolean)) {
    try {
      const a = JSON.parse((JSON.parse(l) as DraftRow['row']).messages.at(-1)?.content ?? '') as unknown
      if (a && typeof a === 'object' && !Array.isArray(a)) return Object.keys(a).join(',')
    } catch {
      /* not a reader's row */
    }
  }
  return ''
}

/**
 * Drafts (`data draft`): a model writes many rows from some material, in the
 * helper, into the set's drafts.jsonl, each marked unreviewed. Here they are
 * read ten at a time: kept (`data append … --draft <id>`, edited first if need
 * be) or rejected (`data reject`).
 */
export default function DataDrafts({ dataset, train, dream }: { dataset: string; train: string; dream?: { folder: string; by: string } }) {
  const { models, reload } = useOllamaModels()
  const [model, setModel] = useState('qwen3:4b')
  const [count, setCount] = useState(200)
  const [from, setFrom] = useState('')
  const [fields, setFields] = useState(() => fieldsOf(train))
  const [sources, setSources] = useState<string[]>([])
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [edits, setEdits] = useState<Record<number, { user: string; assistant: string }>>({})
  const [shown, setShown] = useState(PAGE)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const picker = useRef<HTMLInputElement>(null)

  // material: raw text sources (not tables), and texts uploaded for drafting
  const loadSources = useCallback(async () => {
    const [raw, uploads] = await Promise.all([readManifests<{ columns?: string[] }>('raw'), listDir('uploads')])
    const list = [...raw.filter((r) => !r.columns?.length).map((r) => `raw/${r.folder}`), ...uploads.filter((u) => /\.(txt|md)$/.test(u.name)).map((u) => `uploads/${u.name}`)]
    setSources(list)
    setFrom((f) => f || list.find((s) => /notes/.test(s)) || list[0] || '')
  }, [])
  const loadDrafts = useCallback(async () => {
    const t = (await readFile(`data/${dataset}/drafts.jsonl`)) ?? ''
    setDrafts(t.split('\n').filter(Boolean).map((l) => JSON.parse(l) as DraftRow))
  }, [dataset])
  useEffect(() => void loadSources(), [loadSources])
  useEffect(() => void loadDrafts(), [loadDrafts])
  useEffect(() => setFields((f) => f || fieldsOf(train)), [dataset, train])
  useHelperEvent(
    'workspace.changed',
    useCallback(
      (e) => {
        if (e.path === `data/${dataset}/drafts.jsonl`) void loadDrafts()
        if (e.path.startsWith('uploads/') || (e.path.startsWith('raw/') && e.path.endsWith('manifest.json'))) void loadSources()
      },
      [dataset, loadDrafts, loadSources],
    ),
  )

  const upload = async (f: File) => {
    const safe = f.name.replace(/[^\w.-]/g, '-')
    setNote(say('data.drafts.uploading', { file: safe }))
    const res = await fetch(`/api/workspace/upload?name=${encodeURIComponent(safe)}`, { method: 'POST', body: f })
    const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string }
    // already uploaded earlier: use that copy
    if (res.ok || res.status === 409) {
      setNote('')
      setFrom(`uploads/${safe}`)
      void loadSources()
    } else setNote(say('data.drafts.uploadFailed', { error: body.error ?? String(res.status) }))
  }

  const fieldList = fields.split(',').map((f) => f.trim()).filter(Boolean)
  const line = joinWords(['data', 'draft', dataset, '--from', from || '<material>', ...(fieldList.length ? ['--fields', fieldList.join(',')] : []), '--count', String(count), '--model', model])
  // a dream set's rows are readings dream interpret wrote: more come from dream rows, not from the writer
  const dreamLine = dream ? joinWords(['dream', 'rows', dream.folder.replace(/^dreams\//, ''), dataset, '--by', dream.by]) : ''
  const draft = async () => {
    setBusy('draft')
    await runCommand(dream ? dreamLine : line)
    setBusy('')
  }

  const open = drafts.filter((d) => d.state === 'unreviewed')
  const text = (d: DraftRow) => edits[d.id] ?? { user: d.row.messages.find((m) => m.role === 'user')?.content ?? '', assistant: d.row.messages.at(-1)?.content ?? '' }
  // a reader's answer must stay JSON when edited
  const bad = (d: DraftRow) => {
    if (!d.row.messages.at(-1)?.content.trim().startsWith('{')) return false
    try {
      const a = JSON.parse(text(d).assistant) as unknown
      return !a || typeof a !== 'object' || Array.isArray(a)
    } catch {
      return true
    }
  }
  const keep = async (d: DraftRow) => {
    const { user, assistant } = text(d)
    const row = { messages: [...d.row.messages.filter((m) => m.role === 'system'), { role: 'user', content: user.trim() }, { role: 'assistant', content: assistant.trim() }] }
    setBusy(`keep-${d.id}`)
    await runCommand(joinWords(['data', 'append', dataset, JSON.stringify(row), '--source', d.model, ...(d.from.startsWith('raw/') ? ['--from', d.from] : []), '--draft', String(d.id)]))
    setBusy('')
  }
  const reject = async (d: DraftRow) => {
    setBusy(`reject-${d.id}`)
    await runCommand(joinWords(['data', 'reject', dataset, String(d.id)]))
    setBusy('')
  }

  return (
    <div className="generator drafts">
      {dream ? (
        <>
          <p className="mf-next">{say('data.drafts.dream', { folder: dream.folder, by: dream.by })}</p>
          <div className="generator__run">
            <CommandPreview command={dreamLine} onRun={() => void draft()} running={busy === 'draft'} label={say('data.drafts.dreamRun')} />
          </div>
        </>
      ) : (
        <>
          <p className="mf-next">{say('data.drafts.intro')}</p>
          <div className="generator__head" data-guide="data.drafts.from">
            <label className="field">
              <span className="label label--muted">{say('data.drafts.from')}</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {!from && <option value="">{say('data.drafts.from.none')}</option>}
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="text-button" onClick={() => picker.current?.click()}>
              {say('data.drafts.upload')}
            </button>
            <input ref={picker} type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          </div>
          <div className="generator__head">
            <label className="field" data-guide="data.drafts.fields">
              <span className="label label--muted">{say('data.drafts.fields')}</span>
              <input type="text" value={fields} placeholder={say('data.drafts.fields.example')} onChange={(e) => setFields(e.target.value.replace(/\s/g, ''))} />
            </label>
            <label className="field field--narrow">
              <span className="label label--muted">{say('data.drafts.count')}</span>
              <input type="text" inputMode="numeric" value={count} onChange={(e) => setCount(Math.max(1, Math.min(1000, Number(e.target.value.replace(/\D/g, '')) || 1)))} />
            </label>
            <ModelSelect label={say('data.drafts.model')} models={models} value={model} onChange={setModel} onOpen={reload} />
          </div>
          <p className="mf-next">{say('data.drafts.fields.note')}</p>
          <NextBox on={!drafts.length && !train.trim()}>
            <div className="generator__run">
              <Explained id="data.draft">
                <CommandPreview command={line} onRun={() => void draft()} disabled={!from} running={busy === 'draft'} label={say('data.drafts.run')} />
              </Explained>
              {note && <span className="label label--muted">{note}</span>}
            </div>
          </NextBox>
        </>
      )}
      {drafts.length > 0 && (
        <span className="label label--muted">
          {say('data.drafts.tally', { kept: drafts.filter((d) => d.state === 'kept').length, rejected: drafts.filter((d) => d.state === 'rejected').length, unreviewed: open.length })}
        </span>
      )}
      <ol className="candidates" data-guide="data.drafts.list">
        {open.slice(0, shown).map((d) => (
          <li key={d.id} className="candidate">
            <span className="label label--muted">{say('data.drafts.source', { id: d.id, model: d.model, from: d.from })}</span>
            <label className="field">
              <span className="label label--muted">{say('data.drafts.text')}</span>
              <textarea rows={3} value={text(d).user} onChange={(e) => setEdits((x) => ({ ...x, [d.id]: { ...text(d), user: e.target.value } }))} />
            </label>
            <label className="field">
              <span className="label label--muted">{say('data.drafts.answer')}</span>
              <textarea rows={3} value={text(d).assistant} onChange={(e) => setEdits((x) => ({ ...x, [d.id]: { ...text(d), assistant: e.target.value } }))} />
            </label>
            {bad(d) && <span className="label label--muted">{say('data.drafts.notJson')}</span>}
            <div className="candidate__actions">
              <Explained id="data.keep">
                <button type="button" className="icon-text" onClick={() => void keep(d)} disabled={!!busy || bad(d)}>
                  <Keep size={1} /> {say('data.drafts.keep')}
                </button>
              </Explained>
              <Explained id="data.reject">
                <button type="button" className="icon-text" onClick={() => void reject(d)} disabled={!!busy}>
                  <Reject size={1} /> {say('data.drafts.reject')}
                </button>
              </Explained>
            </div>
          </li>
        ))}
      </ol>
      {open.length > shown && (
        <button type="button" className="text-button" onClick={() => setShown((n) => n + PAGE)}>
          {say('data.drafts.more', { n: Math.min(PAGE, open.length - shown) })}
        </button>
      )}
    </div>
  )
}
