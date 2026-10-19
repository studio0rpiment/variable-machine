import { useEffect, useSyncExternalStore } from 'react'
import { getState, onEvent, subscribeState } from '../lib/helper'
import type { ServerEvent } from '@shared/events'

/** Connection + status, re-rendering only when either changes. */
export function useHelperState() {
  return useSyncExternalStore(subscribeState, getState)
}

/** Run `fn` for every server event of one type. */
export function useHelperEvent<T extends ServerEvent['type']>(type: T, fn: (e: Extract<ServerEvent, { type: T }>) => void) {
  useEffect(
    () =>
      onEvent((e) => {
        if (e.type === type) fn(e as Extract<ServerEvent, { type: T }>)
      }),
    [type, fn],
  )
}
