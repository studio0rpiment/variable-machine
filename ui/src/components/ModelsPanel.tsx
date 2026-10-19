import { useCallback, useEffect, useState } from 'react'
import { useOllamaModels, useLicense, useModelInfo } from '../hooks/useOllamaModels'
import { useMadeHere } from '../hooks/useMadeHere'
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

/** Ollama's capability words, said plainly. */
const ABILITY: Record<string, string> = {
  completion: 'writes text',
  thinking: 'thinks before answering',
  tools: 'can call tools',
  vision: 'sees images',
  embedding: 'turns text into numbers for search',
  insert: 'fills in the middle of text',
}

/** Tokens are word pieces; on average a word is about 1.3 of them. Rounded, because it's a rough guide. */
const words = (tokens: number) => {
  const w = tokens * 0.75
  const step = w >= 100_000 ? 10_000 : 1000
  return (Math.max(1, Math.round(w / step)) * step).toLocaleString('en-US')
}
/** Abilities always read in the same order, "writes text" first; anything unknown goes last. */
const abilityRank = (a: string) => {
  const i = Object.keys(ABILITY).indexOf(a)
  return i < 0 ? 99 : i
}

function AbilitiesLine({ model }: { model: OllamaModel }) {
  const info = useModelInfo(model)
  if (!info) return null
  const can = [...info.abilities].sort((a, b) => abilityRank(a) - abilityRank(b)).map((a) => ABILITY[a] ?? a)
  return (
    <span className="model-abilities">
      {can.join(' · ')}
      {info.contextTokens ? ` · holds about ${words(info.contextTokens)} words at once` : ''}
    </span>
  )
}

/** What a model with no library entry and no record here was built for, from what Ollama knows about it. */
function OutsideNote({ model }: { model: OllamaModel }) {
  const info = useModelInfo(model)
  const d = model.details ?? {}
  // parent_model is only meaningful as a tag; published models sometimes carry their author's blob path
  const parent = d.parent_model && !d.parent_model.startsWith('/') ? d.parent_model : ''
  const system = info?.system
  const told = system ? ` It is told: "${system.length > 110 ? system.slice(0, 107) + '…' : system}"` : ''
  if (parent) return <>{`A variant of ${parent}, made outside this app.${told}`}</>
  return <>{`Not in the library and not made here, so there are no notes on it.${told}`}</>
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
  const madeHere = useMadeHere()
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
      <dl className="model-key">
        <dt>writes text</dt>
        <dd>Every model here reads text and writes text. None of them can see images or hear sound, and training here works on text only.</dd>
        <dt>thinks before answering</dt>
        <dd>It works the problem through in writing before it answers. In Chat, that reasoning shows dimmed above the answer.</dd>
        <dt>can call tools</dt>
        <dd>It can ask a program to run something for it, such as a search or a calculator. This app does not offer any tools, so here it just writes text.</dd>
        <dt>holds about … words</dt>
        <dd>How much text it can keep in mind at once: the question, any instructions and its own answer, all together.</dd>
      </dl>
      {error && <p className="label label--muted">{error} — is the Ollama app running?</p>}
      <div className="cards">
        {models.map((m) => {
          // Library entry by name, or by being the very same file (same digest) as an installed library model.
          const alias = models.find((x) => x.digest === m.digest && OLLAMA_LIBRARY.some((l) => sameTag(x.name, l.tag)))
          const listed = OLLAMA_LIBRARY.find((l) => sameTag(m.name, l.tag) || (alias && sameTag(alias.name, l.tag)))
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
              lines={[]}
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
              {/* What it was built for: from the library, from this workspace's records, or what Ollama says it came from. */}
              <p className="model-about">
                {listed?.builtFor ?? madeHere(m.name) ?? <OutsideNote model={m} />}
                {alias && !sameTag(alias.name, m.name) ? ` This is the same file as ${alias.name}, under a second name.` : ''}
              </p>
              {listed && <span className="label label--muted">{listed.maker}</span>}
              <AbilitiesLine model={m} />
              <span className="label label--muted">{[d.parameter_size, d.quantization_level, d.family, mb(m.size)].filter(Boolean).join(' · ')}</span>
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
              lines={[l.maker, `${l.license} (listed)`, heavy ? 'instructor machine: heavy on 16GB' : '']}
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
            >
              <p className="model-about">{l.builtFor}</p>
            </Manifest>
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
                `${b.maker} · ${b.license} · ${b.architecture} architecture`,
                `about ${b.loraGB}GB during LoRA · ${local ? 'in workspace/hf' : 'downloads on first train'}`,
                `runs as ${b.runsAs}`,
              ]}
            >
              <p className="model-about">{b.builtFor}</p>
            </Manifest>
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
