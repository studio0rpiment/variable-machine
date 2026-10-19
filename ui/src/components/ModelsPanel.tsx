import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import { BY_INPUT, BY_JOB, COMPUTER_VISION, KINDS_INTRO } from '../explain/kinds'
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

/** One variation, listed inside the card of the model it came from. */
function Variation({ model, about, onChat, onModelfile }: { model: OllamaModel; about: ReactNode; onChat: (m: string) => void; onModelfile: (m: string) => void }) {
  return (
    <li className="variation">
      <span className="variation__name">{model.name.replace(/:latest$/, '')}</span>
      <span className="variation__about">{about}</span>
      <span className="variation__actions">
        <Explained id="models.chat">
          <button type="button" className="text-button" onClick={() => onChat(model.name)}>
            chat
          </button>
        </Explained>
        <Explained id="models.modelfile">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              void runCommand(joinWords(['ollama', 'show', model.name, '--modelfile']))
              onModelfile(model.name)
            }}
          >
            modelfile
          </button>
        </Explained>
        <Explained id="models.rm">
          <ConfirmButton label="rm" confirmLabel={`ollama rm ${model.name}?`} onConfirm={() => void runCommand(joinWords(['ollama', 'rm', model.name]))} />
        </Explained>
      </span>
    </li>
  )
}

/** "What kinds of models are there?": the general map, folded away until opened. */
function KindsOfModels() {
  return (
    <details className="fold">
      <summary className="fold__summary">
        <span className="fold__mark" aria-hidden="true" />
        What kinds of models are there?
      </summary>
      <div className="fold__body">
        <p className="fold__intro">{KINDS_INTRO}</p>
        <h3 className="fold__heading label">by what goes in and out</h3>
        <dl className="model-key">
          {BY_INPUT.map((k) => (
            <Fragment key={k.name}>
              <dt>{k.name}</dt>
              <dd>{k.text}</dd>
            </Fragment>
          ))}
        </dl>
        <h3 className="fold__heading label">{COMPUTER_VISION.name}</h3>
        <p className="fold__text">{COMPUTER_VISION.text}</p>
        <h3 className="fold__heading label">by what job they are tuned for</h3>
        <dl className="model-key">
          {BY_JOB.map((k) => (
            <Fragment key={k.name}>
              <dt>{k.name}</dt>
              <dd>{k.text}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </details>
  )
}

/** Understanding the model card labels: the key to the words on the cards, folded away until opened. */
function CardKey() {
  return (
    <details className="fold">
      <summary className="fold__summary">
        <span className="fold__mark" aria-hidden="true" />
        Understanding the model card labels
      </summary>
      <div className="fold__body">
        <dl className="model-key">
          <dt>writes text</dt>
          <dd>Every model here reads text and writes text. None of them can see images or hear sound, and training here works on text only.</dd>
          <dt>thinks before answering</dt>
          <dd>It works the problem through in writing before it answers. In Chat, that reasoning shows dimmed above the answer.</dd>
          <dt>can call tools</dt>
          <dd>It can ask a program to run something for it, such as a search or a calculator. This app does not offer any tools, so here it just writes text.</dd>
          <dt>holds about … words</dt>
          <dd>How much text it can keep in mind at once: the question, any instructions and its own answer, all together.</dd>
          <dt>variations</dt>
          <dd>Models made from this one: given new instructions, trained, preference-tuned or blended. They are listed inside the card of the model they came from.</dd>
        </dl>
      </div>
    </details>
  )
}

/**
 * Models (plan §3.2). Four starters first, chosen to be as different from
 * each other as possible (the `featured` entries in shared/library.ts); the
 * rest of the curated library below, to pull when wanted; then what trains.
 * Anything made from a model (a Modelfile variant, a trained, preference-tuned
 * or blended model, or the same file under a second name) is listed as a
 * variation inside the card of the model it came from, not as a card of its own.
 * Every action is a command shown before it runs.
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

  const pull = (tag: string) => {
    setProgress((p) => ({ ...p, [tag]: { status: 'starting' } }))
    void runCommand(joinWords(['ollama', 'pull', tag]))
  }

  const inLibrary = (name: string) => OLLAMA_LIBRARY.find((l) => sameTag(l.tag, name))
  const installed = (name: string) => models.find((m) => sameTag(m.name, name))

  /**
   * What an installed model is a variation of, one step up: the same file as a
   * library model under another name; what this workspace's records say it was
   * made from; or the parent Ollama reports. Library models have no parent.
   */
  const parentOf = (m: OllamaModel): string | null => {
    if (inLibrary(m.name)) return null
    const twin = models.find((x) => x !== m && x.digest === m.digest && inLibrary(x.name))
    if (twin) return twin.name
    const here = madeHere(m.name)?.parent
    if (here) return here
    const p = m.details?.parent_model
    return p && !p.startsWith('/') ? p : null
  }
  /** The library model at the root of a variation's family, if it reaches one. */
  const rootOf = (m: OllamaModel): LibraryModel | null => {
    let name: string | null = m.name
    for (let i = 0; name && i < 8; i++) {
      const l = inLibrary(name)
      if (l) return l
      const at = installed(name)
      name = at ? parentOf(at) : null
    }
    return null
  }
  const aboutVariation = (m: OllamaModel) => {
    const twin = models.find((x) => x !== m && x.digest === m.digest && inLibrary(x.name))
    if (twin) return `The same file as ${twin.name}, under a second name.`
    return madeHere(m.name)?.text ?? <OutsideNote model={m} />
  }

  const variationsOf = (tag: string) => models.filter((m) => !inLibrary(m.name) && rootOf(m)?.tag === tag)
  const others = models.filter((m) => !inLibrary(m.name) && !rootOf(m))
  const featured = OLLAMA_LIBRARY.filter((l) => l.featured)
  const rest = OLLAMA_LIBRARY.filter((l) => !l.featured)

  /** A library model's card: pulled (with what it can do) or not yet (with the pull command), plus its variations. */
  const card = (l: LibraryModel) => {
    const m = installed(l.tag)
    const p = progress[l.tag]
    const pct = p?.total ? Math.floor(((p.completed ?? 0) / p.total) * 100) : null
    const heavy = l.heavy && status?.tier === '16'
    const vars = variationsOf(l.tag)
    const d = m?.details ?? {}
    return (
      <Manifest
        key={l.tag}
        name={l.tag}
        active={!!p}
        badges={
          <>
            {m && <Badge>pulled</Badge>}
            {m ? <OpenBadge model={m} /> : !l.open && <Badge warn>not open-license</Badge>}
          </>
        }
        actions={
          m ? (
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
          ) : p ? (
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
        {l.featured && <span className="model-why">{l.featured}</span>}
        <p className="model-about">{l.builtFor}</p>
        <span className="label label--muted">{l.maker}</span>
        {m ? (
          <>
            <AbilitiesLine model={m} />
            <span className="label label--muted">{[d.parameter_size, d.quantization_level, d.family, mb(m.size)].filter(Boolean).join(' · ')}</span>
            <LicenseLine model={m} listed={l} />
          </>
        ) : (
          <span className="label label--muted">
            {l.license} (listed){heavy ? ' · heavy on a 16GB Mac: better on an instructor machine' : ''}
          </span>
        )}
        {vars.length > 0 && (
          // Folded until opened, so a model with many variations doesn't tower over the others.
          <details className="variations">
            <summary className="fold__summary variations__summary">
              <span className="fold__mark" aria-hidden="true" />
              {vars.length} variation{vars.length > 1 ? 's' : ''}
            </summary>
            <ul className="variations__list">
              {vars.map((v) => (
                <Variation key={v.name} model={v} about={aboutVariation(v)} onChat={onChat} onModelfile={onModelfile} />
              ))}
            </ul>
          </details>
        )}
      </Manifest>
    )
  }

  return (
    <section className="panel" aria-label="models">
      <h2 className="panel__title label">start with these four</h2>
      <p className="models-intro">
        Four models, chosen to be as different from each other as possible. Pull the ones you want to try. Anything you make from one is listed inside its card as a variation.
      </p>
      <div className="folds">
        <KindsOfModels />
        <CardKey />
      </div>
      {error && <p className="label label--muted">{error} — is the Ollama app running?</p>}
      <div className="cards">{featured.map(card)}</div>

      <h2 className="panel__title label">library · pull to use</h2>
      <div className="cards">{rest.map(card)}</div>

      {others.length > 0 && (
        <>
          <h2 className="panel__title label">other models in ollama</h2>
          <div className="cards">
            {others.map((m) => (
              <Manifest
                key={m.name}
                name={m.name}
                badges={<OpenBadge model={m} />}
                actions={
                  <Explained id="models.chat">
                    <button type="button" className="text-button" onClick={() => onChat(m.name)}>
                      chat
                    </button>
                  </Explained>
                }
              >
                <p className="model-about">{madeHere(m.name)?.text ?? <OutsideNote model={m} />}</p>
                <AbilitiesLine model={m} />
                <LicenseLine model={m} />
              </Manifest>
            ))}
          </div>
        </>
      )}

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
