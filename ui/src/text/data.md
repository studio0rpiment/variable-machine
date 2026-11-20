# The data tab

The words on the data tab are moving here, a part at a time; so far, the way to bring in **papers and articles** (the research bot). The rest are still in `ui/src/explain/data.ts`, `ui/src/explain/flags.md` and the tab's components. Edit the words here: `npm run dev` rebuilds the page when you save, and you see the change when you reload it.

Each entry is:

- a `###` line with its **title**, to find it by. On a flag (a pop-up that explains a control), the title is shown: it is the bold words at the top of the flag;
- on the next line, its **name** in backticks, which ties it to its place on the page. Don't change the name. A flag says so after its name: `data.papers` flag;
- then its **text**, one paragraph (line breaks inside it become spaces).

In the text, a word in braces, like `{n}`, is filled in by the page; `code`, *italic* and **bold** are shown as such. Commands, titles and numbers the page works out come from the code. The build checks this file against the page, and stops with a message naming the entry if a name is missing, unused or misspelt, or a placeholder doesn't match.

## Papers and articles: the way in, on "make a new one"

### Heading
`data.papers.title`

papers and articles: a reading list on a topic, and a point of view on what's relevant

### When to use it
`data.papers.when`

For research: give a topic and two to five papers or articles you already know are relevant. A model writes searches; search code finds real papers in OpenAlex, Semantic Scholar, arXiv and Crossref, posts in the feeds you name, and the papers your seeds cite and are cited by. The model then screens them, keep or skip with a reason, and you change any you disagree with. You get a reading list and BibTeX, and your decisions can become a training set for a point of view: a small model that judges relevance the way you do.

### What it can't do
`data.papers.limits`

It reads abstracts, not full text behind a paywall. It never asks a model for a citation: every item comes from a search. There is no official Substack search, so a Substack or a blog comes in by its feed address, like name.substack.com/feed.

### The card's name
`data.papers.card`

search for papers and articles

### The card's first line
`data.papers.card.line1`

OpenAlex, Semantic Scholar, arXiv, Crossref, and RSS feeds; citations both ways

### The card's second line
`data.papers.card.line2`

searching reads; the model only writes the searches and screens what they find

## Starting a search

### Name
`data.papers.name`

as

### Topic
`data.papers.topic`

topic

### Topic, example
`data.papers.topic.example`

e.g. creativity support tools for visual artists working with generative AI

### Seeds
`data.papers.seeds`

2 to 5 seeds, one a line: a DOI, an arXiv id, or a web address

### Seeds, example
`data.papers.seeds.example`

10.1145/3290605.3300619

### Feeds
`data.papers.feeds`

feeds, one a line (optional): a Substack or a blog

### Feeds, example
`data.papers.feeds.example`

name.substack.com/feed

### How many seeds there are
`data.papers.seeds.count`

{n} seeds: give 2 to 5

### The run button
`data.papers.search.run`

search

### Search
`data.papers` flag

Starts the research bot. A model (qwen3:4b) writes 8 searches from your topic and seeds. Search code then asks OpenAlex, Semantic Scholar, arXiv and Crossref for real papers, reads your feeds, and follows the seeds' citations both ways. Duplicates are removed by DOI, or by title. Everything found goes in a library, so a later run shows only what is new. Without keys, Semantic Scholar is often busy and OpenAlex has a small daily budget per network: the terminal says when a source didn't answer.

## A research folder

### Choose one
`data.papers.pick`

research

### What's in it
`data.papers.counts`

{seen} seen · {screened} screened · {kept} kept · {mine} decided by you · {fresh} new in the last run

### The model that compares, missing
`data.papers.embed.missing`

Screening needs nomic-embed-text (274 MB), a model that turns a text into numbers so texts can be compared.

### Screen
`data.papers.screen.run`

screen

### Screen
`data.papers.screen` flag

First nomic-embed-text compares every item with your seeds and topic, so the closest come first. Then the model reads the 40 closest, title and abstract, and answers keep or skip with one line why. The rest are skipped by similarity alone, and say so. Change any decision you disagree with: yours wins, and yours are what a point of view learns from.

### Which items to show
`data.papers.show`

show

### Show: new
`data.papers.show.new`

new in the last run

### Show: read by the model
`data.papers.show.read`

read by the model

### Show: kept
`data.papers.show.kept`

kept

### Show: all
`data.papers.show.all`

all

### None to show
`data.papers.none`

none here

### The similarity
`data.papers.sim`

similarity {sim}

### The screen's decision
`data.papers.screen.said`

{by}: {decision}

### Your decision
`data.papers.yours`

you: {decision}

### Keep
`data.papers.keep`

keep

### Skip
`data.papers.skip`

skip

### Undo yours
`data.papers.undo`

undo

### Your decision
`data.papers.decide` flag

Your decision, over the screen's: it runs papers decide, which shows in the terminal. Keep what you'd read for this topic; skip what you wouldn't. A point of view you train learns from these, so decide the ones the model got wrong as well as the ones it got right.

### Its abstract
`data.papers.abstract`

abstract

### No abstract
`data.papers.noAbstract`

no abstract: only the title is known

### Free to read
`data.papers.free`

free to read

### The summary
`data.papers.summary`

summary, each claim with its quote

## What to do with it

### Heading
`data.papers.next`

then

### Summarise
`data.papers.summarise.run`

summarise the kept items that are free to read

### Reading list
`data.papers.list.run`

make the reading list and BibTeX

### Reading list, open
`data.papers.list.open`

reading-list.md

### BibTeX, download
`data.papers.bib.open`

references.bib

### Check
`data.papers.check.run`

check the model against your decisions

### Check, the result
`data.papers.check.result`

the model agrees with you on {agree} of {n} ({pct}%); similarity alone on {sim}

### Point of view set
`data.papers.judge.run`

make a training set from the decisions

### Point of view set
`data.papers.judge` flag

Your decisions, and the model's where you left them, become a training set: each row is the topic, a title and abstract, and the answer, keep or skip with a line why. Where you overrode the model, a second set holds pairs (your decision chosen, the model's rejected) for Prefer. Split it, then train a small model on it: a point of view, which screens new searches here, or anywhere through a package's research.js.

### Split
`data.papers.split.run`

split it

### Open Train
`data.papers.train`

open Train with it

## Drafts: a model writes many rows, you read them later

### Heading
`data.drafts.title`

drafts · a model writes many rows at once, you read each one

### What drafts are
`data.drafts.intro`

A model reads your material a passage at a time and writes rows from it, ten to a call, into drafts.jsonl. Nothing goes into the set until you read a draft: keep it as it is, edit it and keep it, or reject it. Leave it running, and read them when it's done.

### Drafts of dream readings
`data.drafts.dream`

These rows are the readings {by} wrote in workspace/{folder}: each is the question dream interpret asked and {by}'s answer. Read each one and keep or reject it. When more combinations are read, make their rows the same way.

### Make dream rows
`data.drafts.dreamRun`

make rows

### Write from
`data.drafts.from`

write from

### Write from, nothing chosen
`data.drafts.from.none`

choose the material

### Upload a text
`data.drafts.upload`

or upload a .txt or .md

### Uploading
`data.drafts.uploading`

uploading {file}…

### Upload failed
`data.drafts.uploadFailed`

the upload didn't go through: {error}

### Fields
`data.drafts.fields`

fields, for a reader (optional)

### Fields, example
`data.drafts.fields.example`

sender,work,ask,deadline

### Fields, what they do
`data.drafts.fields.note`

With fields, each draft is a made-up text and those fields as JSON, for a reader model. Without, each draft is a question about a passage and its answer.

### How many
`data.drafts.count`

rows

### The model that writes
`data.drafts.model`

writer

### The run button, for a screen reader
`data.drafts.run`

draft rows

### Draft
`data.draft` flag

Runs the writer model on your material in the helper, not in the page, so you can leave the tab while it works. Every draft is marked unreviewed in the set's drafts.jsonl. Keeping one is a `data append`, rejecting one a `data reject`: both show in the terminal.

### The tally
`data.drafts.tally`

{kept} kept · {rejected} rejected · {unreviewed} to read

### Text
`data.drafts.text`

text

### Answer
`data.drafts.answer`

answer

### Answer, not JSON
`data.drafts.notJson`

the answer has to be JSON with the fields, like the draft's

### Keep
`data.drafts.keep`

keep

### Reject
`data.drafts.reject`

reject

### Show more
`data.drafts.more`

show {n} more

### Where a draft came from
`data.drafts.source`

draft {id} · by {model} · from {from}
