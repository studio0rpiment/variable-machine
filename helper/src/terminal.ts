import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { markIfNew } from './temporary.ts'
import { trashCommand } from './trash.ts'
import { status } from './status.ts'
import { splitWords } from './shared/quote.ts'
import { refuse, scopePath, spawnStreamed } from './run.ts'
import { ollamaCommand } from './ollamaCommands.ts'
import { dataCommand } from './data.ts'
import { recipeCommand } from './recipes.ts'
import { formatChecks, runDoctor } from './doctor.ts'
import { unzipCommand, zipCommand } from './share.ts'
import { modelCommand } from './tools.ts'
import { lookCommand } from './pagerun.ts'
import { voiceCommand } from './voice.ts'
import { gestureCommand, oscCommand } from './gestures.ts'

export { stopRunning } from './run.ts'

/**
 * The terminal (plan §7). Not a shell and not a pty: a line is split into
 * words, matched against an allowlist, and the real program is spawned with
 * child_process.spawn and no shell, so nothing is ever interpolated.
 *
 * Typed lines and lines the GUI composes take the same path; only the echo
 * differs (› typed, ▸ GUI), and a GUI line reports back with `command.done`.
 */

const HELP = `commands
  ollama list | show <model> | pull <model> | rm <model>
  ollama create <name> -f workspace/modelfiles/<name>.Modelfile [-q q4_K_M]
  ollama run-once <model> [--system "<text>"] [--image images/<set>/<photo>] [--no-think] [--format json|<schema>] <prompt…>
  data new [--format chat|preference] | import dolly | validate | split | count | append <name>   (data help)
  ls | cat | head | tail | wc <path>                   inside workspace/ only
  zip <data|adapters|merges|runs|fused|images|audio|gestures>/<name>   share an artifact: workspace/shared/<kind>-<name>.zip
  unzip <file.zip>                                 put a shared artifact back where it belongs
  trash <data|raw|runs|adapters|merges|fused|tools|images|outputs|audio|gestures>/<name>  move it to the Trash, to start over
  status   doctor   help   clear
  ctrl-c stops what is running

  train <adapter> --data <dataset> [--base <hf id>] [--type lora|dora|full] [--rank] [--layers] [--lr] [--iters] [--batch] [--max-seq]
  fuse <adapter|merge> [--name]
  register <fused> [--name <model>] [--quantize int8|int4|none] [--system "<text>"]
  export <adapter|merge> [--name <model>] [--quantize int8|int4|none]    fuse + register in one go
  merge <name> --a <adapter> --b <adapter> [--t 0.5]    (1 - t)·A + t·B, exactly (stacked: the ranks add)
  prefer <adapter> --data <preference set> [--model <hf id|workspace/fused/NAME>] [--beta 0.1] [--iters 100] [--lr 2e-5] [--sft 0]

  model list | model get <cutout|depth|select>    ready-made tool models, into workspace/tools/
  model get <smolvlm-256m|smolvlm-500m>           a model that sees: its GGUFs into workspace/tools/, then ollama create
  look <cutout|depth|select> images/<set>/<photo> [--point x,y]… [--not x,y]…   runs in the page; into workspace/outputs/
  look example classic-cv                         the example photos: duck, teapot, bunny

  speak <name> "<text>" [--set spoken]             a model reads it aloud: workspace/audio/<set>/<name>.wav
  listen audio/<set>/<file>.wav [--language English]   a speech model writes down what it hears

  model get hands | model get body                the trackers that find points on a hand or a body (Move tab)
  gesture new <name> --tracker hands|body          a set of your gestures: workspace/gestures/<name>/
  gesture train <name> [--k 5]                     k-nearest neighbours: check on every fifth example, keep them all
  gesture clear <name> <gesture>                   forget one gesture's examples
  gesture send <name> --port 9000 [--address /vm/<name>] | --stop   while testing, OSC to this computer
  osc send <port> <address> [values…]              one OSC message to 127.0.0.1, to try a connection
`


/** Flags each file command may take. Anything else, and anything that would follow a file (tail -f), is refused. */
const FILE_FLAGS: Record<string, RegExp> = {
  ls: /^-[lahRtrS1F]+$/,
  cat: /^-n$/,
  head: /^-(n|c)?\d*$/,
  tail: /^-(n|c)?\d*$/,
  wc: /^-[lwcm]+$/,
}
const FLAGS_WITH_VALUE = new Set(['-n', '-c'])

async function fileCommand(cmd: string, args: string[]): Promise<boolean> {
  const flags = FILE_FLAGS[cmd]
  const out: string[] = []
  let files = 0
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('-')) {
      if (!flags.test(a)) return refuse(`${cmd} ${a}`)
      out.push(a)
      if (FLAGS_WITH_VALUE.has(a)) {
        const v = args[++i]
        if (!v || !/^\d+$/.test(v)) {
          print(`${cmd}: ${a} needs a number`)
          return false
        }
        out.push(v)
      }
      continue
    }
    const scoped = scopePath(a)
    if (!scoped) {
      print(`outside workspace/: ${a}`)
      return false
    }
    out.push(scoped)
    files++
  }
  if (!files) {
    if (cmd !== 'ls') {
      print(`${cmd}: needs a file inside workspace/`)
      return false
    }
    out.push('workspace')
  }
  return spawnStreamed(cmd, out)
}

function printStatus() {
  const yes = (b: boolean) => (b ? 'yes' : 'no')
  print(`ollama   ${status.ollama ? `yes ${status.ollamaVersion ?? ''}` : 'no — start the Ollama app'}`)
  print(`uv       ${yes(status.uv)}`)
  print(`mlx-lm   ${status.mlx ? 'yes' : 'no — run: uv sync --project python'}`)
  print(`memory   ${status.memoryGB}GB · tier ${status.tier} · ${status.arch}`)
  return true
}

async function runLine(line: string, gui: boolean): Promise<boolean> {
  print(gui ? `▸ ${line}` : `\x1b[2m›\x1b[22m ${line}`)
  let words: string[]
  try {
    words = splitWords(line)
  } catch (err) {
    print((err as Error).message)
    return false
  }
  const [cmd, ...args] = words
  if (cmd in FILE_FLAGS) return fileCommand(cmd, args)
  if (cmd === 'ollama') return ollamaCommand(args)
  if (cmd === 'data') return dataCommand(args, line)
  if (['train', 'fuse', 'register', 'export', 'merge', 'prefer'].includes(cmd)) return recipeCommand(cmd, args, line)
  if (cmd === 'model') return modelCommand(args)
  if (cmd === 'look') return lookCommand(args, line)
  if (cmd === 'speak' || cmd === 'listen') return voiceCommand(cmd, args, line)
  if (cmd === 'gesture') return gestureCommand(args, line)
  if (cmd === 'osc') return oscCommand(args)
  if (cmd === 'zip') return zipCommand(args)
  if (cmd === 'trash') return trashCommand(args)
  if (cmd === 'unzip') return unzipCommand(args)
  if (cmd === 'help') return print(HELP), true
  if (cmd === 'status') return printStatus()
  if (cmd === 'doctor') {
    const checks = await runDoctor()
    formatChecks(checks).forEach((l) => print(l))
    return checks.every((c) => c.ok || c.warn)
  }
  if (cmd === 'clear') return broadcast({ type: 'terminal.output', text: '\x1b[2J\x1b[3J\x1b[H' }), true
  return refuse(cmd)
}

/** Lines wait their turn, as typed-ahead input does in a shell. GUI work joins the same queue. */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job)
  queue = next.catch((err: Error) => print(`error: ${err.message}`))
  return next
}

export function handleLine(line: string) {
  const trimmed = line.trim()
  if (trimmed) void enqueue(() => runLine(trimmed, false))
}

export function handleCommand(id: string, line: string) {
  void enqueue(() => runLine(line.trim(), true)).then(
    (ok) => broadcast({ type: 'command.done', id, ok }),
    () => broadcast({ type: 'command.done', id, ok: false }),
  )
}

export const MODELFILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

/** Write workspace/modelfiles/<name>.Modelfile, in queue order so a create sent next reads this version. */
export function saveModelfile(name: string, text: string) {
  if (!MODELFILE_NAME.test(name)) return print(`modelfile name must be lowercase letters, digits, . _ - : ${name}`)
  void enqueue(async () => {
    await markIfNew(name) // made on the Modelfile tab: temporary until kept
    const file = path.join(WORKSPACE, 'modelfiles', `${name}.Modelfile`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, text.endsWith('\n') ? text : text + '\n')
    print(`\x1b[2m  wrote workspace/modelfiles/${name}.Modelfile\x1b[22m`)
  })
}
