import { useEffect, useState } from 'react'

/**
 * Click a picture from the workspace (a drawn latent image, an axis, a dream
 * card's drawing, a photo in a set) and it opens large, as big as the window
 * allows, with its size in pixels. A click anywhere or Escape closes it.
 *
 * Pictures that are controls keep their own click: one inside a button, link
 * or label, or marked data-no-zoom (the photo you click points on).
 */
export default function PictureZoom() {
  const [open, setOpen] = useState<{ src: string; alt: string } | null>(null)
  const [size, setSize] = useState('')

  useEffect(() => {
    const click = (e: MouseEvent) => {
      const img = e.target instanceof HTMLImageElement ? e.target : null
      if (!img || !img.src.includes('/api/workspace/file') || img.closest('button, a, label, [data-no-zoom], .picture-zoom')) return
      e.preventDefault()
      setSize(`${img.naturalWidth} × ${img.naturalHeight} px`)
      setOpen({ src: img.src, alt: img.alt })
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('click', click)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('click', click)
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
