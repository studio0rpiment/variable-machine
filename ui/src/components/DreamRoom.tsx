import { useCallback, useEffect, useState } from 'react'
import { joinWords } from '@shared/quote'
import { runCommand } from '../lib/helper'
import { readFile } from '../lib/workspace'
import { say } from '../text/say'

const CATEGORIES = ['who', 'what', 'when', 'where'] as const
type Category = (typeof CATEGORIES)[number]
const ZH: Record<Category, string> = { who: '誰', what: '什麼', when: '何時', where: '何地' }

interface Dream {
  categories: Record<Category, { pictures: { file: string }[] }>
}
interface Response {
  category: Category
  chosen: string
  image: string
  reading: string
  reading_zh: string
  lines: { zh: string; dream?: string; omen?: string }[]
}

const src = (p: string) => `/api/workspace/file?path=${encodeURIComponent(p)}`
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

/**
 * The room: the page the installation's screen shows, full screen, apart from
 * the card (#room/<name>). Four pictures, one from each category, dealt at
 * random; the visitor touches one; the page runs `dream choose` and `dream
 * respond`, the same commands the card shows, and shows the response.
 */
export default function DreamRoom({ name }: { name: string }) {
  const [dream, setDream] = useState<Dream | null | undefined>(undefined)
  const [shown, setShown] = useState<Record<Category, string> | null>(null)
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState<Category | null>(null)
  const [response, setResponse] = useState<Response | null>(null)

  const deal = useCallback((d: Dream) => setShown(Object.fromEntries(CATEGORIES.map((c) => [c, pick(d.categories[c].pictures).file])) as Record<Category, string>), [])
  useEffect(() => {
    void readFile(`dreams/${name}/dream.json`).then((t) => {
      const d = t ? (JSON.parse(t) as Dream) : null
      setDream(d)
      if (d) deal(d)
    })
  }, [name, deal])

  const choose = async (c: Category) => {
    if (!shown || busy) return
    setBusy(c)
    const given = CATEGORIES.map((k) => `${k}=${shown[k]}`).join(',')
    const ok =
      (await runCommand(joinWords(['dream', 'choose', name, c, shown[c], '--shown', given, ...(words.trim() ? ['--dream', words.trim()] : [])]))) &&
      (await runCommand(joinWords(['dream', 'respond', name])))
    const latest = ok ? (JSON.parse((await readFile(`dreams/${name}/latest.json`)) ?? 'null') as { response: string } | null) : null
    const r = latest ? (JSON.parse((await readFile(latest.response)) ?? 'null') as Response | null) : null
    setBusy(null)
    setResponse(r)
  }
  const again = () => {
    setResponse(null)
    setWords('')
    if (dream) deal(dream)
  }

  if (dream === undefined) return <main className="room" aria-label={say('projects.dream.roomLabel')} />
  if (!dream || !shown)
    return (
      <main className="room" aria-label={say('projects.dream.roomLabel')}>
        <p className="room__ask">{say('projects.dream.none', { name })}</p>
      </main>
    )

  return (
    <main className="room" aria-label={say('projects.dream.roomLabel')}>
      {response ? (
        <section className="room__response">
          <div className="room__pair">
            <img src={src(response.chosen)} alt="" />
            <img src={src(response.image)} alt="" />
          </div>
          <div className="room__reading">
            <p lang="zh-Hant" className="room__lines">
              {response.lines.map((l) => l.zh).join('　')}
            </p>
            {response.reading_zh && <p lang="zh-Hant">{response.reading_zh}</p>}
            {response.reading && <p>{response.reading}</p>}
            <p className="room__note">{say('projects.dream.note')}</p>
            <button type="button" className="room__again" onClick={again}>
              {say('projects.dream.again')}
            </button>
          </div>
        </section>
      ) : (
        <>
          <p className="room__ask">{say('projects.dream.ask')}</p>
          <div className="room__four">
            {CATEGORIES.map((c) => (
              <button type="button" key={c} className={`room__pic ${busy === c ? 'is-chosen' : ''}`.trim()} onClick={() => void choose(c)} disabled={!!busy}>
                <img src={src(shown[c])} alt="" />
                <span>
                  {ZH[c]} · {c}
                </span>
              </button>
            ))}
          </div>
          {busy ? (
            <p className="room__wait">{say('projects.dream.waiting')}</p>
          ) : (
            <input className="room__words" value={words} onChange={(e) => setWords(e.target.value)} placeholder={say('projects.dream.words')} aria-label={say('projects.dream.words')} maxLength={300} />
          )}
        </>
      )}
    </main>
  )
}
