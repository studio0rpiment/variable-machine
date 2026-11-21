import { useEffect, useState } from 'react'
import { joinWords } from '@shared/quote'
import { runCommand } from '../lib/helper'
import { readFile } from '../lib/workspace'
import { dreamChoices, QUALITIES, qualityLabel, styleName, ZH, type Quality } from '../lib/dreamChoices'
import { say } from '../text/say'
import type { Deck } from './DreamViews'

const src = (p: string) => `/api/workspace/file?path=${encodeURIComponent(p)}`

interface Response {
  combination: string
  reading: string
  reading_zh: string
  passages: { from: string; text: string }[]
  variations: string[]
}

/**
 * The room: the page the installation's screen shows, full screen, apart from
 * the card (#room/<name>; #room/<name>/trained uses the trained reader and style). Four rows of cards, one row for each quality; the
 * visitor touches one card in each row, then asks for the reading. The page
 * runs `dream choose` and `dream respond`, the commands the card shows, with
 * the decisions made on the card (in this browser), and shows the response:
 * made ahead of time if it was, at once; made now if not, in about a minute.
 */
export default function DreamRoom({ name, trained = false }: { name: string; trained?: boolean }) {
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined)
  const [pick, setPick] = useState<Partial<Record<Quality, number>>>({})
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState(false)
  // the reading didn't come back: the terminal says why (a model or style not made yet)
  const [failed, setFailed] = useState(false)
  const [response, setResponse] = useState<Response | null>(null)

  useEffect(() => {
    void readFile(`dreams/${name}/deck.json`).then((t) => setDeck(t ? (JSON.parse(t) as Deck) : null))
  }, [name])

  const ready = QUALITIES.every((q) => pick[q])
  const read = async () => {
    if (!ready || busy) return
    setBusy(true)
    const c = dreamChoices()
    const flag = (k: string, v: string | number, fallback: string | number) => (v === fallback ? [] : [k, String(v)])
    const ok =
      (await runCommand(joinWords(['dream', 'choose', name, ...QUALITIES.flatMap((q) => [`--${q}`, String(pick[q])]), ...(words.trim() ? ['--dream', words.trim()] : [])]))) &&
      (await runCommand(joinWords(['dream', 'respond', name, ...(trained ? ['--model', c.reader] : flag('--model', c.writer, 'qwen3:4b')), ...flag('--variations', c.variations, 2), ...flag('--with', c.drawWith, 'cards'), ...(trained && c.style === 'drawings' ? ['--style', `latents/${styleName(c)}`] : []), ...(c.readWords ? ['--read-words'] : []), ...(c.chinese ? ['--chinese'] : [])])))
    const latest = ok ? (JSON.parse((await readFile(`dreams/${name}/latest.json`)) ?? 'null') as { response: string } | null) : null
    const r = latest ? (JSON.parse((await readFile(latest.response)) ?? 'null') as Response | null) : null
    setBusy(false)
    setFailed(!r)
    setResponse(r)
  }
  const again = () => {
    setResponse(null)
    setWords('')
    setPick({})
  }

  if (deck === undefined) return <main className="room" aria-label={say('projects.dream.roomLabel')} />
  if (!deck)
    return (
      <main className="room" aria-label={say('projects.dream.roomLabel')}>
        <p className="room__ask">{say('projects.dream.none', { name })}</p>
      </main>
    )

  const card = (q: Quality, n: number) => deck.qualities[q].cards[n - 1]
  return (
    <main className="room" aria-label={say('projects.dream.roomLabel')}>
      {response ? (
        <section className="room__response">
          <div className="room__chosen">
            {QUALITIES.map((q) => (
              <figure key={q}>
                <img src={src(card(q, pick[q]!).file)} alt="" />
                <figcaption>{qualityLabel(q, dreamChoices())}</figcaption>
              </figure>
            ))}
          </div>
          <div className="room__vars">
            {response.variations.map((v) => (
              <img key={v} src={src(v)} alt="" />
            ))}
          </div>
          <div className="room__reading">
            {response.reading_zh && <p lang="zh-Hant">{response.reading_zh}</p>}
            {response.reading && <p>{response.reading}</p>}
            {!response.reading && (
              <p lang="zh-Hant" className="room__lines">
                {response.passages.map((p) => p.text.slice(0, 80)).join('　')}
              </p>
            )}
            <p className="room__note">{say('projects.dream.note')}</p>
            <button type="button" className="room__again" onClick={again}>
              {say('projects.dream.again')}
            </button>
          </div>
        </section>
      ) : (
        <>
          <p className="room__ask">{say('projects.dream.ask')}</p>
          <div className="room__rows">
            {QUALITIES.map((q) => (
              <div key={q} className="room__row" role="radiogroup" aria-label={q}>
                <span className="room__q">
                  {dreamChoices().chinese && (
                    <>
                      {ZH[q]}
                      <br />
                    </>
                  )}
                  {q}
                </span>
                {deck.qualities[q].cards.map((c) => (
                  <button
                    type="button"
                    key={c.n}
                    role="radio"
                    aria-checked={pick[q] === c.n}
                    className={`room__pic ${pick[q] === c.n ? 'is-chosen' : ''} ${pick[q] && pick[q] !== c.n ? 'is-other' : ''}`.trim()}
                    onClick={() => !busy && setPick({ ...pick, [q]: c.n })}
                    disabled={busy}
                  >
                    <img src={src(c.file)} alt={c.title} />
                  </button>
                ))}
              </div>
            ))}
          </div>
          {busy ? (
            <p className="room__wait">{say('projects.dream.waiting')}</p>
          ) : (
            <div className="room__go">
              <input className="room__words" value={words} onChange={(e) => setWords(e.target.value)} placeholder={say('projects.dream.words')} aria-label={say('projects.dream.words')} maxLength={300} />
              <button type="button" className="room__again" onClick={() => void read()} disabled={!ready}>
                {ready ? say('projects.dream.read') : say('projects.dream.pickAll')}
              </button>
              {failed && <p className="room__wait">{say('projects.dream.failed')}</p>}
            </div>
          )}
        </>
      )}
    </main>
  )
}
