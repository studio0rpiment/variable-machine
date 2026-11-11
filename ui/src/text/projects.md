# The projects tab

Every word on the projects tab, from the top of the page to the bottom: the heading, then one card for each project, each with its steps in order. Edit the words here: `npm run dev` rebuilds the page when you save, and you see the change when you reload it. `npm run build` does the same once.

Each entry is:

- a `###` line with its **title**, to find it by. On a flag (a pop-up that explains a control), the title is shown: it is the bold words at the top of the flag;
- on the next line, its **name** in backticks, which ties it to its place on the page. Don't change the name. A flag says so after its name: `projects.steps` flag;
- then its **text**, one paragraph (line breaks inside it become spaces).

In the text:

- a word in braces, like `{tab}`, is filled in by the page: a number, a name, a command. Keep the braces and the word inside them as they are; move them around the sentence as you like;
- `code`, *italic* and **bold** are shown as such (backticks, one star, two stars);
- commands, model names, file paths and numbers the page works out are not here: they come from the code.

The build checks this file against the page, and stops with a message naming the entry if a name is missing, unused or misspelt, or a placeholder doesn't match. The `##` sections are only for finding your way; they are not shown.

## The tab's name, in the top bar

### Projects
`panel.projects` flag

Finished work you make by putting parts of Variable Machine together: a classifier that sorts pictures by mood, a model that answers questions from a table, a gesture controller for your patch, a cut-out tool, a character's voice. Each card lists the steps in order; each step opens the tab that does it, shows its command, and is marked done when your workspace has what that step makes.

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

### Steps
`projects.steps` flag

The steps in order. Each says which tab does it and shows its command: press the command to run it here, exactly as that tab would (it shows in the terminal below), or open the tab to change it first. A command with a part in angle brackets, like <table>, needs something you haven't made yet: open the tab to make it. Done means your workspace has what the step makes. A step marked "or" starts a second way to the same work, in place of the steps above it.

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

### What the run button says to a screen reader
`projects.step.run`

run this step

## Latent image

### Name
`projects.latent.title`

latent image

### What it does
`projects.latent.does`

Makes the latent image of what a person saves: screenshots of their last 15 Instagram stories, reels or saved posts, cut down to the pictures in them. The image is the picture the set holds without any one of them showing it, its "subconscious" picture. A large picture encoder measures every picture; the set's centre is fitted to those measures; a decoder turns the centre back into a picture. Then each picture is measured against it: how near it is, and what it brings that the rest lack. Each result is set beside the psychology it is like: Galton's composites and Freud's condensation, Posner and Keele's prototypes, Bartlett's schemas, Jung's collective unconscious and Fanon's answer to it.

### What you get
`projects.latent.get`

the latent image beside the pixel average (Galton's composite), and its axes once there are 30 pictures; a decoder trained on the set's look; a gallery page, with the psychology each part is like, and a JSON of every picture's distance and what it brings. All of it stays on this computer: zip refuses sets made from screenshots

### What it can't do
`projects.latent.limits`

It is a mean and a few directions of spread, measured in a model's numbers: not a memory or an unconscious in any literal sense. The texts frame it and don't change it. The model learned from pictures on the web, so the latent image is drawn in that model's terms. It needs 12 pictures at the least, 30 before it draws axes and about 100 before they hold still, and a Mac with 16 GB of memory. The psychology is a likeness, not a finding: the statistics do what the experiments found people do. The screenshots show other people's posts, so the work is a student project only. Saved posts were chosen from what the app's recommender offered, so the set is the person's and the app's together.

### Step: get the model
`projects.latent.model`

get the picture encoder and decoder (Kandinsky 2.2, 9 GB)

### Step: the screenshots
`projects.latent.screenshots`

upload screenshots of your last 15 Instagram stories, reels or saved posts into a new image set (one post a screenshot, or screenshots of the Saved grid)

### Step: a public-domain set instead
`projects.latent.pictures`

to try the card first: a public-domain body of work (then crop nothing, and make it from images/hiroshige)

### Step: crop the screenshots
`projects.latent.crop`

cut each screenshot down to its picture, so the app's header, buttons and captions don't become part of the latent image (add --grid for screenshots of the Saved grid). Both sets are marked private

### Step: the texts
`projects.latent.texts`

bring in texts on dreams, memory and the unconscious, as framing: Freud and Jung, Zhuangzi's butterfly dream, the Korean novel Kuunmong (The Cloud Dream of the Nine), and Galton's composite portraits. They are read beside the latent image, not trained on. Their critics are in docs/latent-image-reading.md

### Step: make it
`projects.latent.make`

make the latent image and the pixel average (and the axes, from 30 pictures), and check the centre holds across halves of the set

### Step: train the decoder
`projects.latent.train`

train the decoder on the set, so the latent image is drawn in its own look (20 steps a picture, up to 800: about 8 minutes for 15 pictures)

### Step: measure it
`projects.latent.measure`

measure each picture against the latent image (or another set: another month's, another person's), with the psychology beside each part

### The check, on the make step
`projects.latent.checked`

{n} images · centre across halves {centre} ({centreSays}) · axis 1 across halves {axis} ({axisSays})

### When it holds
`projects.latent.stable`

stable

### When it doesn't
`projects.latent.unstable`

not yet stable

### The training, on the train step
`projects.latent.trainedIn`

{steps} steps in {minutes} min

### The link to the latent image
`projects.latent.see`

see the latent image

### The link to the gallery page
`projects.latent.open`

open the gallery

## Dream reading

### Name
`projects.dream.title`

dream reading · who, what, when, where

### What it does
`projects.dream.does`

An installation for a dream. A visitor thinks of a dream and is shown four pictures, one each for its who (誰), what (什麼), when (何時) and where (何地). They choose the one most like their dream. The installation answers from the Zhougong jiemeng (周公解夢), the Chinese folk dream book: SigLIP finds the words of the book nearest the chosen picture, the book's lines for those words are looked up, and a language model glosses them and writes a short reading, in English and Chinese. Kandinsky 2.2 then draws a response picture: the chosen picture moved toward the picture, among the student's own, nearest what the book foretells.

### What you get
`projects.dream.get`

a room page that runs full screen (four pictures, a choice, a response); for each visitor, a response page with the chosen picture, the response picture, the book's lines with their glosses, the reading and other traditions' ways of reading the same dream; and a JSON of all of it

### What it can't do
`projects.dream.limits`

It doesn't interpret anyone's dream: it looks up a folk book of omens and has a small language model paraphrase it. The bridge from pictures to the book is a glossary of about 140 characters, so a picture is only ever read through those words; edit the glossary to change what the book can see. The glosses are the model's and can be wrong, so the page prints the Chinese lines beside them. The model doesn't read the dream itself; the visitor's own words are passed to it as context. A response takes a little over a minute (a third reading, a third drawing, a third loading the picture model), and Kandinsky needs a Mac with 16 GB of memory.

### Step: get the models
`projects.dream.models`

get the picture models: Kandinsky 2.2 (9 GB) draws, SigLIP (214 MB) matches pictures to words; and the language model that writes the reading (qwen3:4b, 2.5 GB, Apache 2.0)

### Step: the student's pictures
`projects.dream.pictures`

upload the student's pictures into four image sets, one for each of who, what, when and where (a few in each will do; 8 or more lets the room show a different picture to each visitor)

### Step: public-domain pictures instead
`projects.dream.museum`

to try the card first: four public-domain sets from the Art Institute of Chicago (CC0)

### Step: the texts
`projects.dream.texts`

bring in the dream book and the texts it is read beside: the Zhougong jiemeng in Chinese (Wikisource), the Liezi's chapter on dreams in Chinese and in Giles's English, Zhuangzi's butterfly dream, Freud, and the Korean novel Kuunmong. The full list, with Wang Fu, Chen Shiyuan, the Dunhuang dream books and temple practice in Taiwan, is in docs/dream-reading.md

### Step: make it
`projects.dream.make`

match every picture to the dream book: SigLIP picks each picture's three nearest glossary words. Add --drawn 2 to have Kandinsky draw two more pictures for each category from the centre of its pictures

### Step: choose
`projects.dream.choose`

a visitor's choice, by hand: the category and the picture (the room page does this when a visitor touches a picture)

### Step: respond
`projects.dream.respond`

the reading and the response picture for the last choice (about a minute)

### Step: open the room
`projects.dream.room`

open the room page full screen on the installation's screen: it shows four pictures, takes the visitor's choice, and shows the response

### What make found, on the make step
`projects.dream.made`

{n} pictures matched to the dream book

### The link to the room page
`projects.dream.open`

open the room

### The link to the last response
`projects.dream.see`

see the last response

## The dream room

### The room, for a screen reader
`projects.dream.roomLabel`

dream reading room

### What the room asks
`projects.dream.ask`

Think of a dream. Which of these is most like it?

### The words box
`projects.dream.words`

a few words of your dream (you can leave this empty)

### While it answers
`projects.dream.waiting`

reading the dream book…

### The button to start again
`projects.dream.again`

another dream

### When the room has nothing to show
`projects.dream.none`

no dream installation called {name}: make it on the projects tab first

### Under the reading
`projects.dream.note`

From the Zhougong jiemeng (周公解夢), a Chinese folk dream book, read by a small language model. It is what the book says, not what will happen.

## Image moods

### Name
`projects.mood.title`

image moods

### What it does
`projects.mood.does`

Learns what a picture conveys, its mood (calm, lively, tense or sombre), from pictures people have rated, and from texts on colour and perception: Goethe, William James, Wikipedia. Then it sorts a gallery: each picture gets a mood, how sure it is, and a one-line reason.

### What you end up with
`projects.mood.get`

a mood classifier (SigLIP, a picture encoder, with a small classifier on top), its score on pictures set aside, and a gallery page with a CSV and JSON of every picture's mood

### What it can't do
`projects.mood.limits`

It judges what a picture conveys by its look: colour, light, what is in it. It can't tell what anyone in a picture feels or is like, and it isn't trained to: reading feelings from faces is unreliable, and the EU AI Act bans it in workplaces and schools. The training pictures have no people in them. The reason's passage is found by nearness, not written: it isn't why the classifier chose.

### Step: encoder
`projects.mood.encoder`

get the picture encoder

### Step: pictures
`projects.mood.pictures`

bring in pictures rated for their mood, as a picture dataset

### Step: texts
`projects.mood.texts`

bring in texts on colour and perception

### Step: split
`projects.mood.split`

set pictures aside for checking

### Step: describe
`projects.mood.describe`

pick each mood's sentences from the texts, into labels.md; read it, and cut what doesn't fit

### Step: train
`projects.mood.train`

train the classifier, and check it on the pictures set aside

### Step: gallery pictures
`projects.mood.gallery`

bring in a gallery to sort: public-domain artworks, or your own photos

### Step: sort
`projects.mood.sort`

sort the gallery: each picture's mood, how sure, and why

### Step: package
`projects.mood.package`

package it with classify.py, to sort pictures in another project

### The check
`projects.mood.checked`

on {n} pictures set aside: {right}% right (balanced F1 {f1}); the texts alone {texts}%, the labels alone {labels}%, always "{common}" {commonest}%

### The gallery
`projects.mood.open`

open the gallery

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

have a model write rows from its passages, and keep the good ones

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

### Step: rows
`projects.studio.rows`

have a model write made-up examples from the studio's notes, each a text and its fields as JSON; keep, edit or reject each one

### Step: corrections
`projects.studio.corrections`

add the lead's corrections from the studio as rows, each marked with where it came from

### Step: split
`projects.studio.split`

set rows aside for checking, and check every row is valid

### Step: train
`projects.studio.train`

train the reader on the rows

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
