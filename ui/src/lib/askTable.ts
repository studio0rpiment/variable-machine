import { parseCsv } from '@shared/rowShapes'
import { askSystem } from '@shared/tableQuestions'
import { parseQuery, phrase, prepare, runQuery, toSql, type Prepared, type Query, type Result, type Roles } from '@shared/tableQuery'
import type { DatasetManifest } from '@shared/manifest'
import { readFile, readManifests } from './workspace'

/**
 * Asking a table from the page: the table is read once (source.csv and
 * roles.json from workspace/raw/<table>), and every query a model writes is
 * run here, by the same runner the helper and an exported package use.
 */

const tables = new Map<string, Promise<Prepared | null>>()

export function loadTable(table: string, again = false): Promise<Prepared | null> {
  if (again || !tables.has(table))
    tables.set(
      table,
      Promise.all([readFile(`raw/${table}/source.csv`), readFile(`raw/${table}/roles.json`)]).then(([csv, r]) => {
        if (!csv || !r) return null
        const objs = parseCsv(csv)
        const columns = objs[0] ? Object.keys(objs[0]) : []
        return prepare({ columns, rows: objs.map((o) => columns.map((c) => o[c] ?? '')) }, JSON.parse(r) as Roles)
      }),
    )
  return tables.get(table)!
}

/** Tables that can be asked: brought in and read (they have roles.json). */
export async function askableTables(): Promise<string[]> {
  const raw = await readManifests<{ name: string; columns?: string[] }>('raw')
  const have = await Promise.all(raw.filter((r) => r.columns?.length).map(async (r) => ((await readFile(`raw/${r.name}/roles.json`)) ? r.name : null)))
  return have.filter((x): x is string => !!x)
}

/**
 * The table a model was trained to ask, if it was: its Modelfile names the
 * adapter, the adapter names its dataset, and the dataset names its table.
 */
export async function tableForModel(model: string): Promise<{ table: string; system: string } | null> {
  const d = await datasetForModel(model)
  return d?.table && d.ask ? { table: d.table.slice(4), system: d.ask.system } : null
}

/** The dataset a model made here was trained on: its Modelfile names the adapter, and the adapter its dataset. */
export async function datasetForModel(model: string): Promise<DatasetManifest | null> {
  const name = model.replace(/:latest$/, '')
  const mf = await readFile(`modelfiles/${name}.Modelfile`)
  const adapter = mf && /made by Variable Machine from adapter (\S+)/.exec(mf)?.[1]
  if (!adapter) return null
  const am = await readFile(`adapters/${adapter}/manifest.json`)
  const data = am && (JSON.parse(am) as { data?: string }).data
  const dm = data && (await readFile(`data/${data}/manifest.json`))
  return dm ? (JSON.parse(dm) as DatasetManifest) : null
}

export interface Asked {
  /** what the model wrote */
  wrote: string
  query?: Query
  /** why what it wrote isn't a query the runner can use, or why the table can't answer it */
  problem?: string
  result?: Result
  sql?: string
  sentence?: string
}

/** What the model wrote, run against the table: the query, the result and its rows, a sentence. */
export function runWritten(p: Prepared, wrote: string): Asked {
  const parsed = parseQuery(wrote)
  if ('error' in parsed) return { wrote, problem: parsed.error }
  const result = runQuery(p, parsed.query, 12)
  if (!result.ok) return { wrote, query: parsed.query, problem: result.error }
  return { wrote, query: parsed.query, result, sql: toSql(parsed.query, p.roles), sentence: phrase(result, parsed.query, p.roles) }
}

export const systemFor = (p: Prepared) => askSystem(p.roles.title ?? 'the table')
