import { useCallback, useEffect, useState } from 'react'
import { useOllamaModels, useLicense } from '../hooks/useOllamaModels'
import { useHelperEvent, useHelperState } from '../hooks/useHelper'
import { runCommand } from '../lib/helper'
import { readManifests } from '../lib/workspace'
import { HF_BASES, OLLAMA_LIBRARY, type LibraryModel } from '@shared/library'
import { joinWords } from '@shared/quote'
import type { OllamaModel } from '../lib/ollama'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import ConfirmButton from './ConfirmButton'
import { Explained } from '../explain/Explained'

interface Progress {
  status: string
  completed?: number
  total?: number
}

interface Props {
  onChat: (model: string) => void
  onModelfile: (model: string) => void
}

const mb = (n: number) => (n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : `${Math.round(n / 2 ** 20)} MB`)

/** Strip ":latest" for matching library tags against installed names. */
const sameTag = (a: string, b: string) => a.replace(/:latest$/, '') === b.replace(/:latest$/, '')

function LicenseLine({ model, listed }: { model: OllamaModel; listed?: LibraryModel }) {
  const info = useLicense(model)
  if (!info) return <span className="label label--muted">license …</span>
  const mismatch = listed && listed.license !== info.name
  return (
    <span className="label label--muted">
      {info.name}
      {info.note ? ` · ${info.note}` : ''}
      {mismatch ? ` · the library list says ${listed.license}` : ''}
    </span>
  )
}

function OpenBadge({ model }: { model: OllamaModel }) {
  const info = useLicense(model)
  if (!info || info.open) return null
  return <Badge warn>not open-license</Badge>
}

/**
 * Models (plan §3.2): the two inventories side by side in one panel — what
 * runs (Ollama) and what trains (Hugging Face bases) — plus the curated
 * library to pull from. Every action is a command shown before it runs.
 */
export default function ModelsPanel({ onChat, onModelfile }: Props) {
  const { models, error } = useOllamaModels()
  const { status } = useHelperState()
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [hfManifests, setHfManifests] = useState<{ folder: string; name?: string }[]>([])

  useHelperEvent(
    'ollama.progress',
    useCallback((e) => setProgress((p) => ({ ...p, [e.model]: { status: e.status, completed: e.completed, total: e.total } })), []),
  )
  useHelperEvent(
    'ollama.changed',
    useCallback((e) => {
      if (e.change === 'pulled') setProgress(({ [e.model]: _done, ...rest }) => rest)
    }, []),
  )

  const loadHf = useCallback(() => void readManifests<{ name?: string }>('hf').then(setHfManifests), [])
  useEffect(loadHf, [loadHf])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('hf/') && loadHf(), [loadHf]),
  )

  const library = OLLAMA_LIBRARY.filter((l) => !models.some((m) => sameTag(m.name, l.tag)))
  const pull = (tag: string) => {
    setProgress((p) => ({ ...p, [tag]: { status: 'starting' } }))
    void runCommand(joinWords(['ollama', 'pull', tag]))
  }

  return (
    <section className="panel" aria-label="models">
      <h2 className="panel__title label">runs on · ollama</h2>
      {error && <p className="label label--muted">{error} — is the Ollama app running?</p>}
      <div className="cards">
        {models.map((m) => {
          const listed = OLLAMA_LIBRARY.find((l) => sameTag(m.name, l.tag))
          const d = m.details ?? {}
          return (
            <Manifest
              key={m.name}
              name={m.name}
              badges={
                <>
                  <Badge>runs on</Badge>
                  <OpenBadge model={m} />
                </>
              }
              lines={[
                [d.parameter_size, d.quantization_level, d.family, mb(m.size)].filter(Boolean).join(' · '),
                // parent_model is only meaningful as a tag; published models sometimes carry their author's blob path
                d.parent_model && !d.parent_model.startsWith('/') ? `made from ${d.parent_model}` : listed?.role,
              ]}
              actions={
                <>
                  <Explained id="models.chat">
                    <button type="button" className="text-button" onClick={() => onChat(m.name)}>
                      chat
                    </button>
                  </Explained>
                  <Explained id="models.modelfile">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        void runCommand(joinWords(['ollama', 'show', m.name, '--modelfile']))
                        onModelfile(m.name)
                      }}
                    >
                      modelfile
                    </button>
                  </Explained>
                  <Explained id="models.rm">
                    <ConfirmButton label="rm" confirmLabel={`ollama rm ${m.name}?`} onConfirm={() => void runCommand(joinWords(['ollama', 'rm', m.name]))} />
                  </Explained>
                </>
              }
            >
              <LicenseLine model={m} listed={listed} />
            </Manifest>
          )
        })}
      </div>

      <h2 className="panel__title label">library · pull to run</h2>
      <div className="cards">
        {library.map((l) => {
          const p = progress[l.tag]
          const pct = p?.total ? Math.floor(((p.completed ?? 0) / p.total) * 100) : null
          const heavy = l.heavy && status?.tier === '16'
          return (
            <Manifest
              key={l.tag}
              name={l.tag}
              active={!!p}
              badges={!l.open && <Badge warn>not open-license</Badge>}
              lines={[`${l.license} (listed)`, l.role, heavy ? 'instructor machine: heavy on 16GB' : '']}
              actions={
                p ? (
                  <span className="pull-progress">
                    <span className="label">
                      {p.status}
                      {pct !== null ? ` · ${pct}% · ${mb(p.completed ?? 0)} / ${mb(p.total!)}` : ''}
                    </span>
                    {/* a rule that grows, not a filled bar: outlines only */}
                    <span className="pull-progress__rule" style={{ width: `${pct ?? 0}%` }} />
                  </span>
                ) : (
                  <Explained id="models.pull">
                    <CommandPreview command={`ollama pull ${l.tag}`} onRun={() => pull(l.tag)} label="pull" />
                  </Explained>
                )
              }
            />
          )
        })}
        {library.length === 0 && <p className="label label--muted">everything in the library is pulled</p>}
      </div>

      <h2 className="panel__title label">trains on · hugging face</h2>
      <div className="cards">
        {HF_BASES.map((b) => {
          const local = hfManifests.some((h) => h.name === b.id || h.folder === b.id.replace('/', '--'))
          return (
            <Manifest
              key={b.id}
              name={b.id.split('/')[1]}
              badges={<Badge>trains on</Badge>}
              lines={[
                `${b.id.split('/')[0]} · ${b.license} · ${b.architecture} architecture`,
                `about ${b.loraGB}GB during LoRA`,
                local ? 'in workspace/hf' : 'downloads on first train',
                `runs as ${b.runsAs}`,
              ]}
            />
          )
        })}
        {hfManifests
          .filter((h) => !HF_BASES.some((b) => b.id === h.name))
          .map((h) => (
            <Manifest key={h.folder} name={h.name ?? h.folder} badges={<Badge>trains on</Badge>} lines={['in workspace/hf']} />
          ))}
      </div>
    </section>
  )
}
