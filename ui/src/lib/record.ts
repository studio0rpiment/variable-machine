/**
 * Record the microphone as WAV, in the page. Browsers record webm/opus, which
 * the listening model could only read through ffmpeg; plain WAV it reads as it is. So the
 * samples are taken straight from the audio graph (an AudioWorklet that hands
 * each block on) and written as 16-bit mono WAV when you stop.
 * Nothing leaves the page until the WAV is saved into the workspace.
 */

const TAP = `registerProcessor('tap', class extends AudioWorkletProcessor {
  process(inputs) {
    const c = inputs[0] && inputs[0][0]
    if (c) this.port.postMessage(c.slice(0))
    return true
  }
})`

export interface Recording {
  /** stop, and get the WAV */
  stop: () => Promise<Blob>
  /** how loud it is right now, 0–1, for a level line */
  level: () => number
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  const ctx = new AudioContext()
  const url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)
  const source = ctx.createMediaStreamSource(stream)
  const tap = new AudioWorkletNode(ctx, 'tap')
  // a silent path to the speakers, so the graph is pulled and the tap runs, without hearing yourself
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(tap).connect(mute).connect(ctx.destination)
  const chunks: Float32Array[] = []
  let last = 0
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    chunks.push(e.data)
    let peak = 0
    for (const v of e.data) peak = Math.max(peak, Math.abs(v))
    last = peak
  }
  return {
    level: () => last,
    stop: async () => {
      stream.getTracks().forEach((t) => t.stop())
      const rate = ctx.sampleRate
      await ctx.close()
      return wav(chunks, rate)
    },
  }
}

/** 16-bit PCM mono WAV from float samples. */
export function wav(chunks: Float32Array[], rate: number): Blob {
  const n = chunks.reduce((a, c) => a + c.length, 0)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 2, true)
  let o = 44
  for (const c of chunks)
    for (const s of c) {
      v.setInt16(o, Math.max(-1, Math.min(1, s)) * 0x7fff, true)
      o += 2
    }
  return new Blob([buf], { type: 'audio/wav' })
}
