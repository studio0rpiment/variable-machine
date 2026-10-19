import type { WebSocket } from 'ws'
import type { ServerEvent } from './shared/events.ts'

/** Every connected page. The terminal and the GUI are two views of this one stream. */
const clients = new Set<WebSocket>()

export function addClient(ws: WebSocket) {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
}

export function broadcast(event: ServerEvent) {
  const data = JSON.stringify(event)
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data)
}

export function send(ws: WebSocket, event: ServerEvent) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event))
}

/** Write to every terminal. Lines end in \r\n because xterm wants carriage returns. */
export function print(text = '') {
  broadcast({ type: 'terminal.output', text: text.replace(/\r?\n/g, '\r\n') + '\r\n' })
}

/** Echo a command the GUI is running, so it reads like something typed. */
export function echo(command: string) {
  print(`▸ ${command}`)
}
