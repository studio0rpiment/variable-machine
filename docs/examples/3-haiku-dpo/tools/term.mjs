// usage: node term.mjs "<line>"  — sends one line to Variable Machine's terminal (as the GUI does) and prints the output until it is done
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../../helper/package.json', import.meta.url))
const WebSocket = require('ws')
const ws = new WebSocket('ws://127.0.0.1:4817/ws')
const line = process.argv[2]
ws.on('open', () => ws.send(JSON.stringify({ type: 'command', id: 'cli', line })))
ws.on('message', (d) => {
  const e = JSON.parse(String(d))
  if (e.type === 'terminal.output') process.stdout.write(e.text.replace(/\r/g, ''))
  if (e.type === 'command.done' && e.id === 'cli') { console.log(`\n[done ok=${e.ok}]`); process.exit(0) }
})
