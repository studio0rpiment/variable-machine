import { useEffect, useState } from 'react'

/**
 * Every picture in the app opens large, as big as the window allows, with its
 * size in pixels: a click on it, or a double-click when the picture is itself a
 * control (inside a button, link or label: a click there chooses it). A click
 * anywhere or Escape closes it. Only a picture marked data-no-zoom, whose
 * clicks do something else (the photo you click points on), never opens.
 * Kevin, 24 November 2026: this is how every picture behaves, anywhere in the app.
 */
export default function PictureZoom() {
  const [open, setOpen] = useState<{ src: string; alt: string } | null>(null)
  const [size, setSize] = useState('')

  useEffect(() => {
    const zoom = (e: MouseEvent, inControl: boolean) => {
      const img = e.target instanceof HTMLImageElement ? e.target : null
      if (!img || !img.src || img.closest('[data-no-zoom], .picture-zoom') || !!img.closest('button, a, label') !== inControl) return
      e.preventDefault()
      setSize(`${img.naturalWidth} × ${img.naturalHeight} px`)
      setOpen({ src: img.src, alt: img.alt })
    }
    const click = (e: MouseEvent) => zoom(e, false)
    const dblclick = (e: MouseEvent) => zoom(e, true)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('click', click)
    document.addEventListener('dblclick', dblclick)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('click', click)
      document.removeEventListener('dblclick', dblclick)
      document.removeEventListener('keydown', key)
    }
  }, [])

  if (!open) return null
  return (
    <div className="picture-zoom" role="dialog" aria-label={open.alt || 'picture'} onClick={() => setOpen(null)}>
      <img src={open.src} alt={open.alt} />
      <span className="label label--muted">
        {open.alt && `${open.alt} · `}
        {size} · click or Esc to close
      </span>
    </div>
  )
}
