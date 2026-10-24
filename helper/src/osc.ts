import dgram from 'node:dgram'

/**
 * OSC (Open Sound Control) over UDP, the way TouchDesigner, Max, Pure Data,
 * Ableton (through Max for Live) and p5.js (through a bridge) take live
 * values. A message is an address, a type tag and the values, each padded to
 * four bytes. Only to this computer (127.0.0.1): the helper never sends
 * anywhere else.
 */

const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))])
const str = (s: string) => pad(Buffer.from(s, 'utf8'))

export function oscMessage(address: string, args: (string | number)[]): Buffer {
  const tags = ',' + args.map((a) => (typeof a === 'number' ? 'f' : 's')).join('')
  const values = args.map((a) => {
    if (typeof a === 'string') return str(a)
    const b = Buffer.alloc(4)
    b.writeFloatBE(a)
    return b
  })
  return Buffer.concat([str(address), str(tags), ...values])
}

let socket: dgram.Socket | null = null

export function sendOsc(port: number, address: string, args: (string | number)[]) {
  socket ??= dgram.createSocket('udp4')
  socket.send(oscMessage(address, args), port, '127.0.0.1')
}

export const OSC_ADDRESS = /^\/[\w./-]{0,120}$/
