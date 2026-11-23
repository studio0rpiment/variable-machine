import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** Grid rows this many px tall; each option spans as many as its height needs, so options of different heights pack. */
const ROW = 4
/** An option this many times taller than the others' median goes across the whole width, its details side by side. */
const WIDE = 1.6

/**
 * A decision's options, or a walkthrough's decision boxes (voice-subs): in
 * columns, each as tall as its own text, packed so a short one doesn't leave a
 * gap below it. One much longer than the rest goes across the full width.
 */
export default function PackedOptions({ children, className = 'voice-fork__options' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const pack = () => {
      const items = [...el.children] as HTMLElement[]
      for (const i of items) {
        i.classList.remove('is-wide')
        i.style.gridRowEnd = ''
      }
      const cols = getComputedStyle(el).gridTemplateColumns.split(' ').length
      el.style.setProperty('--cols', String(cols))
      if (cols > 1 && items.length > 2) {
        const heights = items.map((i) => i.getBoundingClientRect().height)
        const tallest = heights.indexOf(Math.max(...heights))
        const rest = heights.filter((_, n) => n !== tallest).sort((a, b) => a - b)
        const median = rest[Math.floor(rest.length / 2)]
        if (heights[tallest] > WIDE * median) items[tallest].classList.add('is-wide')
      }
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0
      for (const i of items) i.style.gridRowEnd = `span ${Math.ceil((i.getBoundingClientRect().height + gap) / (ROW + gap))}`
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(pack)
    }
    pack()
    // a new width changes the columns; fonts arriving change the heights
    const ro = new ResizeObserver(later)
    ro.observe(el)
    void document.fonts?.ready.then(later)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [children])
  return (
    <div ref={ref} className={`${className} is-packed`}>
      {children}
    </div>
  )
}
