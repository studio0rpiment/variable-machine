import { useCallback, useEffect, useRef, useState } from 'react'
import { IMAGE_EXT } from '@shared/kinds'
import { listDir, readManifests } from '../lib/workspace'
import { useHelperEvent } from '../hooks/useHelper'
import { Explained } from '../explain/Explained'

const fileUrl = (rel: string) => `/api/workspace/file?path=${encodeURIComponent(rel)}`
const SET = /^[a-z0-9][a-z0-9._-]{0,63}$/
/** where a photo added from Chat goes, unless a set is chosen */
const CHAT_SET = 'chat-photos'

/**
 * A picture to send with a prompt, to the models that see: one from the image
 * sets the Look tab uses (workspace/images/<set>/), or one added here, which
 * goes into a set like any other. The value is its workspace path; the helper
 * reads the file in and echoes it as `--image <path>`.
 */
export default function PicturePicker({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState<string[] | null>(null) // null until read
  const [set, setSet] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const loadSets = useCallback(async () => {
    const m = (await readManifests<{ name: string }>('images')).map((x) => x.folder)
    setSets(m)
    setSet((s) => s || m[0] || '')
  }, [])
  const loadPhotos = useCallback(async () => {
    if (!set) return setPhotos([])
    setPhotos((await listDir(`images/${set}`)).filter((e) => !e.dir && IMAGE_EXT.test(e.name)).map((e) => e.name))
  }, [set])
  useEffect(() => void (open && loadSets()), [open, loadSets])
  useEffect(() => void (open && loadPhotos()), [open, loadPhotos])
  useHelperEvent(
    'workspace.changed',
    useCallback((e) => e.path.startsWith('images/') && open && (void loadSets(), void loadPhotos()), [open, loadSets, loadPhotos]),
  )

  const upload = async (f: File) => {
    const target = set || CHAT_SET
    if (!SET.test(target)) return setNote('sets are named with lowercase letters, digits, . _ -')
    const clean = f.name.toLowerCase().replace(/[^\w.-]+/g, '-')
    const res = await fetch(`/api/workspace/upload?name=${encodeURIComponent(clean)}&set=${encodeURIComponent(target)}&license=${encodeURIComponent('your own work')}`, { method: 'POST', body: f })
    const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string }
    if (!res.ok || !body.path) return setNote(body.error ?? 'upload failed')
    setNote('')
    setSet(target)
    onChange(body.path)
    setOpen(false)
  }

  return (
    <div className="picture">
      <div className="picture__row">
        {value && (
          <button type="button" className="picture__chosen" onClick={() => setOpen((o) => !o)} title={value}>
            <img src={fileUrl(value)} alt={value} />
          </button>
        )}
        <Explained id="chat.picture">
          <button type="button" className="text-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {value ? value.replace(/^images\//, '') : 'add a picture'}
          </button>
        </Explained>
        {value && (
          <button type="button" className="text-button" onClick={() => onChange('')}>
            no picture
          </button>
        )}
      </div>
      {open && (
        <div className="picture__choose">
          <div className="look-sets">
            <label className="field">
              <span className="label label--muted">set · workspace/images</span>
              <select value={set} onChange={(e) => setSet(e.target.value)}>
                {(sets ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                {sets && !sets.includes(CHAT_SET) && <option value="">{CHAT_SET} (new)</option>}
              </select>
            </label>
            <Explained id="chat.pictureAdd">
              <button type="button" className="text-button" onClick={() => file.current?.click()}>
                add a photo
              </button>
            </Explained>
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload(f)
                e.target.value = ''
              }}
            />
            {sets?.length === 0 && <span className="label label--muted">no image sets yet: add a photo, or the example photos on the Look tab</span>}
            {note && <span className="label label--muted">{note}</span>}
          </div>
          {photos.length > 0 && (
            <div className="look-strip" role="listbox" aria-label="photos in this set">
              {photos.map((p) => {
                const rel = `images/${set}/${p}`
                return (
                  <button
                    key={p}
                    type="button"
                    role="option"
                    aria-selected={rel === value}
                    className={`look-thumb ${rel === value ? 'is-active' : ''}`.trim()}
                    onClick={() => {
                      onChange(rel)
                      setOpen(false)
                    }}
                  >
                    <img src={fileUrl(rel)} alt={p} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
