import { useEffect, useState } from 'react'
import { readFile } from '../lib/workspace'
import { diagnose, type Advice } from '@shared/runAdvice'

/**
 * Before a run: what these settings will likely do (fall apart, run out of
 * memory, crawl), with one press back to the settings that work.
 */
export function BeforeAdvice({ advice, onRecommended }: { advice: Advice[]; onRecommended: () => void }) {
  if (!advice.length) return null
  return (
    <div className="advice" role="note">
      <span className="label advice__title">before you train</span>
      <ul className="advice__list">
        {advice.map((a) => (
          <li key={a.text} className={`advice__item advice__item--${a.level}`}>
            {a.text}
          </li>
        ))}
      </ul>
      <button type="button" className="text-button advice__fix" onClick={onRecommended}>
        use the recommended settings
      </button>
    </div>
  )
}

/** After a run failed: why, read from its log, and the way back to settings that work. */
export function RunProblem({ folder, onRecommended }: { folder: string; onRecommended: () => void }) {
  const [why, setWhy] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void readFile(`runs/${folder}/log.txt`).then((t) => live && setWhy(diagnose(t ?? '') ?? 'It failed; the terminal and workspace/runs/' + folder + '/log.txt say why.'))
    return () => {
      live = false
    }
  }, [folder])
  if (!why) return null
  return (
    <div className="advice advice--failed" role="alert">
      <span className="label advice__title">why it didn't finish</span>
      <p className="advice__why">{why}</p>
      <button type="button" className="text-button advice__fix" onClick={onRecommended}>
        use the recommended settings
      </button>
    </div>
  )
}
