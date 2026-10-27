/**
 * The two pages a package carries: demo.html, a one-page "ask the table" app
 * that needs only a browser and Ollama, and README.md, how to use it from a
 * web page, Node, Python, and TouchDesigner or Max over OSC.
 */

export interface PackageInfo {
  /** the model's name in Ollama */
  model: string
  title: string
  license: string
  credit: string
  page?: string
  source?: string
  rows: number
  range: string
  noun: string
  examples: string[]
  /** how often its queries gave the right answer on questions it never saw, when that was checked */
  checked?: { same: number; n: number }
  base: string
  adapter: string
  dataset: string
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function demoHtml(i: PackageInfo): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ask ${esc(i.title)}</title>
<style>
  :root { --bg: #111613; --line: #FFF7E6; --act: #5CF25C; --muted: color-mix(in srgb, var(--line) 55%, var(--bg)); --warn: #e0604a; }
  @media (prefers-color-scheme: light) { :root { --bg: #FFF7E6; --line: #111613; --act: #12801c; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--line); font: 0.9rem/1.55 ui-monospace, "SF Mono", Menlo, monospace; }
  main { max-width: 48rem; margin: 0 auto; padding: 2rem 1rem 4rem; display: flex; flex-direction: column; gap: 1.25rem; }
  h1 { font-size: 1.1rem; font-weight: normal; letter-spacing: 0.06em; text-transform: uppercase; margin: 0; }
  .muted { color: var(--muted); font-size: 0.78rem; }
  form { display: flex; gap: 0.75rem; align-items: flex-end; }
  input { flex: 1; font: inherit; color: inherit; background: none; border: 0; border-bottom: 1px solid var(--muted); padding: 0.4rem 0; }
  input:focus { outline: none; border-bottom-color: var(--line); }
  button { font: inherit; color: var(--act); background: none; border: 1px solid var(--act); padding: 0.4rem 0.9rem; cursor: pointer; }
  button:disabled { opacity: 0.4; cursor: default; }
  .examples { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .examples button { border-style: dashed; font-size: 0.75rem; padding: 0.2rem 0.5rem; }
  .answer { font-size: 1.15rem; margin: 0; }
  .problem { border: 1px solid var(--warn); padding: 0.6rem 0.8rem; margin: 0; }
  code, pre { display: block; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px dotted var(--muted); padding: 0.5rem 0.6rem; margin: 0.25rem 0 0; font-size: 0.75rem; }
  ol { margin: 0; padding: 0; list-style: none; }
  ol li { display: flex; justify-content: space-between; border-bottom: 1px dashed var(--muted); }
  table { border-collapse: collapse; font-size: 0.72rem; }
  th, td { text-align: left; padding: 0.15rem 0.6rem 0.15rem 0; white-space: nowrap; border-bottom: 1px dashed var(--muted); }
  th { color: var(--muted); font-weight: normal; }
  .rows { overflow-x: auto; }
  details summary { cursor: pointer; color: var(--act); }
  footer { border-top: 1px solid var(--muted); padding-top: 1rem; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Ask ${esc(i.title)}</h1>
    <p class="muted">${i.rows.toLocaleString('en-US')} ${esc(i.noun)}s · ${esc(i.range)} · a small model (${esc(i.model)}) turns your question into a query; the answer is counted from the table, so it is always what the table says.</p>
  </header>
  <form id="ask">
    <input id="q" autocomplete="off" placeholder="a question about the table" aria-label="question">
    <button id="go" type="submit">ask</button>
  </form>
  <div class="examples" aria-label="examples">${i.examples.map((e) => `<button type="button">${esc(e)}</button>`).join('')}</div>
  <section id="out" aria-live="polite"></section>
  <footer class="muted">
    Data: ${esc(i.credit)}${i.page ? ` (<a href="${esc(i.page)}" style="color:var(--act)">its page</a>)` : ''}, ${esc(i.license)}.
    Needs Ollama running, with the model made once: <code>ollama create ${esc(i.model)} -q int8 -f model/Modelfile</code>
    Made with Variable Machine.
  </footer>
</main>
<script src="data/table.js"></script>
<script src="ask.js"></script>
<script>
  const ask = askTable.fromPage()
  const out = document.getElementById('out')
  const q = document.getElementById('q')
  const go = document.getElementById('go')
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
  async function run(question) {
    if (!question.trim()) return
    go.disabled = true
    out.innerHTML = '<p class="muted">the model is writing a query…</p>'
    try {
      const a = await ask(question)
      const r = a.result && a.result.ok ? a.result : null
      const parts = r && (r.sides || r.groups)
      const cols = r && r.rows[0] ? Object.keys(r.rows[0]).slice(0, 7) : []
      out.innerHTML =
        (a.problem ? '<p class="problem">' + esc(a.answer) + '</p>' : '<p class="answer">' + esc(a.answer) + '</p>') +
        '<p class="muted">the query it wrote<code>' + esc(a.query ? JSON.stringify(a.query) : a.wrote || '(nothing)') + '</code></p>' +
        (parts ? '<ol>' + parts.map((p) => '<li><span>' + esc(p.label) + '</span><span>' + fmt(p.value) + '</span></li>').join('') + '</ol>' : '') +
        (r ? '<details><summary>the rows behind it (' + fmt(r.matched) + ' match; the first ' + r.rows.length + ')</summary><div class="rows"><table><tr>' + cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr>' + r.rows.map((row) => '<tr>' + cols.map((c) => '<td>' + esc(row[c]) + '</td>').join('') + '</tr>').join('') + '</table></div></details>' : '') +
        (a.sql ? '<details><summary>the same query in SQL</summary><pre>' + esc(a.sql) + '</pre></details>' : '')
    } catch (err) {
      out.innerHTML = '<p class="problem">Couldn\\'t reach Ollama: ' + esc(err.message) + '. Is it running, and is the model made (ollama create ${esc(i.model)} -q int8 -f model/Modelfile)? If the page was opened as a file and the browser blocks it, run <code>python3 -m http.server 8000</code> in this folder and open http://localhost:8000/demo.html</p>'
    }
    go.disabled = false
  }
  document.getElementById('ask').addEventListener('submit', (e) => { e.preventDefault(); run(q.value) })
  document.querySelectorAll('.examples button').forEach((b) => b.addEventListener('click', () => { q.value = b.textContent; run(b.textContent) }))
</script>
</body>
</html>
`
}

export function readme(i: PackageInfo): string {
  return `# Ask ${i.title}

A small model that turns a question about one table into a query, and a runner that answers the query from the table. The model never states a number itself: every answer is counted from the rows in \`data/\`, so it is always what the table says, and when the model writes a query that can't run you get "no answer", not a guess.

- **The table:** ${i.title}, ${i.rows.toLocaleString('en-US')} ${i.noun}s, ${i.range}.
- **The model:** \`${i.model}\`, ${i.base} with a LoRA adapter trained on ${i.dataset} (questions and the queries that answer them).${i.checked ? `\n- **How often it's right:** on ${i.checked.n} questions it never saw in training, its query gave the same answer as the correct query ${i.checked.same} times (${Math.round((i.checked.same / i.checked.n) * 100)}%). Questions unlike the ones it trained on do worse: check the query it wrote.` : ''}

## What you need

[Ollama](https://ollama.com/download), running. Then, once, in this folder:

\`\`\`bash
ollama create ${i.model} -q int8 -f model/Modelfile
\`\`\`

It reads \`model/weights/\` and takes a minute. That's all for the web page. Node, Python and OSC use Node (version 18 or newer), which Variable Machine already installed.

## In a web page

Open \`demo.html\`: type a question, or click an example. It shows the answer, the query the model wrote, the counts, and the rows behind them.

If your browser won't let a page opened as a file talk to Ollama, serve the folder instead: \`python3 -m http.server 8000\` here, then open http://localhost:8000/demo.html.

In your own page:

\`\`\`html
<script src="data/table.js"></script>
<script src="ask.js"></script>
<script>
  const ask = askTable.fromPage()
  ask('${i.examples[0] ?? 'How many rows are there?'}').then((a) => console.log(a.answer, a.query, a.rows))
</script>
\`\`\`

\`ask(question)\` resolves to \`{ answer, query, rows, result, sql, wrote, problem }\`: the sentence, the query the model wrote, the first rows behind it, the numbers (\`result.value\`, and \`result.sides\` or \`result.groups\` for comparisons and rankings), the same query as SQL, what the model wrote as it wrote it, and (when there is no answer) why.

## In Node

\`\`\`js
const askTable = require('./ask.js')
const ask = askTable.load(__dirname)
ask('${i.examples[1] ?? i.examples[0] ?? 'How many rows are there?'}').then((a) => console.log(a.answer))
\`\`\`

Or from the command line, which prints JSON:

\`\`\`bash
node ask.js "${i.examples[0] ?? 'How many rows are there?'}"
\`\`\`

## In Python

The runner is JavaScript, so Python asks it through Node:

\`\`\`python
import json, subprocess

def ask(question):
    out = subprocess.run(["node", "ask.js", question], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)

a = ask("${i.examples[0] ?? 'How many rows are there?'}")
print(a["answer"], a["value"], a["query"])
\`\`\`

## TouchDesigner and Max (OSC)

Start the bridge, the same way the gesture tab sends OSC: to this computer only.

\`\`\`bash
node ask.js --osc 9001 --reply 9000
\`\`\`

Send \`/ask "<question>"\` to 127.0.0.1 port 9001. Answers come back to port 9000 as:

- \`/answer "<the sentence>"\`
- \`/value <number>\`: the count (or sum, or average)
- \`/part "<label>" <number>\`: one message for each side of a comparison, or each place in a ranking
- \`/query "<the query, as JSON>"\`
- \`/error "<what went wrong>"\`

**TouchDesigner:** an OSC Out DAT to 127.0.0.1:9001 (\`op('oscout1').sendOSC('/ask', ['How many robberies in ward 2?'])\`), and an OSC In DAT or CHOP on port 9000.
**Max:** \`[udpsend 127.0.0.1 9001]\` with a message \`/ask "How many robberies in ward 2?"\`, and \`[udpreceive 9000]\` into \`[route /answer /value /part]\`.

## What's in the folder

- \`model/Modelfile\` and \`model/weights/\`: the model, the base with its adapter joined in (safetensors, about 700MB). \`ollama create\` reads them and keeps an 8-bit copy, about 400MB; after that the folder can go. \`model/adapter/\`: the LoRA adapter on its own, 9MB, to train further with Variable Machine (this version of Ollama doesn't load adapters by themselves).
- \`data/table.json\`: the table, as columns and rows; \`data/table.js\` is the same for a web page, with the roles and settings.
- \`roles.json\`: what each column means in a question (what, where, when, how much, how), and the words people use for coded values ("murders" → HOMICIDE).
- \`ask.json\`: the model's name, and the line it was trained with.
- \`ask.js\`: question → Ollama → query → runner → answer. The query format is described at the top of the file.

## What it can't do

It answers what the table can count: how many, where (an area, or near a block), when (a year, a month, a weekday, hours of the day, the last days of the table), which has the most, and this against that. It can't answer why, or anything the table doesn't record. Questions worded far from the ones it trained on can get the wrong query: the query is always shown, so check it. The table is a copy made ${new Date().toISOString().slice(0, 10)}; the source keeps changing.

## License and credit

The data: ${i.credit}, ${i.license}${i.page ? ` (${i.page})` : ''}${i.source ? `, read from ${i.source}` : ''}. Credit it wherever you show answers from it.
The model: ${i.base} (Apache 2.0), with an adapter trained on questions made from the table.
Made with Variable Machine.
`
}
