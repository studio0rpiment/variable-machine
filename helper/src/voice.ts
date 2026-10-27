import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { runRecipe } from './pipeline.ts'
import { AUDIO_EXT, VOICE_MODELS, voiceModel } from './shared/kinds.ts'
import { PY_ENV, UV_VOICE } from './shared/recipes.ts'
import { joinWords } from './shared/quote.ts'

/**
 * `speak` and `listen`: the speech tab's two commands (the speaks and listens
 * kinds). Each is a real mlx-audio command run in the python project's voice
 * extra. Sounds live in workspace/audio/<set>/, a folder of WAV files with a
 * manifest that says, for each file, where it came from (spoken by a model,
 * recorded in the page) and what was heard in it.
 */

const SET = /^[a-z0-9][a-z0-9._-]{0,63}$/
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const now = () => new Date().toISOString()

export interface AudioFile {
  /** spoken: made by speak; recorded: from the page's microphone */
  made: 'spoken' | 'recorded'
  license: string
  /** what it was asked to say (spoken) */
  text?: string
  model?: string
  /** the voice it was changed into afterwards (robot, baritone); none: the model's own */
  voice?: string
  /** what listen heard, and with which model */
  transcript?: string
  heardBy?: string
  language?: string
  command?: string[]
}

export interface AudioSet {
  name: string
  kind: 'audio'
  created: string
  license: string
  inputs: string[]
  command: string[]
  files: Record<string, AudioFile>
}

const dir = (set: string) => path.join(WORKSPACE, 'audio', set)

export async function readAudioSet(set: string): Promise<AudioSet> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(set), 'manifest.json'), 'utf8')) as AudioSet
  } catch {
    return { name: set, kind: 'audio', created: now(), license: '', inputs: [], command: [], files: {} }
  }
}

export async function writeAudioSet(m: AudioSet) {
  // a set's license is its files' licenses, each named once
  m.license = [...new Set(Object.values(m.files).map((f) => f.license))].join(' · ') || 'none yet'
  m.inputs = Object.keys(m.files)
  await fs.mkdir(dir(m.name), { recursive: true })
  await fs.writeFile(path.join(dir(m.name), 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
  broadcast({ type: 'workspace.changed', path: `audio/${m.name}/manifest.json`, kind: 'change' })
}

function flags(words: string[]) {
  const pos: string[] = []
  const opts: Record<string, string> = {}
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('--')) opts[words[i].slice(2)] = words[++i] ?? ''
    else pos.push(words[i])
  }
  return { pos, opts }
}

const shown = (argv: string[]) => joinWords([...Object.entries(PY_ENV).map(([k, v]) => `${k}=${v}`), ...argv])

/** Soprano's voice changed afterwards by python/variable_machine/voice.py. */
export const CHANGED = ['robot', 'baritone']
/** Every voice speak takes: each speaking model's own, then the changed ones. */
export const VOICES = [...VOICE_MODELS.flatMap((m) => m.voices ?? []), ...CHANGED]

/** `speak <name> "<text>" [--voice <voice>] [--set spoken]`: a model reads the text aloud, into workspace/audio/<set>/<name>.wav. The voice picks the model. */
async function speak(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const [name, ...words] = pos
  const text = words.join(' ').trim()
  const set = opts.set ?? 'spoken'
  const voice = opts.voice
  if (!name || !NAME.test(name) || !text || !SET.test(set) || Object.keys(opts).some((k) => k !== 'set' && k !== 'voice') || (voice !== undefined && !VOICES.includes(voice))) {
    print(`usage: speak <name> "<text>" [--voice ${VOICES.join('|')}] [--set spoken]   (into workspace/audio/<set>/<name>.wav)`)
    return false
  }
  const m = await readAudioSet(set)
  if (m.files[`${name}.wav`]) return print(`speak: workspace/audio/${set}/${name}.wav exists; choose another name`), false
  // the model whose own voice it is; Soprano for its own and the changed ones
  const model = VOICE_MODELS.find((m) => voice && m.voices?.includes(voice)) ?? voiceModel('speaks')
  const own = !!voice && !CHANGED.includes(voice) && voice !== 'soprano'
  // Greedy (temperature 0): sampled, Soprano sometimes never says its stop token and hums to its
  // 32-second limit (2 of 3 tries on one sentence, 2026-10-24); greedy finished every sentence tried.
  const argv = [...UV_VOICE, 'python', '-m', 'mlx_audio.tts.generate', '--model', model.repo, '--text', text, '--temperature', '0', '--output_path', `workspace/audio/${set}`, '--file_prefix', name, '--audio_format', 'wav', ...(own ? ['--voice', voice, '--lang_code', 'en'] : [])]
  // mlx-audio numbers its files (_000) in case a long text is split; one text is one file here
  const spoken = `workspace/audio/${set}/${name}_000.wav`
  const out = `workspace/audio/${set}/${name}.wav`
  // another voice: the model's voice, changed afterwards (numpy and scipy, nothing learned)
  const change = voice && CHANGED.includes(voice) && [...UV_VOICE, 'python', 'python/variable_machine/voice.py', voice, spoken, out]
  return runRecipe({
    recipe: 'speak',
    params: { name, set, text, ...(voice ? { voice } : {}) },
    outputs: [out],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      ...(change ? [{ kind: 'spawn' as const, argv: change, env: PY_ENV }] : []),
      {
        kind: 'do',
        display: `${change ? `rm ${spoken}` : `mv ${spoken} ${name}.wav`}; write workspace/audio/${set}/manifest.json`,
        run: async () => {
          if (change) await fs.rm(path.join(dir(set), `${name}_000.wav`))
          else await fs.rename(path.join(dir(set), `${name}_000.wav`), path.join(dir(set), `${name}.wav`))
          const fresh = await readAudioSet(set)
          if (!fresh.command.length) fresh.command.push(line)
          fresh.files[`${name}.wav`] = { made: 'spoken', license: `${model.license} (${model.original})`, text, model: model.repo, ...(voice ? { voice } : {}), command: [line, shown(argv), ...(change ? [shown(change)] : [])] }
          await writeAudioSet(fresh)
        },
      },
    ],
  })
}

/** `listen audio/<set>/<file>.wav [--language English]`: a speech model writes down what it hears, next to the file and in the manifest. */
async function listen(args: string[], line: string): Promise<boolean> {
  const { pos, opts } = flags(args)
  const m0 = /^(?:workspace\/)?audio\/([a-z0-9][a-z0-9._-]{0,63})\/([\w.-]+)$/.exec(pos[0] ?? '')
  if (!m0 || !AUDIO_EXT.test(m0[2]) || pos.length !== 1 || Object.keys(opts).some((k) => k !== 'language')) {
    print('usage: listen audio/<set>/<file>.wav [--language English]   (it hears which language when none is given)')
    return false
  }
  const [, set, file] = m0
  try {
    await fs.access(path.join(dir(set), file))
  } catch {
    return print(`listen: no workspace/audio/${set}/${file}`), false
  }
  const model = voiceModel('listens')
  const base = file.replace(AUDIO_EXT, '')
  const argv = [
    ...UV_VOICE, 'python', '-m', 'mlx_audio.stt.generate',
    '--model', model.repo,
    '--audio', `workspace/audio/${set}/${file}`,
    '--output-path', `workspace/audio/${set}/${base}`,
    '--format', 'txt',
    ...(opts.language ? ['--language', opts.language] : []),
  ]
  return runRecipe({
    recipe: 'listen',
    params: { set, file },
    outputs: [`workspace/audio/${set}/${base}.txt`],
    steps: [
      { kind: 'spawn', argv, env: PY_ENV },
      {
        kind: 'do',
        display: `read workspace/audio/${set}/${base}.txt into workspace/audio/${set}/manifest.json`,
        run: async () => {
          const transcript = (await fs.readFile(path.join(dir(set), `${base}.txt`), 'utf8')).trim()
          print(`  heard: ${transcript || '(nothing)'}`)
          const fresh = await readAudioSet(set)
          const f = fresh.files[file] ?? { made: 'recorded', license: 'unknown' }
          fresh.files[file] = { ...f, transcript, heardBy: model.repo, ...(opts.language && { language: opts.language }), command: [...(f.command ?? []), line] }
          await writeAudioSet(fresh)
        },
      },
    ],
  })
}

export async function voiceCommand(cmd: string, args: string[], line: string): Promise<boolean> {
  return cmd === 'speak' ? speak(args, line) : listen(args, line)
}
