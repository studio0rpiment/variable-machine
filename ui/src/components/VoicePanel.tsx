import { useCallback, useEffect, useRef, useState } from 'react'
import { VOICE_MODELS, type VoiceModel } from '@shared/kinds'
import { joinWords } from '@shared/quote'
import { runCommand } from '../lib/helper'
import { readManifests } from '../lib/workspace'
import { startRecording, type Recording } from '../lib/record'
import { useHelperEvent } from '../hooks/useHelper'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import { KindLine } from './ToolCard'
import { Explained } from '../explain/Explained'

const fileUrl = (rel: string) => `/api/workspace/file?path=${encodeURIComponent(rel)}`
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

interface AudioFile {
  made: 'spoken' | 'recorded'
  license: string
  text?: string
  model?: string
  transcript?: string
  heardBy?: string
}
interface AudioSet {
  folder: string
  name: string
  license: string
  files: Record<string, AudioFile>
}

/** A short name from the first words: "Utah teapot, 1974" → utah-teapot-1974. */
const nameFrom = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .split('-')
    .slice(0, 4)
    .join('-')
    .replace(/-+$/, '')

export function VoiceCard({ m }: { m: VoiceModel }) {
  return (
    <Manifest
      name={m.name}
      badges={<Badge>{m.kind}</Badge>}
      lines={[`${m.maker} · ${m.license}`, `${m.repo} · about ${m.mb} MB · downloads into workspace/hf the first time it runs`]}
    >
      <p className="model-about">{m.builtFor}</p>
    </Manifest>
  )
}

/**
 * Voice: the speaks and listens kinds, used as they are. Type something and a
 * model reads it aloud (`speak`); record your voice, or pick any sound here,
 * and Qwen3-ASR writes down what it hears (`listen`). Sounds are WAV files in
 * workspace/audio/<set>/, each with where it came from and what was heard.
 */
export default function VoicePanel() {
  const [sets, setSets] = useState<AudioSet[]>([])
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [touchedName, setTouchedName] = useState(false)
  const [busy, setBusy] = useState('')
  const [rec, setRec] = useState<Recording | null>(null)
  const [level, setLevel] = useState(0)
  const [note, setNote] = useState('')
  const raf = useRef(0)

  const load = useCallback(() => void readManifests<AudioSet>('audio').then((m) => setSets(m.sort((a, b) => a.folder.localeCompare(b.folder)))), [])
  useEffect(load, [load])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('audio/') && e.path.endsWith('manifest.json') && load(), [load]),
  )
  useEffect(() => {
    if (!touchedName) setName(nameFrom(text))
  }, [text, touchedName])

  const run = async (key: string, line: string) => {
    setBusy(key)
    const ok = await runCommand(line)
    setBusy('')
    return ok
  }
  const speakLine = joinWords(['speak', name || '<name>', text.trim() || '<text>'])
  const taken = sets.find((s) => s.folder === 'spoken')?.files[`${name}.wav`]

  const record = async () => {
    if (rec) {
      cancelAnimationFrame(raf.current)
      setRec(null)
      setLevel(0)
      const blob = await rec.stop()
      const file = `rec-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav`
      const res = await fetch(`/api/workspace/upload?name=${file}&audio=recorded&license=${encodeURIComponent('your own voice')}`, { method: 'POST', body: blob })
      const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string }
      if (!res.ok || !body.path) return setNote(body.error ?? 'saving the recording failed')
      setNote('')
      // what it heard is the point of recording here, so listen straight away
      await run(`listen ${body.path}`, `listen ${body.path}`)
      return
    }
    try {
      const r = await startRecording()
      setRec(r)
      setNote('')
      const tick = () => {
        setLevel(r.level())
        raf.current = requestAnimationFrame(tick)
      }
      tick()
    } catch (e) {
      setNote(`no microphone: ${(e as Error).message}`)
    }
  }

  return (
    <section className="panel" aria-label="voice">
      <h2 className="panel__title label">voices</h2>
      <p className="models-intro">
        <KindLine kind="speaks" />
      </p>
      <p className="models-intro">
        <KindLine kind="listens" />
      </p>
      <div className="cards">
        {VOICE_MODELS.map((m) => (
          <VoiceCard key={m.name} m={m} />
        ))}
      </div>

      <h2 className="panel__title label">speak · text in, a voice out</h2>
      <div className="voice-speak">
        <label className="field">
          <span className="label label--muted">what to say</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Utah teapot, 1974. Glazed white ceramic." />
        </label>
        <label className="field voice-speak__name">
          <span className="label label--muted">file name · workspace/audio/spoken</span>
          <input type="text" value={name} spellCheck={false} onChange={(e) => (setTouchedName(true), setName(e.target.value.toLowerCase()))} />
        </label>
        {taken && <span className="label label--muted">a sound with that name exists</span>}
        <Explained id="voice.speak">
          <CommandPreview command={speakLine} onRun={() => void run('speak', speakLine).then((ok) => ok && (setText(''), setTouchedName(false)))} disabled={!text.trim() || !NAME.test(name) || !!taken} running={busy === 'speak'} label="speak" />
        </Explained>
      </div>

      <h2 className="panel__title label">listen · a recording in, what it says out</h2>
      <div className="voice-record">
        <Explained id="voice.record">
          <button type="button" className={`text-button ${rec ? 'is-active' : ''}`.trim()} onClick={() => void record()} aria-pressed={!!rec}>
            {rec ? 'stop, save and listen' : 'record your voice'}
          </button>
        </Explained>
        {rec && <span className="voice-level" style={{ width: `${Math.min(100, level * 140)}%` }} aria-hidden="true" />}
        {note && <span className="label">{note}</span>}
        <span className="label label--muted">saved as WAV in workspace/audio/recorded; nothing leaves this computer</span>
      </div>

      <h2 className="panel__title label">sounds · workspace/audio</h2>
      {sets.length === 0 && <p className="label label--muted">no sounds yet: speak something, or record your voice</p>}
      {sets.map((s) => (
        <div key={s.folder} className="voice-set">
          <span className="label label--muted">
            {s.folder} · {s.license}
          </span>
          <ol className="voice-files">
            {Object.entries(s.files)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([file, f]) => {
                const rel = `audio/${s.folder}/${file}`
                const listen = `listen ${rel}`
                return (
                  <li key={file} className="voice-file">
                    <span className="label">{file}</span>
                    <audio controls preload="none" src={fileUrl(rel)} />
                    {f.made === 'spoken' ? (
                      <p className="voice-heard">
                        <span className="label label--muted">spoken by {f.model?.split('/')[1]}</span> {f.text}
                      </p>
                    ) : (
                      <span className="label label--muted">recorded · {f.license}</span>
                    )}
                    {f.transcript !== undefined ? (
                      <p className="voice-heard">
                        <span className="label label--muted">heard by {f.heardBy?.split('/')[1]}</span> {f.transcript || '(nothing)'}
                      </p>
                    ) : (
                      <Explained id="voice.listen">
                        <CommandPreview command={listen} onRun={() => void run(listen, listen)} running={busy === listen} label="listen" />
                      </Explained>
                    )}
                  </li>
                )
              })}
          </ol>
        </div>
      ))}
    </section>
  )
}
