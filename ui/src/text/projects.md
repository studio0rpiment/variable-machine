# The projects tab

Every word on the projects tab, from the top of the page to the bottom: the heading, then one card for each project, each with its steps in order. Edit the words here: `npm run dev` rebuilds the page when you save, and you see the change when you reload it. `npm run build` does the same once.

Each entry is:

- a `###` line with its **title**, to find it by. On a flag (a pop-up that explains a control), the title is shown: it is the bold words at the top of the flag;
- on the next line, its **name** in backticks, which ties it to its place on the page. Don't change the name. A flag says so after its name: `panel.projects` flag;
- then its **text**, one paragraph (line breaks inside it become spaces).

In the text:

- a word in braces, like `{tab}`, is filled in by the page: a number, a name, a command. Keep the braces and the word inside them as they are; move them around the sentence as you like;
- `code`, *italic* and **bold** are shown as such (backticks, one star, two stars);
- commands, model names, file paths and numbers the page works out are not here: they come from the code.

The build checks this file against the page, and stops with a message naming the entry if a name is missing, unused or misspelt, or a placeholder doesn't match. The `##` sections are only for finding your way; they are not shown.

## The tab's name, in the top bar

### Projects
`panel.projects` flag

Finished work you make by putting parts of Variable Machine together: a model that answers questions from a table, a gesture controller for your patch, a cut-out tool, a character's voice. Each card lists the steps in order; each step opens the tab that does it, shows its command, and is marked done when your workspace has what that step makes.

### The tab, for a screen reader
`projects.label`

projects

## The top of the tab

### Heading
`projects.title`

projects · finished work, made by putting the tabs together

### What a project is
`projects.intro`

A project is a piece of finished work you make by putting existing parts together. Each card says what it does and what you end up with, then its steps in order. A step opens the tab that does it and shows the command it runs; press the command to run it from here. A step is marked done when your workspace has what it makes. A step marked *soon* isn't built yet.

## A project's card

### What it does
`projects.card.does`

what it does

### What you end up with
`projects.card.get`

you end up with

### What it can't do
`projects.card.limits`

what it can't do

### The steps, for a screen reader
`projects.card.steps`

steps

## A step

### A step that is done
`projects.step.done`

done

### A step not done yet
`projects.step.todo`

not done

### A step not built yet
`projects.step.soon`

soon

### A second way to do the step above
`projects.step.or`

or

### The link to the step's tab
`projects.step.open`

open {tab}

### A step done in the page, with no command
`projects.step.inPage`

done on the {tab} tab, in the page: no command

### A drafting step's count
`projects.step.kept`

{kept} of {target} rows kept · {unreviewed} drafts to read

### What the run button says to a screen reader
`projects.step.run`

run this step

## The guide bar

A step on a card opens its tab with this bar above it: the project is being followed. It stays on every tab until it is closed. On the tab, a walkthrough points at one control at a time.

### The bar, for a screen reader
`projects.guide.label`

the project you are following

### Which step
`projects.guide.step`

step {n} of {of}

### On a tab the step doesn't use
`projects.guide.elsewhere`

This tab isn't part of step {n}; the step is on the {tab} tab.

### The way back to the step's tab
`projects.guide.backToStep`

back to step {n} →

### Back to the card
`projects.guide.card`

← back to the card

### Next step
`projects.guide.next`

next step →

### The last step's way out
`projects.guide.finished`

that's the last step: back to the card →

### Close
`projects.guide.close`

stop following this project

### A step with no walkthrough
`projects.guide.run`

Its command: press it to run it here, or type it in the terminal, with your own words in place of anything in angle brackets.

### A note whose control isn't in view
`projects.guide.lookFor`

Look for it on the tab:

### A note's place in the walkthrough
`projects.guide.note`

{n} of {of}

### A note's next
`projects.guide.noteNext`

next note ›

### Skip the walkthrough
`projects.guide.skip`

skip the walkthrough

### Show the walkthrough again
`projects.guide.again`

show the walkthrough again

## Ask a table

### Name
`projects.ask.title`

ask a table

### What it does
`projects.ask.does`

Answers questions about a table of facts in plain words. A small model turns the question into a query, and the answer is counted from the table, so it is always what the table says.

### What you end up with
`projects.ask.get`

a package: the model, the table, ask.js and a one-page demo, for a web page, Node, or TouchDesigner and Max over OSC

### Step: the table
`projects.ask.table`

bring in a table of facts

### Step: the training set
`projects.ask.set`

make a training set from it, with one button

### Step: train
`projects.ask.train`

train a small model on it

### Step: export
`projects.ask.export`

export it into Ollama

### Step: check
`projects.ask.check`

check how often its queries give the right answer

### Step: package
`projects.ask.package`

package it

## Gesture controller

### Name
`projects.gesture.title`

gesture controller

### What it does
`projects.gesture.does`

Names the gestures you make at the camera, and sends each name as OSC to TouchDesigner, Max or Pure Data.

### What you end up with
`projects.gesture.get`

a gesture model trained on your own movements, and a patch that listens to it

### Step: tracker
`projects.gesture.tracker`

get the hand tracker

### Step: set
`projects.gesture.set`

make a gesture set

### Step: record
`projects.gesture.record`

record two or more gestures, five examples of each

### Step: record, its check
`projects.gesture.check`

{counts} · done when two gestures have 5 examples or more each

### Step: record, nothing recorded
`projects.gesture.none`

no examples yet

### Step: train
`projects.gesture.train`

train the gesture model

### Step: send
`projects.gesture.send`

send what it sees as OSC

## Cut-out tool

### Name
`projects.cutout.title`

cut-out tool

### What it does
`projects.cutout.does`

Cuts the main thing in a photo out of its background, with a ready-made model that runs in the page.

### What you end up with
`projects.cutout.get`

PNGs with a transparent background, each with a record of which photo and model made it

### Step: tool
`projects.cutout.tool`

get the cut-out model

### Step: photos
`projects.cutout.photos`

bring in photos

### Step: cut
`projects.cutout.cut`

cut one out

## A character's voice

### Name
`projects.voice.title`

a character's voice

### What it does
`projects.voice.does`

A model that answers in one character's voice: by standing instructions in a Modelfile, or by training it on someone's writing.

### What you end up with
`projects.voice.get`

a model of your own in Ollama that speaks as the character

### Step: Modelfile
`projects.voice.modelfile`

describe the voice in a Modelfile and make the variant

### Step: writing
`projects.voice.writing`

bring in their writing: a book, or a text file

### Step: rows
`projects.voice.rows`

have a model draft rows from its passages, then keep, edit or reject each draft

### Step: train
`projects.voice.train`

train on the rows

### Step: export
`projects.voice.export`

export it, and talk to it in Chat

## Research bot

### Name
`projects.research.title`

research bot

### What it does
`projects.research.does`

Finds papers, articles and Substack posts on a topic. Search code finds real items; the model only writes the searches, judges what is relevant and summarises. It never supplies a citation.

### What you end up with
`projects.research.get`

a reading list with why each item is relevant, a BibTeX file, a library of everything seen so a rerun shows only what's new, and a relevance judge trained on your own decisions

### What it can't do
`projects.research.limits`

It reads abstracts, not paywalled full text. There is no official Substack search: a Substack or a blog comes in by its feed address (name.substack.com/feed).

### Step: search
`projects.research.search`

search for papers and articles on a topic

### Step: screen
`projects.research.screen`

screen them: keep or skip, with a reason; change any you disagree with

### Step: reading list
`projects.research.list`

make the reading list and BibTeX

### Step: judge set
`projects.research.judge`

turn your decisions into a training set

### Step: train judge
`projects.research.trainJudge`

train a relevance judge on it

### Step: export
`projects.research.export`

export the judge into Ollama

### Step: package
`projects.research.package`

package it with research.js, which runs the whole loop

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


## Project mode

A card with a schematic (the gesture controller, so far) can be followed as a project: the tabs go, and the schematic of that project alone is the way round it. Its input, its steps, the decisions a student makes and its output; under it, only the parts of the tab the open step uses, then the simulation, which follows one example from the camera to the OSC message.

### Start it, on the card
`projects.mode.start`

follow it as a project →

### Start it, what it does
`projects.mode.about`

Shows only what this project uses, as a schematic. The rest of Variable Machine is one click away.

### The top line, for a screen reader
`projects.mode.label`

project mode

### The top line: the project
`projects.mode.project`

project · {project}

### The open step, over its parts
`projects.mode.open`

step {n} · {name}

### Leave project mode
`projects.mode.leave`

all of Variable Machine →

### Leave project mode: what it does
`projects.mode.leave.about`

Every tab comes back; the guide bar keeps your step.

### The folded terminal: open it
`projects.mode.terminal.open`

open the terminal ▴

### The folded terminal: fold it again
`projects.mode.terminal.fold`

fold the terminal ▾

### The folded terminal, before any command
`projects.mode.terminal.none`

each command shows here as it runs

## Project mode: the schematic

### The schematic, for a screen reader
`projects.schematic.label`

the schematic of the {project}: its input, its steps, its decisions and its output

### Column: input
`projects.schematic.input`

input

### Column: steps
`projects.schematic.steps`

steps

### Column: output
`projects.schematic.output`

output

### The input
`projects.schematic.camera`

the camera

### The input, under it
`projects.schematic.cameraAbout`

points, never video

### The output
`projects.schematic.patch`

your patch

### The output, under it
`projects.schematic.patchAbout`

listens for OSC

### Box 1
`projects.schematic.box1`

tracker

### Box 2
`projects.schematic.box2`

set

### Box 3
`projects.schematic.box3`

record

### Box 4
`projects.schematic.box4`

train

### Box 5
`projects.schematic.box5`

send

### A box's state: the next to do
`projects.schematic.now`

now

### A box's state: after the next
`projects.schematic.waiting`

waiting

### A box's state: gone round
`projects.schematic.skipped`

skipped

### Hands
`projects.schematic.hands`

hands

### A body
`projects.schematic.body`

a body

### Box 1, under it
`projects.schematic.tracker`

follows {what}

### Box 2, under it, before the set is made
`projects.schematic.newSet`

a new set

### Box 3, under it, with the example set
`projects.schematic.recordedAlready`

already recorded

### Box 4, under it, once trained
`projects.schematic.trained`

{correct} of {heldOut} named right

### Box 4, under it, before
`projects.schematic.untrained`

not trained yet

### Box 5, under it, once sent
`projects.schematic.sent`

sending as OSC

### Box 5, under it, before
`projects.schematic.port`

not sent yet

### The way round step 3
`projects.schematic.skip`

its gestures come recorded

### The key, line 1, beside a diamond
`projects.schematic.key1`

a decision: it changes

### The key, line 2
`projects.schematic.key2`

the steps after it

### The key, line 3
`projects.schematic.key3`

click a box: open its step

## Project mode: the decisions

### What it follows
`projects.decision.follows`

what it follows

### What it follows, once the set is made
`projects.decision.fixed`

(the set's, now it is made)

### Whose examples
`projects.decision.whose`

whose examples

### Whose examples: the example set
`projects.decision.example`

the example set

### Whose examples: copying the example set
`projects.decision.copying`

copying…

### Whose examples: your own
`projects.decision.own`

your own

### The gesture names
`projects.decision.names`

the gesture names

### The gesture names, before any
`projects.decision.namesNone`

you name them as you record

### Recorded from
`projects.decision.source`

recorded from

### Recorded from: the camera
`projects.decision.camera`

the camera

### Recorded from: a photo
`projects.decision.photo`

a photo

## Project mode: the simulation

### The simulation, for a screen reader
`projects.sim.label`

the simulation: one example, from the camera to the OSC message

### Its title
`projects.sim.title`

follow one example

### Before training: what it follows
`projects.sim.before`

what will happen once it is trained, with a made-up example

### After training: what it follows
`projects.sim.after`

what happened to example {nth} of {label}, one of {aside} set aside when it was trained

### The set, before it has a name
`projects.sim.yourSet`

your-set

### A gesture, before any has a name
`projects.sim.aName`

a-gesture

### Station 1
`projects.sim.points`

the points

### Station 2
`projects.sim.stored`

the stored example

### Station 3
`projects.sim.vote`

the neighbours vote

### Station 4
`projects.sim.sent`

the name sent

### Station 1, before: hands
`projects.sim.points.hands`

the tracker finds 21 points on each hand in the picture

### Station 1: a body
`projects.sim.points.body`

the tracker finds 33 points on the body

### Station 1, after: one hand
`projects.sim.points.one`

21 points, on one hand

### Station 1, after: two hands
`projects.sim.points.two`

42 points, on two hands

### Station 2, before
`projects.sim.stored.will`

{n} numbers: the shape, not where it is in the picture

### Station 2, after
`projects.sim.stored.real`

{n} numbers: … {first} …

### Station 3, before
`projects.sim.vote.will`

the {k} stored examples nearest to it each vote for their gesture's name

### Station 3, after
`projects.sim.vote.real`

{votes}, of the {k} nearest

### Step
`projects.sim.step`

step ›

### Again
`projects.sim.again`

from the start

### Play
`projects.sim.play`

play

### Pause
`projects.sim.pause`

pause

### Another example
`projects.sim.another`

another example

### Under way
`projects.sim.underWay`

press step › to go on to the next station

### The result, before training
`projects.sim.before.result`

Nothing is named until step 4 trains the model: until then there are no stored examples to vote.

### The result, while the model is read
`projects.sim.reading`

reading the trained model…

### The result: named right
`projects.sim.after.right`

Named {got}, the most votes of the {k} nearest: right. {right} of {of} set-aside examples were named right.

### The result: named wrong
`projects.sim.after.wrong`

Named {got}, but it was {label}: record more examples of each, or make the gestures more different. {right} of {of} set-aside examples were named right.
