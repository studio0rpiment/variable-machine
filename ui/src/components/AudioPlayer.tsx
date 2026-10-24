import { useEffect, useRef, useState } from 'react'
import { Run, Stop } from '../icons'

const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––')

/**
 * A sound, played in the page's own style instead of the browser's player:
 * the hand-drawn play triangle (Run) and stop blob, a 1px line for where it
 * is (the page's range slider, so the keyboard moves it too), and the time.
 */
export default function AudioPlayer({ src, label }: { src: string; label: string }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const [length, setLength] = useState(NaN)

  // a new sound starts from the beginning, stopped
  useEffect(() => {
    setPlaying(false)
    setAt(0)
    setLength(NaN)
  }, [src])

  const toggle = () => {
    const a = audio.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }

  return (
    <div className="audio-player">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), setAt(0))}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLength(e.currentTarget.duration)}
      />
      <button type="button" className="icon-button" onClick={toggle} aria-label={`${playing ? 'pause' : 'play'} ${label}`}>
        {playing ? <Stop size={1} /> : <Run size={1} />}
      </button>
      <input
        type="range"
        min={0}
        max={Number.isFinite(length) ? length : 0}
        step={0.05}
        value={at}
        aria-label={`where in ${label}`}
        onChange={(e) => {
          const t = Number(e.target.value)
          setAt(t)
          if (audio.current) audio.current.currentTime = t
        }}
      />
      <span className="label label--muted audio-player__time">
        {clock(at)} / {clock(length)}
      </span>
    </div>
  )
}
