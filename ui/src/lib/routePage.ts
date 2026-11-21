import { useEffect, useRef, useState } from 'react'

/**
 * A project's route as one long page, under a schematic that stays at the top
 * (VoiceMode, ResearchMode). The page tracks what is in view: the last section
 * tagged with a box (data-box) whose top has passed under the schematic, and
 * the last step (data-step). A click on a box scrolls to its first section and
 * keeps that box lit while the page glides there. The page opens at the step
 * in the address.
 *
 * `space` holds the open schematic's place in the page; `self` is the
 * schematic itself (its height is the line sections pass under); `stripPx`
 * says how tall the folded strip is, so a scroll lands just under it.
 */
export function useRoutePage({ step, project, onStep, stripPx, line }: { step: number; project: string; onStep: (n: number) => void; stripPx: () => number; line: string }) {
  const [stepNow, setStepNow] = useState(step)
  const space = useRef<HTMLDivElement>(null)
  const self = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState(0)
  /** the box of the section in view, or none at the top of the page, where the open step's box is lit */
  const [focus, setFocus] = useState<string | null>(null)
  const pinned = useRef<string | null>(null)
  const [width, setWidth] = useState(0)
  // the map folds as the page scrolls: each px scrolled takes a px off its height, until it is the strip
  useEffect(() => {
    const el = space.current
    const main = el?.closest('.shell__main')
    if (!el || !main) return
    // the section in view: the last one tagged with a box whose top has passed under the strip
    const onScroll = () => {
      setScroll(main.scrollTop)
      // after a click on a box, its section stays lit while the page glides there
      if (pinned.current) return void setFocus(pinned.current)
      const under = main.getBoundingClientRect().top + (self.current?.getBoundingClientRect().height ?? 0) + 24
      const passed = [...main.querySelectorAll<HTMLElement>('[data-box]')].filter((el) => !el.closest(`.${line}`) && el.getBoundingClientRect().top <= under)
      setFocus(main.scrollTop > 0 ? (passed.pop()?.dataset.box ?? null) : null)
      // the step in view: the last step section whose top has passed under the strip, or the first
      const at = [...main.querySelectorAll<HTMLElement>('[data-step]')].filter((el) => el.getBoundingClientRect().top <= under).pop()
      setStepNow(Number(at?.dataset.step ?? 1))
    }
    // the schematic's own width: it runs out past the page's side padding, to the window's edges
    const frame = self.current ?? el
    const sized = new ResizeObserver(() => setWidth(frame.clientWidth))
    sized.observe(frame)
    // once the glide ends, the section in view and the step in view are read again (the header's step number follows)
    const onEnd = () => {
      pinned.current = null
      onScroll()
    }
    onScroll()
    main.addEventListener('scroll', onScroll, { passive: true })
    main.addEventListener('scrollend', onEnd)
    return () => {
      main.removeEventListener('scroll', onScroll)
      main.removeEventListener('scrollend', onEnd)
      sized.disconnect()
    }
  }, [line])
  useEffect(() => onStep(stepNow), [stepNow, onStep])
  /** Scroll an element to just under the folded strip. */
  const scrollTo = (el: HTMLElement, smooth: boolean) => {
    const main = space.current?.closest('.shell__main')
    if (!main) return
    main.scrollTo({ top: main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top - stripPx() - 8, behavior: smooth ? 'smooth' : 'auto' })
  }
  // a click on a box scrolls to its first section (a decision, or else its step), and lights it on the way
  const pick = (box: string) => {
    const main = space.current?.closest('.shell__main')
    const el = main && [...main.querySelectorAll<HTMLElement>(`[data-box="${box}"]`)].find((e) => !e.closest(`.${line}`))
    if (!el) return
    pinned.current = box
    setFocus(box)
    scrollTo(el, true)
  }
  // the page opens at the step in the address, once its sections are there
  useEffect(() => {
    if (step <= 1) return
    const id = setTimeout(() => {
      const el = space.current?.closest('.shell__main')?.querySelector<HTMLElement>(`[data-step="${step}"]`)
      if (el) scrollTo(el, false)
    }, 400)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])
  return { space, self, scroll, focus, stepNow, width, pick }
}
