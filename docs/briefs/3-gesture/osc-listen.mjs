// Listen for OSC on a port and print each message, standing in for
// TouchDesigner, Max or Pure Data when you want to see what arrives.
//
//   node docs/briefs/3-gesture/osc-listen.mjs 9125
//
// Stop it with ctrl-C. Only this computer can reach it (127.0.0.1).
import dgram from 'node:dgram'

const port = Number(process.argv[2] ?? 9000)

/** An OSC string: text up to a zero byte, padded to a multiple of 4. */
function str(buf, at) {
  const end = buf.indexOf(0, at)
  return [buf.toString('utf8', at, end), (end + 4) & ~3]
}

function decode(buf) {
  let [address, at] = str(buf, 0)
  let tags
  ;[tags, at] = str(buf, at)
  const values = []
  for (const t of tags.slice(1)) {
    if (t === 's') { let v; [v, at] = str(buf, at); values.push(JSON.stringify(v)) }
    else if (t === 'f') { values.push(buf.readFloatBE(at).toFixed(3)); at += 4 }
    else if (t === 'i') { values.push(buf.readInt32BE(at)); at += 4 }
  }
  return `${address} ${values.join(' ')}`
}

const socket = dgram.createSocket('udp4')
socket.on('message', (m) => console.log(new Date().toLocaleTimeString(), decode(m)))
socket.bind(port, '127.0.0.1', () => console.log(`listening for OSC on 127.0.0.1:${port}`))
