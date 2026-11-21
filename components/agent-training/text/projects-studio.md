# Words for the card "Models for a multi-agent studio"

Moved out of Variable Machine's `ui/src/text/projects.md` (one `##` section per card; each key in backticks, its text under it). Put this section back into a tab file of that shape, or turn each key into the agent harness app's own words.

## Models for a multi-agent studio

### Name
`projects.studio.title`

models for a multi-agent studio

### What it does
`projects.studio.does`

Trains the small models a multi-agent studio calls for one job each. In a studio like the interactive studio in the crew explorer, every agent runs on qwen3:4b; a reader model reads one kind of text (a message, an invoice, a build log, a package update, a page of credits, a list of deadlines) and returns the same fields every time, as JSON. The agents' scripts call the readers; the agents never train them.

### What you end up with
`projects.studio.get`

one model in Ollama per reader, named studio-mail, studio-invoice, studio-log, studio-update, studio-facts and studio-status, each a small model trained for its one job

### What it can't do
`projects.studio.limits`

It trains SmolLM2, not qwen3:4b, so a reader is a whole small model of its own, not an adapter on the agents' model. Training is done by hand here; no agent can start it. The image reader needs photos of the studio's works, which a person supplies; until then it is the untrained smolvlm:256m.

### Step: the set
`projects.studio.set`

pick a reader and make its set: one for each, named studio- and the reader

### Step: the set, walkthrough 1
`projects.studio.set.name`

The set's name: studio- and the reader. studio-mail is filled in; change the reader's name if you're making another one.

### Step: the set, walkthrough 2
`projects.studio.set.create`

Make the set. It starts empty: the next step fills it.

### Step: rows
`projects.studio.rows`

have a model draft made-up examples from the studio's notes (a .txt or .md, uploaded under drafts on the Data tab), each a text and its fields as JSON; then keep, edit or reject each draft

### Step: rows, walkthrough 1
`projects.studio.rows.from`

The studio's notes: who the clients and suppliers are, and the work. Choose them, or upload them as a .txt or .md. The model knows only what's in here.

### Step: rows, walkthrough 2
`projects.studio.rows.fields`

What the reader returns from every message, always the same. Change them now if the studio needs others: they can't change once the rows are made.

### Step: rows, walkthrough 3
`projects.studio.rows.draft`

The command. Press it to run it: drafts arrive ten at a time and wait, unreviewed. You can leave the tab while it runs.

### Step: rows, walkthrough 4
`projects.studio.rows.read`

Read each draft. Keep it, fix it and keep it, or reject it. Look for a field the text doesn't actually say. The step is done at {target} kept.

### Step: corrections
`projects.studio.corrections`

add the lead's corrections from the studio as rows, each marked with where it came from

### Step: split
`projects.studio.split`

set rows aside for checking, and check every row is valid

### Step: split, walkthrough 1
`projects.studio.split.split`

Set 15% of the rows aside, then press split. The reader never trains on these: the last step checks it on them.

### Step: split, walkthrough 2
`projects.studio.split.validate`

Check every row: each needs a text and an answer that is JSON with the fields.

### Step: train
`projects.studio.train`

train the reader on the rows

### Step: train, walkthrough 1
`projects.studio.train.base`

SmolLM2-360M is chosen: the reader is a whole small model of its own, small enough to answer quickly on an 8 GB Mac.

### Step: train, walkthrough 2
`projects.studio.train.maxSeq`

512 is chosen: a message and its fields are short, and a shorter length trains faster and in less memory.

### Step: train, walkthrough 3
`projects.studio.train.run`

The set and the adapter's name are filled in. Press train; the loss should fall as it goes.

### Step: export
`projects.studio.export`

export it into Ollama under the reader's name

### Step: compare
`projects.studio.compare`

compare it with qwen3:4b given a prompt: valid JSON and right fields on the rows set aside, and on a set of rows unlike any it trained on

### The comparison
`projects.studio.compared`

on {n} rows set aside: {scores}

### One model's score
`projects.studio.result`

{model} {right}% of fields right, {rows}% of rows, {s}s a row


