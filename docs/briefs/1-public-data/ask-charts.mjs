// Ask a chart-writer model the 12 questions, held to the chart schema, and check every answer.
//
//   node docs/briefs/1-public-data/ask-charts.mjs chart-writer-qwen3-4b
//
// Each answer must parse, compile as Vega-Lite, have a title, keep axes from zero and
// use only the table's columns (check-chart.mjs). Needs `npm install` in this folder once.
import fs from 'node:fs'
import { check } from './check-chart.mjs'

const here = new URL('.', import.meta.url)
async function main() {
  const model = process.argv[2]
  if (!model) return console.log('usage: node ask-charts.mjs <model>')
  const questions = JSON.parse(fs.readFileSync(new URL('chart-questions.json', here), 'utf8'))
  const schema = JSON.parse(fs.readFileSync(new URL('chart-schema.json', here), 'utf8'))
  let pass = 0
  const answers = []
  for (const q of questions) {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model, messages: [{ role: 'user', content: q }], stream: false, think: false, format: schema, options: { num_predict: 1200 } }),
    })
    const text = (await res.json()).message?.content ?? ''
    const c = check(text)
    if (c.ok) pass++
    console.log(`${c.ok ? 'pass' : 'FAIL'}  ${q}${c.problems.length ? `  (${c.problems.join('; ')})` : ''}`)
    answers.push({ question: q, chart: text })
  }
  console.log(`\n${pass} of ${questions.length} compile and keep the rules`)
  const out = `workspace/outputs/charts-${model.replace(/[^\w.-]/g, '_')}.json`
  fs.mkdirSync('workspace/outputs', { recursive: true })
  fs.writeFileSync(out, JSON.stringify(answers, null, 1))
  console.log(`the charts are in ${out}: paste one into https://vega.github.io/editor/ with your CSV`)
}
main()
