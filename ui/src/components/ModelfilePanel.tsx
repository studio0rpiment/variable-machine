import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { useHelperEvent } from '../hooks/useHelper'
import { runCommand, sendEvent } from '../lib/helper'
import { chatOnce, showModel } from '../lib/ollama'
import { listDir, readFile } from '../lib/workspace'
import { joinWords } from '@shared/quote'
import { parseModelfile } from '@shared/modelfile'
import { OLLAMA_LIBRARY } from '@shared/library'
import { PRESETS, type Preset } from '../explain/presets'
import { FIELDS, LINE_KINDS, MODELFILE_INTRO, SIZE_NOTE } from '../explain/modelfileLines'
import { Explained } from '../explain/Explained'
import ModelfileEditor from './ModelfileEditor'
import CommandPreview from './CommandPreview'
import ModelSelect from './ModelSelect'
import Manifest from './Manifest'

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const bare = (tag: string) => tag.replace(/:latest$/, '')
const slug = (tag: string) => bare(tag).replace(/[:/]/g, '-')

interface Form {
  base: string
  system: string
  temperature: number
  exampleUser: string
  exampleAssistant: string
  /** let it pick from every word (top_k 0, top_p 1), so temperature shows its full effect */
  openChoice: boolean
}

/** Quote a value for a Modelfile: triple quotes, which may span lines. */
const q = (v: string) => `"""${v.replace(/"""/g, '"“"')}"""`

/**
 * The Modelfile the form makes. FROM the chosen model, so its template,
 * license and weights are inherited; its own `stop` settings are copied over
 * so answers still end where they should; then the student's words.
 */
function buildModelfile(f: Form, inherited: string[]) {
  return [
    `# a variant of ${f.base}, made in the Modelfile tab: same weights, new words`,
    `FROM ${f.base}`,
    '',
    ...(f.system.trim() ? [`SYSTEM ${q(f.system.trim())}`] : []),
    `PARAMETER temperature ${f.temperature}`,
    ...(f.openChoice ? ['PARAMETER top_k 0', 'PARAMETER top_p 1'] : []),
    ...inherited,
    ...(f.exampleUser.trim() && f.exampleAssistant.trim() ? ['', `MESSAGE user ${q(f.exampleUser.trim())}`, `MESSAGE assistant ${q(f.exampleAssistant.trim())}`] : []),
    '',
  ].join('\n')
}

interface Answer {
  text: string
  thinking: string
  state: 'idle' | 'streaming' | 'done' | 'error'
  meta?: string
}
const EMPTY: Answer = { text: '', thinking: '', state: 'idle' }

/** "Write your own": the card that sits with the presets and starts from blank words. */
const OWN = { id: 'own', group: 'your own', title: 'write your own', blurb: 'Start from blank: your own instructions, how adventurous, and an example to imitate.' }

/** Each card keeps one name as it moves between the grid, the left and the rail, so the browser can glide it there. */
const glide = (id: string): CSSProperties => ({ viewTransitionName: `preset-${id}` })

/** Change the layout with the cards gliding to their new places, where the browser can and the student hasn't asked for less motion. */
function moving(change: () => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (d.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) d.startViewTransition(() => flushSync(change))
  else change()
}

/** One side of the comparison. */
function AnswerColumn({ label, model, a, placeholder }: { label: string; model: string; a: Answer; placeholder?: string }) {
  return (
    <div className="mf-answer">
      <span className="label label--muted">{label}</span>
      <span className="mf-answer__model">{model}</span>
      {a.thinking && (
        <details className="exchange__thinking" open={a.state === 'streaming' && !a.text}>
          <summary className="label">thinking</summary>
          <p>{a.thinking}</p>
        </details>
      )}
      {a.state === 'idle' && !a.text && placeholder ? (
        <p className="mf-answer__text mf-answer__text--waiting">{placeholder}</p>
      ) : (
        <p className={`mf-answer__text ${a.state === 'streaming' ? 'is-streaming' : ''}`.trim()}>{a.text || '…'}</p>
      )}
      {a.meta && <span className="label label--muted">{a.meta}</span>}
    </div>
  )
}

interface Props {
  /** set from elsewhere (Models → modelfile) to start from that model, or open that variant */
  startFrom?: { model: string; n: number }
  onChatPair?: (a: string, b: string) => void
}

/**
 * Modelfile: change how a model behaves using only words. A form, not a file:
 * standing instructions (SYSTEM), how adventurous (PARAMETER temperature) and
 * an example to imitate (MESSAGE), with presets to start from. "Make variant"
 * saves the Modelfile and runs `ollama create`; then the original and the
 * variant answer one question side by side, right here. The file itself is one
 * fold away, with each line's meaning.
 */
export default function ModelfilePanel({ startFrom, onChatPair }: Props) {
  const { models, reload } = useOllamaModels()
  const [form, setForm] = useState<Form>({ base: '', system: '', temperature: 0.7, exampleUser: '', exampleAssistant: '', openChoice: false })
  const [preset, setPreset] = useState<Preset | null>(null)
  /** null: all presets as cards; otherwise the chosen one (a preset, or your own words) is being worked on. */
  const [chosen, setChosen] = useState<Preset | 'own' | null>(null)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [sample, setSample] = useState('')
  const [inherited, setInherited] = useState<string[]>([])
  const [state, setState] = useState<'idle' | 'making' | 'made' | 'failed'>('idle')
  const [made, setMade] = useState<{ name: string; base: string } | null>(null)
  const [answers, setAnswers] = useState<{ original: Answer; variant: Answer }>({ original: EMPTY, variant: EMPTY })
  const [yours, setYours] = useState<{ name: string; from: string; system?: string }[]>([])
  const aborts = useRef<AbortController[]>([])
  const formRef = useRef<HTMLElement>(null)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setState('idle')
  }

  // A sensible first model: qwen3:4b follows instructions well; else a starter that is installed.
  useEffect(() => {
    if (form.base || startFrom || !models.length) return
    const pick = ['qwen3:4b', ...OLLAMA_LIBRARY.filter((l) => l.featured).map((l) => l.tag)].find((t) => models.some((m) => bare(m.name) === bare(t)))
    if (pick) set('base', pick)
  }, [models, form.base, startFrom])

  // The chosen model's own stop settings, so the variant's answers still end in the right place.
  useEffect(() => {
    if (!form.base) return
    void showModel(form.base).then(
      (s) =>
        setInherited(
          (s.parameters ?? '')
            .split('\n')
            .map((l) => l.trim().split(/\s+/))
            .filter(([k]) => k === 'stop')
            .map(([k, ...v]) => `PARAMETER ${k} ${v.join(' ')}`),
        ),
      () => setInherited([]),
    )
  }, [form.base])

  // Name follows the model and preset until the student types their own.
  useEffect(() => {
    if (!nameTouched && form.base) setName(`${slug(form.base)}-${preset?.id ?? 'variant'}`)
  }, [form.base, preset, nameTouched])

  const applyPreset = (p: Preset) => {
    setPreset(p)
    setForm((f) => ({ ...f, system: p.system, temperature: p.temperature, exampleUser: p.example?.user ?? '', exampleAssistant: p.example?.assistant ?? '', openChoice: !!p.openChoice }))
    setSample(p.sample)
    setState('idle')
    setMade(null)
    setAnswers({ original: EMPTY, variant: EMPTY })
  }

  const choose = (c: Preset | 'own') =>
    moving(() => {
      setChosen(c)
      if (c !== 'own') return applyPreset(c)
      setPreset(null)
      setForm((f) => ({ ...f, system: '', temperature: 0.7, exampleUser: '', exampleAssistant: '', openChoice: false }))
      setSample('')
      setState('idle')
      setMade(null)
      setAnswers({ original: EMPTY, variant: EMPTY })
    })
  const allPresets = () => moving(() => setChosen(null))

  // Bring the top of what just changed into view before the new layout is captured, so cards glide to where they will be seen.
  const topRef = useRef<HTMLDivElement>(null)
  const chosenKey = chosen === null ? '' : chosen === 'own' ? 'own' : chosen.id
  useLayoutEffect(() => {
    // Once chosen, the intro has done its job: the chosen card goes to the top so the answers below it are in view.
    topRef.current?.scrollIntoView({ block: chosen ? 'start' : 'nearest' })
  }, [chosenKey])

  /** The student's own variants: Modelfiles this tab wrote (not the ones Export writes for trained models). */
  const loadYours = useCallback(async () => {
    const files = (await listDir('modelfiles')).filter((f) => f.name.endsWith('.Modelfile'))
    const out: { name: string; from: string; system?: string }[] = []
    for (const f of files) {
      const text = await readFile(`modelfiles/${f.name}`)
      if (!text || /^# made by Variable Machine from adapter/m.test(text)) continue
      const p = parseModelfile(text)
      if (!p.from || p.from.startsWith('.') || p.from.startsWith('/')) continue
      out.push({ name: f.name.replace(/\.Modelfile$/, ''), from: p.from, system: p.system })
    }
    setYours(out)
  }, [])
  useEffect(() => void loadYours(), [loadYours])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('modelfiles/') && void loadYours(), [loadYours]),
  )

  /** Load a variant back into the form. */
  const open = useCallback(
    async (variant: string) => {
      const text = await readFile(`modelfiles/${variant}.Modelfile`)
      if (!text) return
      const p = parseModelfile(text)
      const user = p.messages.find((m) => m.role === 'user')?.content ?? ''
      const assistant = p.messages.find((m) => m.role === 'assistant')?.content ?? ''
      setForm({
        base: p.from ?? '',
        system: p.system ?? '',
        temperature: Number(p.parameters.temperature ?? 0.7),
        exampleUser: user,
        exampleAssistant: assistant,
        openChoice: p.parameters.top_k === 0 && p.parameters.top_p === 1,
      })
      setPreset(null)
      setChosen('own')
      setName(variant)
      setNameTouched(true)
      setMade(models.some((m) => bare(m.name) === variant) ? { name: variant, base: p.from ?? '' } : null)
      setState('idle')
      setAnswers({ original: EMPTY, variant: EMPTY })
      // "open" sits at the bottom of the page; bring the form it just filled into view.
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    },
    [models],
  )

  // Arriving from a Models card: open that variant if it is one of yours, else start from that model.
  useEffect(() => {
    if (!startFrom) return
    const own = yours.find((y) => y.name === bare(startFrom.model))
    if (own) void open(own.name)
    else set('base', startFrom.model)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFrom])

  const text = useMemo(() => buildModelfile(form, inherited), [form, inherited])
  const file = `workspace/modelfiles/${name}.Modelfile`
  const command = joinWords(['ollama', 'create', name, '-f', file])
  const valid = NAME.test(name) && !!form.base && name !== bare(form.base)

  const ask = (question: string, pair: { name: string; base: string }) => {
    aborts.current.forEach((a) => a.abort())
    aborts.current = []
    const run = (key: 'original' | 'variant', model: string) => {
      const ctrl = new AbortController()
      aborts.current.push(ctrl)
      setAnswers((s) => ({ ...s, [key]: { text: '', thinking: '', state: 'streaming' } }))
      chatOnce(
        model,
        question,
        (d) =>
          setAnswers((s) => ({
            ...s,
            [key]: {
              text: s[key].text + d.content,
              thinking: s[key].thinking + d.thinking,
              state: d.error ? 'error' : d.done ? 'done' : 'streaming',
              meta: d.error ?? (d.done ? [d.evalCount && `${d.evalCount} tokens`, d.durationMs && `${(d.durationMs / 1000).toFixed(1)}s`].filter(Boolean).join(' · ') : undefined),
            },
          })),
        ctrl.signal,
      ).catch((e: Error) => !ctrl.signal.aborted && setAnswers((s) => ({ ...s, [key]: { ...s[key], state: 'error', meta: e.message } })))
    }
    run('original', pair.base)
    run('variant', pair.name)
  }

  const make = async () => {
    setState('making')
    sendEvent({ type: 'modelfile.save', name, text })
    const ok = await runCommand(command)
    setState(ok ? 'made' : 'failed')
    if (!ok) return
    void reload()
    const pair = { name, base: form.base }
    setMade(pair)
    // See the change straight away: the same question to both.
    if (sample.trim()) ask(sample.trim(), pair)
  }

  const asking = answers.original.state === 'streaming' || answers.variant.state === 'streaming'

  return (
    <section className="panel mf" aria-label="modelfile">
      <header className="mf__intro">
        <h1 className="start__title">{MODELFILE_INTRO.title}</h1>
        <p className="start__text">{MODELFILE_INTRO.text}</p>
      </header>

      <div ref={topRef} className="mf-top" />
      {!chosen ? (
        <>
          {/* The one flag about presets lives on this line (focusable so the keyboard can open it too), not on every card. */}
          <Explained id="modelfile.preset">
            <h2 className="panel__title label mf-lead" tabIndex={0}>
              1 · choose a preset, or write your own
            </h2>
          </Explained>
          <p className="mf-next">Then you'll see what it adds to the model, make it into a variant, and ask the original and your variant the same question.</p>
          <div className="mf-presets">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className="mf-preset" style={glide(p.id)} onClick={() => choose(p)}>
                <span className="mf-preset__group label label--muted">{p.group}</span>
                <span className="mf-preset__title">{p.title}</span>
                <span className="mf-preset__blurb">{p.blurb}</span>
                {p.followsWell && <span className="mf-preset__follows label label--muted">follows well: {p.followsWell}</span>}
              </button>
            ))}
            <button type="button" className="mf-preset mf-preset--own" style={glide(OWN.id)} onClick={() => choose('own')}>
              <span className="mf-preset__group label label--muted">{OWN.group}</span>
              <span className="mf-preset__title">{OWN.title}</span>
              <span className="mf-preset__blurb">{OWN.blurb}</span>
            </button>
          </div>
        </>
      ) : (
        <div className="mf-studio">
          <div className="mf-studio__main">
            <div className="mf-chosen" style={glide(chosen === 'own' ? OWN.id : chosen.id)}>
              <span className="mf-preset__group label label--muted">{chosen === 'own' ? OWN.group : chosen.group}</span>
              <span className="mf-chosen__title">{chosen === 'own' ? OWN.title : chosen.title}</span>
              <span className="mf-chosen__blurb">{chosen === 'own' ? OWN.blurb : chosen.blurb}</span>
              {chosen !== 'own' && chosen.followsWell && <span className="mf-preset__follows label label--muted">follows well: {chosen.followsWell}</span>}
            </div>

            <section className="mf-part" aria-label="try it">
              <h2 className="panel__title label mf-lead-plain">try it: press the line below, then compare the two answers</h2>
              <div className="mf-make mf-make--one">
                <label className="field mf-make__sample">
                  <span className="label label--muted">a question to ask both</span>
                  <input type="text" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="e.g. How do bees make honey?" />
                </label>
              </div>
                           <div className="mf-make__run">
                <Explained id="modelfile.create">
                  <CommandPreview command={command} onRun={() => void make()} disabled={!valid} running={state === 'making'} label="make variant and ask both" />
                </Explained>
                {made && (
                  <Explained id="modelfile.try">
                    <button type="button" className="text-button" onClick={() => sample.trim() && !asking && ask(sample.trim(), made)} aria-disabled={!sample.trim() || asking || undefined}>
                      ask both again
                    </button>
                  </Explained>
                )}
                {made && onChatPair && (
                  <Explained id="modelfile.chat">
                    <button type="button" className="text-button" onClick={() => onChatPair(made.base, made.name)}>
                      keep talking in Chat
                    </button>
                  </Explained>
                )}
                {state === 'failed' && <span className="label label--muted">didn't work; the terminal says why</span>}
              </div>
              {/* Always here, so it's clear where the answers will appear. */}
              <div className="mf-compare">
                <AnswerColumn label="the original" model={made?.base ?? form.base} a={answers.original} placeholder={`${form.base || 'the model'} as it is. Its answer appears here.`} />
                <AnswerColumn label="your variant" model={made?.name ?? name} a={answers.variant} placeholder={`${form.base || 'the model'} with ${chosen === 'own' ? 'your words' : 'this preset'} added. Its answer appears here.`} />
              </div>

            </section>

            <section className="mf-part" ref={formRef} aria-label="what it adds">
              <h2 className="panel__title label mf-lead-plain">
                {chosen === 'own' ? 'what you add' : 'what this preset adds'} to {form.base || 'the model'}: change anything
              </h2>
              <div className="mf-form">
                <div className="mf-form__row">
                  <Explained id="modelfile.startFrom">
                    <ModelSelect label="start from" models={models} value={form.base} onChange={(v) => set('base', v)} onOpen={reload} />
                  </Explained>
                  <p className="mf-note">{SIZE_NOTE}</p>
                </div>

                <label className="mf-field">
                  <span className="mf-field__head">
                    <span className="mf-field__title">{FIELDS.instructions.title}</span>
                    <span className="label label--muted">the {FIELDS.instructions.line} line</span>
                  </span>
                  <span className="mf-field__help">{FIELDS.instructions.text}</span>
                  <textarea rows={3} value={form.system} onChange={(e) => set('system', e.target.value)} placeholder="e.g. Answer in exactly one short sentence." />
                </label>

                <label className="mf-field">
                  <span className="mf-field__head">
                    <span className="mf-field__title">
                      {FIELDS.temperature.title} <span className="mf-field__value">{form.temperature.toFixed(1)}</span>
                    </span>
                    <span className="label label--muted">the {FIELDS.temperature.line} line</span>
                  </span>
                  <span className="mf-field__help">{FIELDS.temperature.text}</span>
                  <input type="range" min={0} max={2} step={0.1} value={form.temperature} onChange={(e) => set('temperature', Number(e.target.value))} aria-label="temperature" />
                  <span className="mf-scale label label--muted">
                    <span>careful</span>
                    <span>surprising</span>
                    <span>falls apart</span>
                  </span>
                </label>

                <label className="mf-check">
                  <input type="checkbox" checked={form.openChoice} onChange={(e) => set('openChoice', e.target.checked)} />
                  <span className="mf-check__body">
                    <span className="mf-field__head">
                      <span className="mf-field__title">{FIELDS.openChoice.title}</span>
                      <span className="label label--muted">the {FIELDS.openChoice.line} lines</span>
                    </span>
                    <span className="mf-field__help">{FIELDS.openChoice.text}</span>
                  </span>
                </label>

                <div className="mf-field">
                  <span className="mf-field__head">
                    <span className="mf-field__title">{FIELDS.example.title} (optional)</span>
                    <span className="label label--muted">two {FIELDS.example.line} lines</span>
                  </span>
                  <span className="mf-field__help">{FIELDS.example.text}</span>
                  <div className="mf-example">
                    <label className="field">
                      <span className="label label--muted">a question</span>
                      <input type="text" value={form.exampleUser} onChange={(e) => set('exampleUser', e.target.value)} placeholder="e.g. Why is the sky blue?" />
                    </label>
                    <label className="field">
                      <span className="label label--muted">the answer you would want</span>
                      <textarea rows={2} value={form.exampleAssistant} onChange={(e) => set('exampleAssistant', e.target.value)} placeholder="e.g. Sunlight scatters off the air, and blue light scatters the most." />
                    </label>
                  </div>
                </div>
                <div className="mf-make mf-make--one">
                  <Explained id="modelfile.name">
                    <label className="field mf-make__name">
                      <span className="label label--muted">name of the variant</span>
                      <input type="text" value={name} onChange={(e) => (setNameTouched(true), setName(e.target.value.toLowerCase()))} spellCheck={false} />
                    </label>
                  </Explained>
                </div>
                {name === bare(form.base) && <p className="label label--muted">a variant needs a name of its own</p>}
              </div>
              <p className="mf-next">Changed something? Press make variant and ask both again, above.</p>
            </section>
          </div>

          <nav className="mf-rail" aria-label="other presets">
            <button type="button" className="text-button mf-rail__all" onClick={allPresets}>
              all presets
            </button>
            {PRESETS.filter((p) => chosen === 'own' || p.id !== chosen.id).map((p) => (
              <button key={p.id} type="button" className="mf-rail__item" style={glide(p.id)} onClick={() => choose(p)}>
                <span className="label label--muted">{p.group}</span> / {p.title}
              </button>
            ))}
            {chosen !== 'own' && (
              <button type="button" className="mf-rail__item" style={glide(OWN.id)} onClick={() => choose('own')}>
                <span className="label label--muted">{OWN.group}</span> / {OWN.title}
              </button>
            )}
          </nav>
        </div>
      )}

      <div className="folds">
        <details className="fold">
          <summary className="fold__summary">
            <span className="fold__mark" aria-hidden="true" />
            What the lines in a Modelfile mean
          </summary>
          <div className="fold__body">
            <dl className="model-key">
              {LINE_KINDS.map((k) => (
                <Fragment key={k.word}>
                  <dt>
                    {k.word} <span className="label label--muted">{k.weights ? 'weights' : 'not weights'}</span>
                  </dt>
                  <dd>{k.text}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </details>
        <details className="fold">
          <summary className="fold__summary">
            <span className="fold__mark" aria-hidden="true" />
            See the Modelfile this makes
          </summary>
          <div className="fold__body">
            <p className="fold__text">This is the file your words become. Only the FROM line points at weights; everything else travels with them.</p>
            <ModelfileEditor value={text} />
          </div>
        </details>
      </div>

      {yours.length > 0 && (
        <>
          <h2 className="panel__title label">your variants · workspace/modelfiles</h2>
          <div className="cards">
            {yours.map((y) => (
              <Manifest
                key={y.name}
                name={y.name}
                lines={[`from ${y.from}`]}
                actions={
                  <Explained id="modelfile.open">
                    <button type="button" className="text-button" onClick={() => void open(y.name)}>
                      open
                    </button>
                  </Explained>
                }
              >
                {y.system && <p className="model-about">{y.system.length > 140 ? y.system.slice(0, 137) + '…' : y.system}</p>}
              </Manifest>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
