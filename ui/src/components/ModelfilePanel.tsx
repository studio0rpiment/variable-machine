import { useCallback, useEffect, useState } from 'react'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand, sendEvent } from '../lib/helper'
import { showModel } from '../lib/ollama'
import { listDir, readFile, type Entry } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import ModelfileEditor from './ModelfileEditor'
import CommandPreview from './CommandPreview'
import ModelSelect from './ModelSelect'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

/** A short, editable starting point: FROM the tag (so TEMPLATE and LICENSE are inherited) plus its SYSTEM and PARAMETER lines. */
async function startingText(tag: string) {
  const s = await showModel(tag)
  const lines = [`# a variant of ${tag}. TEMPLATE and LICENSE are inherited from it.`, `FROM ${tag}`, '']
  lines.push(`SYSTEM """${s.system ?? ''}"""`)
  for (const p of (s.parameters ?? '').split('\n').filter((l) => l.trim())) {
    const [key, ...rest] = p.trim().split(/\s+/)
    lines.push(`PARAMETER ${key} ${rest.join(' ')}`)
  }
  if (!(s.parameters ?? '').includes('temperature')) lines.push('PARAMETER temperature 0.7')
  return lines.join('\n') + '\n'
}

const defaultName = (tag: string) => `${tag.replace(/:latest$/, '').replace(/[:/]/g, '-')}-variant`

interface Props {
  /** set from elsewhere (Models → modelfile) to start from that model */
  startFrom?: { model: string; n: number }
  onChat: (model: string) => void
}

/**
 * Modelfile (plan §3.2): edit the text, see which lines are weights, create a
 * model from it. Create saves workspace/modelfiles/<name>.Modelfile and runs
 * `ollama create <name> -f …`, which the helper sends to /api/create.
 */
export default function ModelfilePanel({ startFrom, onChat }: Props) {
  const { models, reload } = useOllamaModels()
  const [base, setBase] = useState('')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [saved, setSaved] = useState<Entry[]>([])
  const [state, setState] = useState<'idle' | 'creating' | 'created' | 'failed'>('idle')
  const [createdName, setCreatedName] = useState('')

  const begin = useCallback(async (tag: string) => {
    setBase(tag)
    setName(defaultName(tag))
    setState('idle')
    setText(await startingText(tag))
  }, [])

  useEffect(() => {
    if (startFrom) void begin(startFrom.model)
  }, [startFrom, begin])

  useEffect(() => {
    if (!base && !startFrom && models[0]) void begin(models.find((m) => m.name.startsWith('smollm2'))?.name ?? models[0].name)
  }, [models, base, startFrom, begin])

  const loadSaved = useCallback(() => void listDir('modelfiles').then((e) => setSaved(e.filter((x) => x.name.endsWith('.Modelfile')))), [])
  useEffect(loadSaved, [loadSaved])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('modelfiles') && loadSaved(), [loadSaved]),
  )

  const open = async (file: string) => {
    const t = await readFile(`modelfiles/${file}`)
    if (t === null) return
    setName(file.replace(/\.Modelfile$/, ''))
    setText(t)
    setState('idle')
  }

  const valid = NAME.test(name)
  const file = `workspace/modelfiles/${name}.Modelfile`
  const command = joinWords(['ollama', 'create', name, '-f', file])

  const create = async () => {
    setState('creating')
    sendEvent({ type: 'modelfile.save', name, text })
    const ok = await runCommand(command)
    setState(ok ? 'created' : 'failed')
    if (ok) {
      setCreatedName(name)
      void reload()
    }
  }

  return (
    <section className="panel" aria-label="modelfile">
      <div className="modelfile-head">
        <ModelSelect label="start from" models={models} value={base} onChange={(v) => void begin(v)} onOpen={reload} />
        <label className="field">
          <span className="label label--muted">name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} />
        </label>
      </div>
      {!valid && name && <p className="label label--muted">names are lowercase letters, digits and . _ -</p>}

      <ModelfileEditor value={text} onChange={(t) => (setText(t), setState('idle'))} />

      <p className="modelfile__legend label label--muted">
        FROM and ADAPTER name weights: the numbers the model is made of. SYSTEM, PARAMETER, TEMPLATE, MESSAGE and LICENSE are packaged with
        them and change how the model is used without changing a single weight.
      </p>

      <div className="modelfile__run">
        <CommandPreview command={command} onRun={() => void create()} disabled={!valid || !text.trim()} running={state === 'creating'} label="create" />
        {state === 'created' && (
          <button type="button" className="text-button" onClick={() => onChat(createdName)}>
            chat with {createdName}
          </button>
        )}
        {state === 'failed' && <span className="label label--muted">didn't work; the terminal says why</span>}
      </div>

      {saved.length > 0 && (
        <>
          <h2 className="panel__title label">saved in workspace/modelfiles</h2>
          <ul className="file-list">
            {saved.map((f) => (
              <li key={f.name}>
                <button type="button" className="text-button" onClick={() => void open(f.name)}>
                  {f.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
