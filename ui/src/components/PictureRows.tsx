import { useState } from 'react'
import { runCommand } from '../lib/helper'
import { joinWords } from '@shared/quote'
import PicturePicker from './PicturePicker'
import CommandPreview from './CommandPreview'
import { Explained } from '../explain/Explained'

/**
 * Rows for a picture dataset, one at a time: a photo from an image set, a
 * question about it, and the answer you want a model that sees to give.
 * Each row is `data picture …`, which copies the photo into the dataset
 * folder and records where it came from and its license.
 */
export default function PictureRows({ dataset }: { dataset: string }) {
  const [photo, setPhoto] = useState('')
  const [question, setQuestion] = useState('What is this?')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = !!photo && !!question.trim() && !!answer.trim()
  const cmd = joinWords(['data', 'picture', dataset, photo || 'images/<set>/<photo>', '--question', question.trim() || '<question>', '--answer', answer.trim() || '<answer>'])

  const add = async () => {
    setBusy(true)
    // the same question often goes with the next photo, so it stays; the answer is about this photo only
    if (await runCommand(cmd)) setAnswer('')
    setBusy(false)
  }

  return (
    <div className="picture-rows">
      <PicturePicker value={photo} onChange={setPhoto} />
      <label className="field">
        <span className="label label--muted">the question</span>
        <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} />
      </label>
      <Explained id="data.pictureAnswer">
        <label className="field">
          <span className="label label--muted">the answer you want, in your words</span>
          <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="what a model that sees should say about this photo" />
        </label>
      </Explained>
      <Explained id="data.picture">
        <CommandPreview command={cmd} onRun={() => void add()} disabled={!ready} running={busy} label="add the row" />
      </Explained>
    </div>
  )
}
