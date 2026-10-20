import { joinWords } from '@shared/quote'
import { HF_BASES } from '@shared/library'
import { runCommand } from '../lib/helper'
import { useOllamaModels } from '../hooks/useOllamaModels'
import { usePipeline } from '../hooks/usePipeline'
import CommandPreview from './CommandPreview'
import PipelineSteps from './PipelineSteps'
import { Explained } from '../explain/Explained'
import { NEXT } from '../explain/next'

const sameTag = (a: string, b: string) => a.replace(/:latest$/, '') === b.replace(/:latest$/, '')

interface Props {
  /** the adapter the run made */
  adapter: string
  /** what it was trained on: a Hugging Face id (or a fused model's path, for Prefer) */
  base: string
  onChatPair: (a: string, b: string) => void
  /** Chat with one model, when the original isn't there to compare */
  onChat: (model: string) => void
  /** to the Adapters tab, for "try it" on the set-aside questions */
  onAdapters: () => void
}

/**
 * After a run: export → import into Ollama → Chat, as one press, with what
 * each step does. If it was exported already, straight to Chat.
 */
export default function NextStep({ adapter, base, onChatPair, onChat, onAdapters }: Props) {
  const { models } = useOllamaModels()
  const pipe = usePipeline(['export', 'fuse', 'register'])
  const mine = pipe && (pipe.params as { adapter?: string })?.adapter === adapter ? pipe : null
  const exporting = !!mine && !mine.done
  const exported = models.some((m) => sameTag(m.name, adapter))
  const original = HF_BASES.find((b) => b.id === base)?.runsAs
  const originalHere = !!original && models.some((m) => sameTag(m.name, original))
  const chat = () => (originalHere ? onChatPair(original!, adapter) : onChat(adapter))
  const line = joinWords(['export', adapter, '--quantize', 'int8'])

  return (
    <section className="next-step" aria-label="next step">
      <h2 className="panel__title label mf-lead-plain">{NEXT.title}</h2>
      <p className="mf-next next-step__intro">{NEXT.intro}</p>
      <ol className="next-step__steps">
        {NEXT.steps.map((s) => (
          <li key={s.word}>
            <span className="next-step__word">{s.word}</span> {s.text}
          </li>
        ))}
      </ol>
      <div className="mf-make__run">
        {exported && !exporting ? (
          <button type="button" className="text-button" onClick={chat}>
            open Chat: {originalHere ? `${original} and ${adapter}` : adapter} →
          </button>
        ) : (
          <Explained id="next.export">
            <CommandPreview
              command={line}
              onRun={() =>
                void runCommand(line).then((ok) => {
                  if (ok) chat()
                })
              }
              running={exporting}
              label="export, import into Ollama, then open Chat"
            />
          </Explained>
        )}
        <button type="button" className="text-button" onClick={onAdapters}>
          or test it on the set-aside questions (Adapters, try it)
        </button>
      </div>
      {mine && <PipelineSteps p={mine} />}
      {!originalHere && original && <p className="mf-next">{original} isn't installed, so Chat opens with yours alone; pull it on Models to compare.</p>}
      <p className="mf-next">{NEXT.note}</p>
    </section>
  )
}
