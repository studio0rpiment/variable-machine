import { useCallback, useState } from 'react'
import { useHelperEvent } from './useHelper'
import type { LossPoint } from '../components/LossChart'

export interface PipelineState {
  runId: string
  recipe: string
  params: unknown
  commands: string[]
  step: number
  done: boolean
  ok?: boolean
  outputs: string[]
  points: LossPoint[]
}

/**
 * The latest pipeline of the given recipes, rebuilt from events: which
 * commands it will run, which one it is on, and (for train) the loss so far.
 */
export function usePipeline(recipes: string[]) {
  const [state, setState] = useState<PipelineState | null>(null)
  const key = recipes.join(',')
  useHelperEvent(
    'pipeline.started',
    useCallback(
      (e) => {
        if (key.split(',').includes(e.recipe)) setState({ runId: e.runId, recipe: e.recipe, params: e.params, commands: e.commands, step: -1, done: false, outputs: [], points: [] })
      },
      [key],
    ),
  )
  useHelperEvent(
    'pipeline.step',
    useCallback((e) => setState((s) => (s && s.runId === e.runId ? { ...s, step: e.index } : s)), []),
  )
  useHelperEvent(
    'pipeline.metric',
    useCallback((e) => setState((s) => (s && s.runId === e.runId ? { ...s, points: [...s.points, { iter: e.iter, trainLoss: e.trainLoss, valLoss: e.valLoss, tokensPerSec: e.tokensPerSec }] } : s)), []),
  )
  useHelperEvent(
    'pipeline.finished',
    useCallback((e) => setState((s) => (s && s.runId === e.runId ? { ...s, done: true, ok: e.ok, outputs: e.outputs } : s)), []),
  )
  return state
}
