import { KINDS, type EncoderModel, type KindId, type ToolModel } from '@shared/kinds'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
import { DownloadWait } from './Loading'
import { Explained } from '../explain/Explained'

/** "looks · image tools: cut-outs, depth, selecting · on the image segmentation tab": a kind's word, what it does, and where you use it. */
export function KindLine({ kind }: { kind: KindId }) {
  const k = KINDS[kind]
  return (
    <span className="kind-line label">
      <span className="kind-line__word">{k.id}</span> · {k.what} · {k.soon ? 'coming' : `on the ${k.tabs.join(', ')} tab${k.tabs.length > 1 ? 's' : ''}`}
    </span>
  )
}

/** A ready-made tool model: what it does, its license and size, and `model get` until it is here. */
export default function ToolCard({ tool, here, busy, onGet }: { tool: ToolModel; here: boolean; busy: boolean; onGet: () => void }) {
  return (
    <Manifest
      name={tool.action}
      badges={<Badge>{tool.kind}</Badge>}
      lines={[`look ${tool.name} · ${tool.maker} · ${tool.license}`, `${tool.repo} · about ${tool.mb} MB${tool.needs === 'webgpu' ? ' · needs WebGPU' : ''}`, here ? 'in workspace/tools' : 'not downloaded yet']}
      actions={
        !here &&
        (busy ? (
          <DownloadWait name={tool.name} label={`downloading ${tool.name}`} />
        ) : (
          <Explained id="look.get">
            <CommandPreview command={`model get ${tool.name}`} onRun={onGet} running={busy} label={`download ${tool.name}`} />
          </Explained>
        ))
      }
    >
      <p className="model-about">{tool.builtFor}</p>
      <span className="label label--muted">{KINDS[tool.kind].io}</span>
    </Manifest>
  )
}

/** A picture encoder (the sorts kind): what it does, its license and size, and `model get` until it is here. */
export function EncoderCard({ e, here, busy, onGet }: { e: EncoderModel; here: boolean; busy: boolean; onGet: () => void }) {
  return (
    <Manifest
      name={e.name}
      badges={<Badge>{e.kind}</Badge>}
      lines={[`${e.maker} · ${e.license}`, `${e.repo}, from ${e.original} · about ${e.mb} MB`, here ? 'in workspace/tools' : 'not downloaded yet']}
      actions={
        !here &&
        (busy ? (
          <DownloadWait name={e.name} label={`downloading ${e.name}`} />
        ) : (
          <CommandPreview command={`model get ${e.name}`} onRun={onGet} running={busy} label={`download ${e.name}`} />
        ))
      }
    >
      <p className="model-about">{e.builtFor}</p>
      <span className="label label--muted">{KINDS[e.kind].io}</span>
    </Manifest>
  )
}
