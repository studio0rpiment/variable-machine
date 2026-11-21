/**
 * The card "Models for a multi-agent studio", as it was in Variable Machine's
 * ui/src/components/ProjectsPanel.tsx (removed 2026-11-19). Not compiled here:
 * it is the card's code kept whole, to rebuild the card in the agent harness
 * app. It names Variable Machine's own parts (Have, Project, say, joinWords,
 * last, kept, KEEP, SMALL); the README says what each one is.
 */

// ── 1. In Have (what the workspace holds), the reader checks: ──────────────────
//   /** `reader check` results: the reader's scores, then the stand-in's */
//   readerChecks: { dataset: string; model: string; at: string; n: number; scores: { model: string; right: number; fields: number; rows: number; ms: number }[] }[]
//
// ── 2. In readHave(), read from each studio-* set's check-<model>.json: ────────
//   const readerChecks: Have['readerChecks'] = []
//   for (const d of data.filter((x) => x.ask || x.folder.startsWith('studio-')))
//     for (const f of await listDir(`data/${d.folder}`)) {
//       const m = /^check-(.+)\.json$/.exec(f.name)
//       if (m) checks.add(`${d.folder}/${m[1]}`)
//       if (m && !d.ask) {
//         const c = JSON.parse((await readFile(`data/${d.folder}/${f.name}`)) ?? 'null') as Have['readerChecks'][number] & { reader?: boolean }
//         if (c?.reader) readerChecks.push(c)
//       }
//     }
//
// ── 3. The kept-rows target (shared with the voice card in Variable Machine): ──
//   const KEEP = { studio: 150, voice: 100 }
//
// ── 4. In the projects list: what the card reads from the workspace, then the card. ──

import { readerFields } from './readers'

export function studioCard(h: Have): Project {
  // a multi-agent studio's readers, one at a time, by name: studio-<reader> set → studio-<reader>-360m → studio-<reader> in Ollama
  const readerSets = h.data.filter((d) => d.folder.startsWith('studio-') && d.format === 'chat')
  const readers = h.adapters.filter((a) => readerSets.some((d) => d.folder === a.data))
  const readerModels = h.models.filter((m) => readers.some((a) => a.folder === m.adapter))
  // the set the last reader trained on; a set made only to check it (rows it never saw) doesn't move the card on
  const reader = last(readers)?.data ?? last(readerSets)?.folder ?? 'studio-mail'
  const readerAdapter = last(readers)?.folder ?? `${reader}-360m`
  const readerSet = readerSets.find((d) => d.folder === reader)
  const readerCount = readerSet ? kept(readerSet) : { kept: 0, unreviewed: 0 }
  const notes = h.raw.find((r) => !r.columns?.length && /notes/.test(r.folder))?.folder
  const notesFrom = (notes && `raw/${notes}`) ?? h.texts.find((t) => /notes/.test(t)) ?? '<notes>'
  const readerModel = last(readerModels)?.model ?? reader
  // sets of rows the reader never trained on, made only to check it
  const asAside = readerSets.filter((d) => d.folder !== reader && !readers.some((a) => a.data === d.folder))
  const compared = [...h.readerChecks].sort((a, b) => a.at.localeCompare(b.at)).pop()
  const pc = (a: number, b: number) => Math.round((a / b) * 100)
  const comparedLine =
    compared &&
    compared.scores
      .map((x) => say('projects.studio.result', { model: x.model, right: pc(x.right, x.fields), rows: pc(x.rows, compared.n), s: (x.ms / 1000).toFixed(1) }))
      .join(' · ')

  return {
      id: 'studio',
        title: say('projects.studio.title'),
        does: say('projects.studio.does'),
        get: say('projects.studio.get'),
        limits: say('projects.studio.limits'),
        steps: [
          {
            name: say('projects.studio.set'),
            tab: 'data',
            commands: [joinWords(['data', 'new', reader])],
            done: readerSets.length > 0,
            fill: { data: { pick: 'new', newName: reader } },
            notes: [
              { at: 'data.new.name', text: say('projects.studio.set.name') },
              { at: 'data.new', text: say('projects.studio.set.create') },
            ],
          },
          {
            name: say('projects.studio.rows'),
            tab: 'data',
            commands: [joinWords(['data', 'draft', reader, '--from', notesFrom, '--fields', readerFields(reader) ?? '<a,b,c>', '--count', '200', '--model', 'qwen3:4b'])],
            done: readerCount.kept >= KEEP.studio,
            result: readerSet && say('projects.step.kept', { kept: readerCount.kept, target: KEEP.studio, unreviewed: readerCount.unreviewed }),
            fill: { data: { pick: reader } },
            notes: [
              { at: 'data.drafts.from', text: say('projects.studio.rows.from') },
              { at: 'data.drafts.fields', text: say('projects.studio.rows.fields') },
              { at: 'data.draft', text: say('projects.studio.rows.draft') },
              { at: 'data.drafts.list', text: say('projects.studio.rows.read', { target: KEEP.studio }) },
            ],
          },
          { name: say('projects.studio.corrections'), tab: 'data', fill: { data: { pick: reader } }, commands: [`data append ${reader} '<row json>' --source corrections`], done: readerSets.some((d) => d.command.some((c) => c.startsWith('data append') && c.includes('--source corrections'))) },
          {
            name: say('projects.studio.split'),
            tab: 'data',
            commands: [joinWords(['data', 'split', reader, '--valid', '0.15']), joinWords(['data', 'validate', reader])],
            done: readerSets.some((d) => d.split),
            fill: { data: { pick: reader } },
            notes: [
              { at: 'data.split.run', text: say('projects.studio.split.split') },
              { at: 'data.validate', text: say('projects.studio.split.validate') },
            ],
          },
          {
            name: say('projects.studio.train'),
            tab: 'train',
            commands: [joinWords(['train', readerAdapter, '--data', reader, '--base', SMALL, '--max-seq', '512'])],
            done: readers.length > 0,
            fill: { train: { data: reader, name: readerAdapter, base: SMALL, maxSeq: 512 } },
            notes: [
              { at: 'train.base', text: say('projects.studio.train.base') },
              { at: 'train.maxSeq', text: say('projects.studio.train.maxSeq') },
              { at: 'train.run', text: say('projects.studio.train.run') },
            ],
          },
          { name: say('projects.studio.export'), tab: 'adapters', commands: [joinWords(['export', readerAdapter, '--name', reader])], done: readerModels.length > 0 },
          { name: say('projects.studio.compare'), tab: 'chat', commands: [joinWords(['reader', 'check', readerModel, reader]), ...asAside.map((d) => joinWords(['reader', 'check', readerModel, d.folder]))], done: !!compared, result: comparedLine ? say('projects.studio.compared', { n: compared!.n, scores: comparedLine }) : undefined },
        ],
  }
}
