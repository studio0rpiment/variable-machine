import { KINDS, type KindId, type ToolModel } from '@shared/kinds'
import Manifest, { Badge } from './Manifest'
import CommandPreview from './CommandPreview'
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
        !here && (
          <Explained id="look.get">
            <CommandPreview command={`model get ${tool.name}`} onRun={onGet} running={busy} label={`download ${tool.name}`} />
          </Explained>
        )
      }
    >
      <p className="model-about">{tool.builtFor}</p>
      <span className="label label--muted">{KINDS[tool.kind].io}</span>
    </Manifest>
  )
}
