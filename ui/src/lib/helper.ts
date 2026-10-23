import type { ClientEvent, ServerEvent, Status } from '@shared/events'

/**
 * The page's one connection to the helper. Components subscribe to the event
 * types they care about; nothing polls.
 *
 * Reconnecting is event-driven too: when the socket closes the page goes
 * offline and tries again when the window regains focus, comes back online,
 * becomes visible, or the person clicks "reconnect". No retry timer.
 */

type Listener = (e: ServerEvent) => void
const listeners = new Set<Listener>()
let ws: WebSocket | null = null
let connected = false
let status: Status | null = null
const stateListeners = new Set<() => void>()

function notifyState() {
  stateListeners.forEach((l) => l())
}

export function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  ws = new WebSocket(url)
  ws.onopen = () => {
    connected = true
    notifyState()
    // every page can run page commands (look …): see look/runner.ts
    ws?.send(JSON.stringify({ type: 'page.ready' } satisfies ClientEvent))
  }
  ws.onclose = () => {
    connected = false
    notifyState()
  }
  ws.onmessage = (msg) => {
    const event = JSON.parse(String(msg.data)) as ServerEvent
    if (event.type === 'status') {
      const { type: _type, ...s } = event
      status = s
      notifyState()
    }
    listeners.forEach((l) => l(event))
  }
}

for (const ev of ['focus', 'online'] as const) window.addEventListener(ev, connect)
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && connect())

export function sendEvent(event: ClientEvent) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event))
}

export function onEvent(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function subscribeState(l: () => void) {
  stateListeners.add(l)
  return () => {
    stateListeners.delete(l)
  }
}

let snapshot: { connected: boolean; status: Status | null } = { connected, status }
export function getState() {
  if (snapshot.connected !== connected || snapshot.status !== status) snapshot = { connected, status }
  return snapshot
}

let commandSeq = 0
const pending = new Map<string, (ok: boolean) => void>()
onEvent((e) => {
  if (e.type === 'command.done') {
    pending.get(e.id)?.(e.ok)
    pending.delete(e.id)
  }
})

/**
 * Run a command the GUI composed. It goes through the same parser and
 * allowlist as a typed line and is echoed into the terminal with ▸.
 * Resolves with whether it succeeded.
 */
export function runCommand(line: string): Promise<boolean> {
  const id = `c${++commandSeq}`
  return new Promise((resolve) => {
    pending.set(id, resolve)
    sendEvent({ type: 'command', id, line })
  })
}
