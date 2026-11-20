import { useEffect, useState } from 'react'
import { joinWords } from '@shared/quote'
import { runCommand } from '../lib/helper'
import { readFile } from '../lib/workspace'
import { say } from '../text/say'

const src = (p: string) => `/api/workspace/file?path=${encodeURIComponent(p)}`

type Line = 'mirror' | 'studium' | 'punctum' | 'simulacrum' | 'trained'
interface Room {
  latent: string
  set: string
  image: string
  trained: boolean
  pictures: { n: number; file: string; distance: number; brings: number }[]
  lines: Record<Line, string>
  texts: { name: string; about: string }[]
  passages: Partial<Record<Line, { from: string; text: string }[]>>
}
interface Response {
  pictures: number[]
  distance: number
  nearer: number
  drawn: string[]
  trained: boolean
  lines: Line[]
}

/** the heading over each media-theory line */
const title = (k: Line) =>
  ({
    mirror: say('projects.latent.room.lineMirror'),
    studium: say('projects.latent.room.lineStudium'),
    punctum: say('projects.latent.room.linePunctum'),
    simulacrum: say('projects.latent.room.lineSimulacrum'),
    trained: say('projects.latent.room.lineTrained'),
  })[k]

/** fewest pictures a visitor chooses: two is a line between them, not a centre */
const LEAST = 3

/**
 * The room: the page the installation's screen shows, full screen, apart from
 * the card (#latent-room/<name>), as the dream reading has its own. The set's
 * latent image beside its pictures; the visitor touches the pictures they
 * would keep, then asks for the picture those hold. The page runs `latent
 * respond`, the command the card shows, and shows the centre of the chosen
 * pictures drawn twice, how near it is to the set's, and the media-theory
 * lines beside it with the passages of the student's texts nearest each:
 * at once if that choice was drawn before, in about half a minute if not.
 */
export default function LatentRoom({ name }: { name: string }) {
  const [room, setRoom] = useState<Room | null | undefined>(undefined)
  const [pick, setPick] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [response, setResponse] = useState<Response | null>(null)

  useEffect(() => {
    void readFile(`latents/${name}/room/room.json`).then((t) => setRoom(t ? (JSON.parse(t) as Room) : null))
  }, [name])

  const ready = pick.length >= LEAST
  const toggle = (n: number) => !busy && setPick(pick.includes(n) ? pick.filter((x) => x !== n) : [...pick, n])
  const draw = async () => {
    if (!ready || busy) return
    setBusy(true)
    setFailed(false)
    const ok = await runCommand(joinWords(['latent', 'respond', name, '--pick', [...pick].sort((a, b) => a - b).join(',')]))
    const latest = ok ? (JSON.parse((await readFile(`latents/${name}/room/latest.json`)) ?? 'null') as { response: string } | null) : null
    const r = latest ? (JSON.parse((await readFile(latest.response)) ?? 'null') as Response | null) : null
    setBusy(false)
    setFailed(!r)
    setResponse(r)
  }
  const again = () => {
    setResponse(null)
    setPick([])
  }

  const label = say('projects.latent.room.label')
  if (room === undefined) return <main className="lroom" aria-label={label} />
  if (!room)
    return (
      <main className="lroom" aria-label={label}>
        <p className="lroom__ask">{say('projects.latent.room.none', { name })}</p>
      </main>
    )

  const file = (n: number) => room.pictures[n - 1]?.file
  const centre = (
    <figure className="lroom__centre">
      <img src={src(room.image)} alt={say('projects.latent.room.theirs', { n: room.pictures.length })} />
      <figcaption>{say('projects.latent.room.theirs', { n: room.pictures.length })}</figcaption>
    </figure>
  )

  if (response)
    return (
      <main className="lroom" aria-label={label}>
        <section className="lroom__response">
          <div className="lroom__drawn">
            <div className="lroom__vars">
              {response.drawn.map((d) => (
                <img key={d} src={src(d)} alt={say('projects.latent.room.yours', { n: response.pictures.length })} />
              ))}
            </div>
            <p className="lroom__cap">{say('projects.latent.room.yours', { n: response.pictures.length })}</p>
            <div className="lroom__chosen">
              {response.pictures.map((n) => (
                <img key={n} src={src(file(n))} alt="" />
              ))}
            </div>
            {centre}
          </div>
          <div className="lroom__reading">
            <p className="lroom__near">
              {response.nearer >= 0.5
                ? say('projects.latent.room.near', { d: response.distance.toFixed(2), pct: `${Math.round(response.nearer * 100)}%`, k: response.pictures.length })
                : say('projects.latent.room.far', { d: response.distance.toFixed(2), pct: `${Math.round((1 - response.nearer) * 100)}%`, k: response.pictures.length })}
            </p>
            {response.lines.map((k) => (
              <div key={k} className="lroom__line">
                <h2>{title(k)}</h2>
                <p>{room.lines[k]}</p>
                {(room.passages[k] ?? []).map((p) => (
                  <blockquote key={p.text}>
                    <p>{p.text}</p>
                    <cite>{room.texts.find((t) => t.name === p.from)?.about ?? p.from}</cite>
                  </blockquote>
                ))}
              </div>
            ))}
            <p className="lroom__note">{say('projects.latent.room.note')}</p>
            <button type="button" className="lroom__button" onClick={again}>
              {say('projects.latent.room.again')}
            </button>
          </div>
        </section>
      </main>
    )

  return (
    <main className="lroom" aria-label={label}>
      <section className="lroom__choose">
        {centre}
        <div className="lroom__side">
          <p className="lroom__ask">{say('projects.latent.room.ask', { n: LEAST })}</p>
          <div className="lroom__pics" role="group" aria-label={say('projects.latent.room.pictures')}>
            {room.pictures.map((p) => (
              <button
                type="button"
                key={p.n}
                aria-pressed={pick.includes(p.n)}
                className={`lroom__pic ${pick.includes(p.n) ? 'is-chosen' : ''}`.trim()}
                onClick={() => toggle(p.n)}
                disabled={busy}
              >
                <img src={src(p.file)} alt="" />
              </button>
            ))}
          </div>
          {busy ? (
            <p className="lroom__wait">{say('projects.latent.room.waiting')}</p>
          ) : (
            <div className="lroom__go">
              {failed && <span className="lroom__failed">{say('projects.latent.room.failed')}</span>}
              <button type="button" className="lroom__button" onClick={() => void draw()} disabled={!ready}>
                {ready ? say('projects.latent.room.draw', { n: pick.length }) : say('projects.latent.room.pickMore', { n: LEAST - pick.length })}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
