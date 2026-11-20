import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { runCommand } from '../lib/helper'
import { closeGuide, setNote, startGuide, useGuide } from '../lib/guide'
import { stepNumber, TAB_NAME, useProjects, type Fill, type Note } from './ProjectsPanel'
import CommandPreview from './CommandPreview'
import { say } from '../text/say'

/** The control a note points at: a data-guide marker, or a flagged control (its flag's wrapper holds it). Null when it isn't laid out on the tab in view. */
function findTarget(at: string): HTMLElement | null {
  const slot = document.querySelector('.panel-slot:not([hidden])')
  const el = slot?.querySelector<HTMLElement>(`[data-guide="${at}"], [data-flag="${at}"]`)
  const box = el?.dataset.flag ? (el.firstElementChild as HTMLElement | null) : el
  if (!box) return null
  const r = box.getBoundingClientRect()
  return r.width && r.height ? box : null
}

/**
 * Project mode: the bar at the top while a student follows a project from its
 * card. It says the project, the step and what to do; it goes back to the
 * card and on to the next step (the student presses next, so they see what
 * they made first); and it stays on every tab, with the way back when a tab
 * isn't the step's. On the step's tab, the walkthrough points at one control
 * at a time; a step with no walkthrough shows its commands here instead.
 */
export default function GuideBar({ panel, onFill }: { panel: string; onFill: (fill: Fill) => void }) {
  const guide = useGuide()
  const projects = useProjects()
  const [busy, setBusy] = useState('')
  const project = projects?.find((p) => p.id === guide?.project)
  const index = (guide?.step ?? 0) - 1
  const step = project?.steps[index]

  // fill in the card's names on the tab, once each time a step is opened
  const filled = useRef('')
  useEffect(() => {
    const key = `${guide?.project}:${guide?.step}`
    if (!step || filled.current === key) return
    filled.current = key
    if (step.fill) onFill(step.fill)
  }, [guide?.project, guide?.step, step, onFill])

  if (!guide || !project || !step) return null
  const { n, of } = stepNumber(project.steps, index)
  const last = index === project.steps.length - 1 || !!project.steps[index + 1]?.or
  const onTab = panel === step.tab
  const notes = step.notes ?? []
  const note = onTab ? notes[guide.note] : undefined

  const toCard = () => {
    location.hash = 'projects'
    // the tab shows a frame or two later; scroll once the card is laid out
    let tries = 30
    const bring = () => {
      const card = document.getElementById(`card-${project.id}`)
      if (card?.getBoundingClientRect().height) {
        card.scrollIntoView({ block: 'start' })
        // and again once the tab has settled, as for a note's control
        setTimeout(() => card.scrollIntoView({ block: 'start' }), 300)
      } else if (tries-- > 0) requestAnimationFrame(bring)
    }
    requestAnimationFrame(bring)
  }
  const next = () => (last ? toCard() : startGuide(project.id, index + 2, project.steps[index + 1].tab))
  const run = async (line: string) => {
    setBusy(line)
    await runCommand(line)
    setBusy('')
  }

  return (
    <section className="guide-bar" aria-label={say('projects.guide.label')}>
      <div className="guide-bar__line">
        <span className="label">{project.title}</span>
        <span className="label label--muted">{say('projects.guide.step', { n, of })}</span>
        <span className="guide-bar__do">{step.name}</span>
        <span className={`label ${step.done ? '' : 'label--muted'}`.trim()}>{step.done ? say('projects.step.done') : say('projects.step.todo')}</span>
        <span className="guide-bar__ways">
          <button type="button" className="text-button" onClick={toCard}>
            {say('projects.guide.card')}
          </button>
          <span className={`guide-bar__next ${step.done ? 'is-next' : ''}`.trim()}>
            <button type="button" className="text-button" onClick={next}>
              {last ? say('projects.guide.finished') : say('projects.guide.next')}
            </button>
          </span>
          <button type="button" className="text-button" onClick={closeGuide} aria-label={say('projects.guide.close')} title={say('projects.guide.close')}>
            ×
          </button>
        </span>
      </div>
      {!onTab ? (
        <div className="guide-bar__line">
          <span className="mf-next">{say('projects.guide.elsewhere', { n, tab: TAB_NAME[step.tab] })}</span>
          <button type="button" className="text-button" onClick={() => (location.hash = step.tab)}>
            {say('projects.guide.backToStep', { n })}
          </button>
        </div>
      ) : notes.length === 0 ? (
        step.commands.length > 0 && (
          <div className="guide-bar__line">
            <span className="mf-next">{say('projects.guide.run')}</span>
            {step.commands.map((c) => (
              <CommandPreview key={c} command={c} onRun={() => void run(c)} disabled={c.includes('<') || !!busy} running={busy === c} label={say('projects.step.run')} />
            ))}
          </div>
        )
      ) : note ? (
        <Walkthrough key={`${guide.project}:${guide.step}:${guide.note}`} note={note} n={guide.note + 1} of={notes.length} />
      ) : (
        <div className="guide-bar__line">
          {step.result && <span className="label label--muted">{step.result}</span>}
          <button type="button" className="text-button" onClick={() => setNote(0)}>
            {say('projects.guide.again')}
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * One note of a step's walkthrough, beside the control it points at; the
 * control gets the dashed box. It moves on when the student uses the control
 * (a choice changed, a button inside it pressed), or with "next note". If the
 * control isn't on the tab yet, the note shows in the bar instead.
 */
function Walkthrough({ note, n, of }: { note: Note; n: number; of: number }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  /** the control is inside the tab's visible part (not scrolled away, not under the terminal) */
  const [inView, setInView] = useState(false)
  const noteRef = useRef<HTMLDivElement>(null)
  const advance = () => setNote(n)

  // find the control, and keep looking: it may appear once the tab has loaded its data
  useEffect(() => {
    let frame = 0
    const look = () => {
      const t = findTarget(note.at)
      setTarget((cur) => (cur === t ? cur : t))
      frame = requestAnimationFrame(look)
    }
    look()
    return () => cancelAnimationFrame(frame)
  }, [note.at])

  // bring it into view once, box it, and move on when it is used
  useEffect(() => {
    if (!target) return
    // again once the tab has settled: opening a set scrolls the tab to its top
    const bring = () => target.scrollIntoView({ block: 'center' })
    bring()
    const again = setTimeout(bring, 500)
    target.classList.add('guide-target')
    const onChange = () => advance()
    const onClick = (e: Event) => {
      // let the press do its work first
      if ((e.target as HTMLElement).closest('button, [role="radio"]')) setTimeout(advance, 0)
    }
    target.addEventListener('change', onChange)
    target.addEventListener('click', onClick)
    return () => {
      clearTimeout(again)
      target.classList.remove('guide-target')
      target.removeEventListener('change', onChange)
      target.removeEventListener('click', onClick)
    }
  }, [target])

  // follow the control as the tab scrolls
  useLayoutEffect(() => {
    if (!target) return setAt(null)
    let frame = 0
    const place = () => {
      const r = target.getBoundingClientRect()
      const slot = target.closest('.panel-slot')?.getBoundingClientRect()
      const seen = !!slot && r.bottom > slot.top && r.top < slot.bottom
      setInView((cur) => (cur === seen ? cur : seen))
      const h = noteRef.current?.offsetHeight ?? 0
      const w = noteRef.current?.offsetWidth ?? 0
      // beside it when there's room; else above it (what's above has been read), else below
      const beside = r.right + 16 + w < innerWidth
      const above = r.top - h - 8
      const top = beside ? Math.max(8, Math.min(r.top, innerHeight - h - 8)) : above >= (slot?.top ?? 0) ? above : r.bottom + 8
      const left = beside ? r.right + 16 : Math.max(8, Math.min(r.left, innerWidth - w - 8))
      setAt((cur) => (cur && cur.top === top && cur.left === left ? cur : { top, left }))
      frame = requestAnimationFrame(place)
    }
    place()
    return () => cancelAnimationFrame(frame)
  }, [target])

  const body = (
    <>
      <span className="label label--muted">{say('projects.guide.note', { n, of })}</span>
      <span className="guide-note__text">{note.text}</span>
      <span className="guide-note__ways">
        <button type="button" className="text-button" onClick={advance}>
          {say('projects.guide.noteNext')}
        </button>
        <button type="button" className="text-button" onClick={() => setNote(of)}>
          {say('projects.guide.skip')}
        </button>
      </span>
    </>
  )

  return target && inView ? (
    <>
      <div className="guide-bar__line" aria-live="polite">
        <span className="label label--muted">{say('projects.guide.note', { n, of })}</span>
      </div>
      {createPortal(
        <div ref={noteRef} className="guide-note" role="note" style={at ? { top: at.top, left: at.left } : { visibility: 'hidden' }}>
          {body}
        </div>,
        document.body,
      )}
    </>
  ) : (
    <div className="guide-bar__line guide-bar__look" aria-live="polite">
      <span className="label label--muted">{say('projects.guide.lookFor')}</span>
      {body}
    </div>
  )
}
