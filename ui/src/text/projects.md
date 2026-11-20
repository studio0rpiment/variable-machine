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

A project is a piece of finished work you make by putting existing parts together, one box each. A box marked walkthrough opens the project, step by step, with only the parts it uses. Any other box opens here, showing what you end up with, then its steps in order. A step opens the tab that does it and shows the command it runs; press the command to run it from here. A step is marked done when your workspace has what it makes. A step marked *soon* isn't built yet.

## A project's card

### What you end up with
`projects.card.get`

you end up with

### What it can't do
`projects.card.limits`

what it can't do

### The steps, for a screen reader
`projects.card.steps`

steps

### Badge on a project with a walkthrough
`projects.card.walkthrough`

walkthrough

### How far a project has got, on its box
`projects.card.progress`

{done} of {of} steps done

### On a box without a walkthrough, closed
`projects.card.open`

show its steps +

### On a box without a walkthrough, open
`projects.card.close`

hide its steps −

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

An installation for a dream. The deck is sixteen cards: four for each quality of a dream, who (誰), what (什麼), when (何時) and where (何地). A visitor chooses one card of each, a combination: there are 256. Each combination is interpreted from the guide texts the artist chose (the Zhougong jiemeng, Wang Fu, the Liezi, her own writing, or others she uploads): a language model reads the passages nearest the four cards and writes the interpretation, in English and Chinese. A diffusion model, Kandinsky 2.2, draws variations of the combination. All 256 can be made before the show, read and redone; any not made yet is made in the room.

### What you get
`projects.dream.get`

a deck of sixteen cards, each matched to the words of the Zhougong jiemeng; an interpretation and variations for every combination, each with a page showing the passages it was written from; and a room page that runs full screen: four rows of cards, a visitor's choice, the interpretation and the pictures

### What it can't do
`projects.dream.limits`

It doesn't interpret anyone's dream: a small language model paraphrases the passages of the guide texts nearest the four cards, and the passages are found by how near their words are to the cards' words, not by understanding. The Zhougong jiemeng is reached through a glossary of about 140 characters, so a card is read only through those words. The glosses and readings can be wrong; each page prints the passages beside them. Drawing all 256 combinations takes about 3 hours at two variations each, and Kandinsky needs a Mac with 16 GB of memory.

### The decisions, for a screen reader
`projects.dream.decisions`

the dream reading's decisions

### Decision: the cards
`projects.dream.decision.cards`

where the cards come from

### Her own pictures
`projects.dream.cards.own`

her own pictures

### What her own pictures mean
`projects.dream.cards.own.about`

Four image sets, one for each quality, uploaded under step 2. The first four pictures of each set are its cards.

### Choosing a set, empty
`projects.dream.cards.pick`

choose an image set

### Her own pictures, the note
`projects.dream.cards.own.note`

Upload under step 2, or choose sets that are already here. A set needs 2 pictures at the least; 4 make the deck.

### A demo deck
`projects.dream.cards.demo`

a demo deck, drawn from prompts

### What the demo deck means
`projects.dream.cards.demo.about`

Sixteen cards drawn by Kandinsky 2.2 from prompts written for the demo (an old woman in a dark blue robe, a wooden boat, a full moon, a temple courtyard …), to try the card before her pictures are in. It needs Kandinsky's prior, 6.9 GB more; about 6 minutes.

### Decision: the guide texts
`projects.dream.decision.texts`

the texts to interpret with

### A text not brought in yet
`projects.dream.text.notIn`

(brought in at step 4)

### Her own text
`projects.dream.text.own`

her own text, uploaded

### The guide texts, the note
`projects.dream.texts.note`

Upload your own writing as .txt or .md under step 4, and it is listed here. The sources and their access, with the Taiwanese and Korean ones not brought in, are in docs/dream-reading.md.

### The Zhougong jiemeng
`projects.dream.text.zhougong`

周公解夢 Zhougong jiemeng

### The Zhougong jiemeng, about
`projects.dream.text.zhougong.about`

The folk dream book: 988 lines, each a dream and its omen. Looked up by each card's glossary words. Public domain, Wikisource.

### Wang Fu
`projects.dream.text.wangfu`

王符 Wang Fu, 夢列

### Wang Fu, about
`projects.dream.text.wangfu.about`

The ten kinds of dream (2nd century), in Chinese. Public domain, Wikisource.

### The Liezi in Chinese
`projects.dream.text.lieziZh`

列子 Liezi, 周穆王

### The Liezi in Chinese, about
`projects.dream.text.lieziZh.about`

The six kinds of dream, and the servant who dreams he is a lord, in Chinese. Public domain, Wikisource.

### The Liezi in English
`projects.dream.text.liezi`

the Liezi, "Dreams" (Giles)

### The Liezi in English, about
`projects.dream.text.liezi.about`

Lionel Giles's English (1912), abridged. Public domain, Wikisource.

### Zhuangzi
`projects.dream.text.zhuangzi`

Zhuangzi (Giles)

### Zhuangzi, about
`projects.dream.text.zhuangzi.about`

The butterfly dream, in Herbert Giles's English (1889). Public domain, Gutenberg 59709.

### Freud
`projects.dream.text.freud`

Freud, The Interpretation of Dreams

### Freud, about
`projects.dream.text.freud.about`

The dream as a disguised wish (Brill, 1913). Most dream researchers since the 1950s reject it. Public domain, Gutenberg 66048.

### Jung
`projects.dream.text.jung`

Jung, Psychology of the Unconscious

### Jung, about
`projects.dream.text.jung.about`

Dream and myth images as one energy (Hinkle, 1916); read with Fanon's and Dalal's critiques. Public domain in the US, Gutenberg 65903.

### Kuunmong
`projects.dream.text.kuunmong`

Kuunmong, The Cloud Dream of the Nine

### Kuunmong, about
`projects.dream.text.kuunmong.about`

A Korean novel of a whole life dreamt and woken from (Gale, 1922; read by OCR). Public domain, Internet Archive.

### Dream incubation
`projects.dream.text.incubation`

Wikipedia, "Dream incubation"

### Dream incubation, about
`projects.dream.text.incubation.about`

Sleeping in a temple to receive a dream. CC BY-SA 4.0.

### Decision: the models
`projects.dream.decision.models`

which models read

### The writer, what it does
`projects.dream.writer.does`

writes each interpretation from the passages, in English and Chinese

### No writer
`projects.dream.writer.none`

no language model: the passages alone

### The embedding model, what it does
`projects.dream.embed.does`

finds the passages of the guide texts nearest a combination's four cards

### The models, the note
`projects.dream.models.note`

This Mac has {memory} GB of memory. Kandinsky (9 GB on disk) and SigLIP (214 MB) are fixed: Kandinsky draws, SigLIP matches cards to the dream book's words.

### Decision: how variations are drawn
`projects.dream.decision.draw`

how the variations are drawn

### From the cards
`projects.dream.draw.cards`

the four cards, mixed

### From the cards, about
`projects.dream.draw.cards.about`

Kandinsky's numbers for the four cards, mixed; each variation is led by a different quality (40%), the other three share the rest. Nothing more to download.

### With the interpretation
`projects.dream.draw.prior`

the cards and the interpretation

### With the interpretation, about
`projects.dream.draw.prior.about`

The same mix, with the interpretation's picture sentence turned into Kandinsky's numbers by its prior (40%), so the reading shapes the picture. Needs Kandinsky's prior, 6.9 GB.

### Decision: how many variations
`projects.dream.decision.variations`

how many variations for each combination

### A number of variations
`projects.dream.variations.n`

{n}

### How long they take
`projects.dream.variations.about`

about {minutes} minutes for all 256

### Decision: when
`projects.dream.decision.ahead`

when combinations are made

### All ahead
`projects.dream.ahead.all`

all 256 before the show

### All ahead, about
`projects.dream.ahead.all.about`

Interpret and draw every combination (about 2 hours to interpret, and the drawing time above), read them, redo any you don't keep. The room shows them at once; any missing is made there.

### Live
`projects.dream.ahead.live`

in the room only

### Live, about
`projects.dream.ahead.live.about`

Nothing is made ahead: each visitor waits about a minute for their combination, which is then kept for the next visitor who chooses it.

### Decision: the visitor's words
`projects.dream.decision.words`

the visitor's own words

### Keep them
`projects.dream.words.keep`

kept beside the response

### Keep them, about
`projects.dream.words.keep.about`

The visitor may type a few words of their dream; they are kept with the response, and the interpretation made ahead is shown at once.

### Read them
`projects.dream.words.read`

read into the interpretation

### Read them, about
`projects.dream.words.read.about`

When a visitor types words, a new interpretation is written with them, live: about 30 seconds more.

### The schematic: models
`projects.dream.box.headModels`

models

### The schematic: siglip's role
`projects.dream.box.roleSiglip`

matches cards to words

### The schematic: the embedding model's role
`projects.dream.box.roleEmbed`

finds passages

### The schematic: the writer's role
`projects.dream.box.roleWriter`

writes the interpretation

### The schematic: Kandinsky's role
`projects.dream.box.roleKandinsky`

draws the variations

### The schematic: the prior's role
`projects.dream.box.rolePrior`

draws from words

### The schematic: the cards box
`projects.dream.box.cards`

cards

### The schematic: under the cards
`projects.dream.box.capCards`

4 for each quality

### The schematic: the deck box
`projects.dream.box.deck`

deck

### The schematic: under the deck
`projects.dream.box.capDeck`

16 cards, 256 combinations

### The schematic: the texts box
`projects.dream.box.texts`

guide texts

### The schematic: under the texts
`projects.dream.box.capTexts`

books, and her own writing

### The schematic: the guide box
`projects.dream.box.guide`

passages

### The schematic: under the guide
`projects.dream.box.capGuide`

cut and measured

### The schematic: the interpret box
`projects.dream.box.interpret`

interpret

### The schematic: under interpret
`projects.dream.box.capInterpret`

a combination's reading

### The schematic: the draw box
`projects.dream.box.draw`

variations

### The schematic: under the variations
`projects.dream.box.capDraw`

drawn for a combination

### The schematic: the room box
`projects.dream.box.room`

the room

### The schematic: under the room
`projects.dream.box.capRoom`

the visitor chooses

### The schematic: the models lane
`projects.dream.box.laneModels`

MODELS · each a choice

### The schematic: the cards lane
`projects.dream.box.laneCards`

THE CARDS

### The schematic: the texts lane
`projects.dream.box.laneTexts`

THE GUIDE TEXTS

### Step: the models
`projects.dream.mode.models`

get the models

### The models, after
`projects.dream.mode.modelsResult`

{models}

### Step: a demo deck
`projects.dream.mode.demo`

draw the demo deck

### Step: her own pictures
`projects.dream.mode.own`

upload her pictures, four for each quality

### Step: the deck
`projects.dream.mode.deck`

make the deck: each card matched to the dream book's words

### The deck, after
`projects.dream.mode.deckResult`

{n} combinations

### Step: the texts
`projects.dream.mode.texts`

bring in the guide texts, and upload her own

### The texts, chosen
`projects.dream.mode.textsResult`

{texts}

### Step: the passages
`projects.dream.mode.guide`

cut the guide texts into passages, and measure them

### The passages, after
`projects.dream.mode.guideResult`

guide texts: {texts}

### Step: one combination
`projects.dream.mode.one`

interpret and draw one combination, and read it

### Step: all of them
`projects.dream.mode.all`

interpret and draw all of them, before the show

### All of them, so far
`projects.dream.mode.allResult`

{interpreted} of {total} interpreted · {drawn} drawn

### Step: the room
`projects.dream.mode.room`

try a visitor, then open the room

### Step view: a set's name
`projects.dream.view.setName`

the {q} set's name

### Step view: uploading
`projects.dream.view.uploading`

uploading…

### Step view: upload pictures
`projects.dream.view.upload`

upload pictures into images/{set}

### Step view: no deck yet
`projects.dream.view.noDeck`

no deck yet: run the deck step

### Step view: the texts
`projects.dream.view.textsAbout`

The guide texts chosen above. Upload your own writing as .txt or .md; it is added to them.

### Step view: upload a text
`projects.dream.view.uploadText`

upload a text (.txt or .md)

### Step view: texts uploaded
`projects.dream.view.uploaded`

uploaded: {files}

### Step view: pick a combination
`projects.dream.view.pick`

choose a card in each row: combination {key}

### Step view: the picture sentence
`projects.dream.view.sentence`

picture sentence: {sentence}

### Step view: the passages
`projects.dream.view.passages`

the {n} passages it was written from, by {by}

### Step view: no model
`projects.dream.view.noModel`

no language model

### Step view: the page
`projects.dream.view.page`

open its page

### Step view: the room
`projects.dream.view.roomAbout`

Open the room on the installation's screen, then the browser's full-screen key. It uses the decisions above, as this browser keeps them.

### Step view: the last response
`projects.dream.view.last`

last response: {path}

### The link to the room page
`projects.dream.open`

open the room

## The dream room

### The room, for a screen reader
`projects.dream.roomLabel`

dream reading room

### What the room asks
`projects.dream.ask`

Think of a dream. Choose one card in each row: who, what, when, where.

### The words box
`projects.dream.words`

a few words of your dream (you can leave this empty)

### The button to read
`projects.dream.read`

read my dream

### Before every row has a card
`projects.dream.pickAll`

a card in each row

### While it answers
`projects.dream.waiting`

reading the texts…

### The button to start again
`projects.dream.again`

another dream

### When the room has nothing to show
`projects.dream.none`

no dream installation called {name}: make its deck on the projects tab first

### Under the reading
`projects.dream.note`

Read from the texts the artist chose, by a small language model. It is what they say, not what will happen.

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

a reading list with why each item is relevant, a BibTeX file, a library of everything seen so a rerun shows only what's new, and, if you train one, a point of view: a small model trained on your own decisions

### What it can't do
`projects.research.limits`

It reads abstracts, the archives' and newspapers' passages and the start of each patent; it reads a full text only when one is free to read or you add your own copy, and never through your library's proxy. US patents come in by number only: Google Patents forbids automated search. Searches are written in today's words, so old newspapers and gazettes are reached only where the words match. There is no official Substack search: a Substack or a blog comes in by its feed address (name.substack.com/feed).

### Step: search
`projects.research.search`

search for papers and articles on a topic

### Step: screen
`projects.research.screen`

screen them: keep or skip, with a reason; change any you disagree with

### Step: reading list
`projects.research.list`

make the reading list and BibTeX

### Step: the point of view's set
`projects.research.judge`

turn your decisions into a training set for a point of view

### Step: train the point of view
`projects.research.trainJudge`

train a point of view on it: a small model that judges relevance the way you do

### Step: export
`projects.research.export`

export the point of view into Ollama

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

· {project}

### The way back to the project boxes, in the top bar
`projects.mode.projects`

projects

### The way back, on pointing
`projects.mode.projects.about`

back to all the projects

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


## Project mode: a character's voice

The voice card followed as a project. Its schematic is the Start map's top band, with the route the decisions draw lit and numbered; under it, the decisions, each option with what it costs and what it changes.

## Project mode: the route's steps

### Step: the texts
`projects.voice.mode.texts`

bring in the texts the voice is drawn from: one or more books, or your own writing

### Step: the texts, before any is chosen
`projects.voice.mode.noTexts`

no text chosen yet: choose one or more under the texts, below

### Step: rows written by hand
`projects.voice.mode.corrections`

write rows by hand: a question, and the answer in the character's voice

### Step: rows, how many
`projects.voice.mode.rows`

{n} of {target} rows · then split them, so some are set aside to test with

### Step: export
`projects.voice.mode.export`

export it into Ollama, as a model of your own

### Step, the last of every route: the model made, in Chat
`projects.voice.mode.talk`

talk to it in Chat

### That step's result, before there is a model to talk to
`projects.voice.mode.noModel`

no model yet: the steps above make it

### Step: pick in Chat
`projects.voice.mode.pick`

in Chat, put two models side by side and pick the better answer, again and again

### Step: pairs
`projects.voice.mode.pairs`

turn the picks into pairs on the Data tab, then split them

### Step: pairs, how many
`projects.voice.mode.pairCount`

{n} of {target} pairs

### Step: prefer
`projects.voice.mode.prefer`

lean toward the chosen answers

### Step: a second voice
`projects.voice.mode.second`

train a second voice on the same base: its own text and rows

### Step: a second voice, how many
`projects.voice.mode.voices`

{n} voices on this base

### Step: merge
`projects.voice.mode.merge`

blend the two voices

### Step: the base, for a Modelfile
`projects.voice.mode.pull`

get the base into Ollama

### The route folded into a line, for a screen reader
`projects.voice.mode.line`

the route, step by step

### The button on the folded schematic, while it is zoomed in on the step
`projects.voice.mode.full`

full

### What that button does
`projects.voice.mode.fullTitle`

show the whole route

### The button on the folded schematic, while it shows the whole route
`projects.voice.mode.zoom`

zoom

### What that button does
`projects.voice.mode.zoomTitle`

zoom in on the step you are working on

### What the route ends in
`projects.voice.mode.out`

a model of your own, in Chat

### A step done on its tab, with no command
`projects.voice.mode.inTab`

this step has no command: it is done in the tab below

## Project mode: the decisions

### The decisions, for a screen reader
`projects.voice.decisions`

the decisions: each changes the route, or what you end up with

### Decision: approach
`projects.voice.decision.approach`

how the model changes

### Decision: base
`projects.voice.decision.base`

the base model

### Decision: where prefer starts
`projects.voice.decision.from`

prefer starts from

### Decision: the texts
`projects.voice.decision.texts`

the texts: choose one or more

### Decision: who writes the rows
`projects.voice.decision.rows`

who writes the rows

### Cost: time
`projects.voice.cost.time`

time

### Cost: disk
`projects.voice.cost.disk`

disk

### Cost: what it needs
`projects.voice.cost.needs`

needs

### Cost: what it changes
`projects.voice.cost.changes`

changes

### Approach: change with words
`projects.voice.approach.modelfile`

change with words

### Change with words: its tab
`projects.voice.approach.modelfile.tab`

Modelfile

### Change with words: time
`projects.voice.approach.modelfile.time`

about 5 minutes

### Change with words: disk
`projects.voice.approach.modelfile.disk`

a few KB: a variant shares its base's weights

### Change with words: needs
`projects.voice.approach.modelfile.needs`

a paragraph of instructions

### Change with words: changes
`projects.voice.approach.modelfile.changes`

The model is told how to sound before every answer; its numbers don't change. Quick to try and to undo.

### Approach: imitate
`projects.voice.approach.imitate`

imitate

### Imitate: its tab
`projects.voice.approach.imitate.tab`

Train (LoRA)

### Imitate: time
`projects.voice.approach.imitate.time`

about 30 minutes, most of it reading drafts

### Imitate: disk
`projects.voice.approach.imitate.disk`

about 0.7 GB for the base, and 0.7 GB more for the exported copy (360M)

### Imitate: needs
`projects.voice.approach.imitate.needs`

100 rows kept from the texts

### Imitate: changes
`projects.voice.approach.imitate.changes`

The numbers learn the writer's phrasing; what it knows stays the base's. A model of your own, to package or blend.

### Approach: lean toward better
`projects.voice.approach.prefer`

lean toward better

### Lean toward better: its tab
`projects.voice.approach.prefer.tab`

Prefer (DPO)

### Lean toward better: time
`projects.voice.approach.prefer.time`

about 20 minutes picking answers, then the run (not timed yet)

### Lean toward better: disk
`projects.voice.approach.prefer.disk`

as for imitate

### Lean toward better: needs
`projects.voice.approach.prefer.needs`

30 pairs or more, picked in Chat

### Lean toward better: changes
`projects.voice.approach.prefer.changes`

It leans toward the kind of answer you picked, such as shorter or more in character, without learning new phrasing. On a 40-pair set asking for short answers, answers it hadn't seen went from about 800 characters to about 180.

### Approach: blend two
`projects.voice.approach.blend`

blend two

### Blend two: its tab
`projects.voice.approach.blend.tab`

Merge

### Blend two: time
`projects.voice.approach.blend.time`

two imitate runs, then seconds for the blend

### Blend two: disk
`projects.voice.approach.blend.disk`

two adapters, and a blend twice the size of one

### Blend two: needs
`projects.voice.approach.blend.needs`

two voices trained on the same base

### Blend two: changes
`projects.voice.approach.blend.changes`

A voice between two writers: exactly (1 − t)·A + t·B, with t set on the Merge tab.

### Base: the 360M
`projects.voice.base.small`

0.7 GB download · about 0.8 GB to train · any Mac, 8 GB included · 200 steps in about 2½ minutes (M1 Pro)

### Base: the 1.7B
`projects.voice.base.large`

3.4 GB download · about 8 GB to train · slower, better results · this Mac has {memory} GB

### Base: too big for this Mac
`projects.voice.base.tooBig`

too big for this Mac's {memory} GB

### Base: in Ollama
`projects.voice.base.here`

{gb} GB, in Ollama

### Base: to pull
`projects.voice.base.pull`

about {gb} GB to pull

### Prefer from: the base
`projects.voice.from.base`

the base

### Prefer from: the base, what it means
`projects.voice.from.base.about`

it leans the base toward your picks

### Prefer from: your voice
`projects.voice.from.voice`

your trained voice

### Prefer from: your voice, what it means
`projects.voice.from.voice.about`

imitate first, then prefer on its exported copy: the route takes both

### Texts: none yet
`projects.voice.texts.none`

No texts in the workspace yet: step 1 brings one in.

### Texts: your own
`projects.voice.texts.yours`

your own writing, uploaded

### Texts: a book
`projects.voice.texts.book`

brought in from {source}

### Texts: more
`projects.voice.texts.more`

More texts: a book from Project Gutenberg, or a .txt of your own, on the Data tab (step 1). The rows are drafted from every text chosen.

### Rows: drafted
`projects.voice.rows.draft`

a model drafts them

### Rows: drafted, what it costs
`projects.voice.rows.draft.about`

qwen3:4b drafts 150 rows from each text, and you keep, edit or reject each: about 20 minutes of reading

### Rows: by hand
`projects.voice.rows.corrections`

you write them

### Rows: by hand, what it costs
`projects.voice.rows.corrections.about`

slower, and closest to the voice you mean: each row is yours

## Project mode: the research bot

The research bot's card followed as a project. Its schematic is the Start map opened up: the project opens on the Start map's top band, and in about a second PAPERS opens into its sources and the pipeline that reads them, and MODELS into one model per role. Under it, the decisions, in groups; options that are planned but not built show, and can't be chosen yet.

### Decisions, for a screen reader
`projects.research.decisions`

the research bot's decisions

### Not built yet
`projects.research.notBuilt`

not built yet

### Papers, opened: what the faint sources are
`projects.research.mode.soon`

faint: not chosen, or not built yet

### Group: what it finds
`projects.research.group.find`

what it finds: where it searches, and with what access

### Group: who reads it
`projects.research.group.read`

who reads it: a model for each role, and how much it reads

### Group: the point of view
`projects.research.group.view`

the point of view

### Decision: what you take away
`projects.research.decision.take`

what you take away

### Option: a reading list
`projects.research.take.list`

a reading list

### Option: a reading list, its tab
`projects.research.take.list.tab`

Data: papers and articles

### Option: a reading list, time
`projects.research.take.list.time`

not timed: the searches (they wait on the network), then the screener reading the closest items, a few seconds each

### Option: a reading list, disk
`projects.research.take.list.disk`

the models below, if they aren't here: about 3 GB as chosen first

### Option: a reading list, needs
`projects.research.take.list.needs`

a topic, and two to five papers or articles you already know are relevant

### Option: a reading list, changes
`projects.research.take.list.changes`

No model changes. Real items only, found by search code; why each was kept; BibTeX; a library, so a rerun shows only what's new.

### Option: a point of view
`projects.research.take.view`

a point of view

### Option: a point of view, its tabs
`projects.research.take.view.tab`

+ Train or Prefer, Adapters

### Option: a point of view, time
`projects.research.take.view.time`

the list, then training a small model on your decisions (not timed: a set this size trains in minutes on 360M)

### Option: a point of view, disk
`projects.research.take.view.disk`

+ about 0.7 GB for the base, + about 0.7 GB for the point of view in Ollama (360M)

### Option: a point of view, needs
`projects.research.take.view.needs`

at least 10 decisions of your own; 30 places where you overrode the screener, to train on those alone

### Option: a point of view, changes
`projects.research.take.view.changes`

A small model that judges relevance the way you do. It becomes the screener on the next search, here or, packaged, anywhere. For a class, the students' decisions can be pooled into one.

### Decision: which research
`projects.research.decision.folder`

which research

### Which research: a new one
`projects.research.folder.new`

a new one

### Which research: a new one, about
`projects.research.folder.newAbout`

a topic and its seeds, searched for the first time

### Which research: one here
`projects.research.folder.here`

in workspace/research: search it again, and only what's new comes in

### Decision: where it searches
`projects.research.decision.sources`

where it searches

### Source: scholarship
`projects.research.source.scholarship`

scholarship

### Source: scholarship, about
`projects.research.source.scholarship.about`

OpenAlex, Semantic Scholar and Crossref, in every field; arXiv; and the seeds' citations, both ways

### Source: patents
`projects.research.source.patents`

patents

### Source: patents, about
`projects.research.source.patents.about`

US patents, each fetched from Google Patents by its number, with the start of its text; the numbers come from the archives' and newspapers' pages, or from you (--patent). British and German ones need a key: not built yet

### Source: archives
`projects.research.source.archives`

archives

### Source: archives, about
`projects.research.source.archives.about`

the Internet Archive's full text: books, journals, trade press, the Patent Office's Official Gazette

### Source: newspapers
`projects.research.source.newspapers`

newspapers

### Source: newspapers, about
`projects.research.source.newspapers.about`

the Library of Congress: US newspapers, 1756–1963, searched word by word

### Source: Europeana
`projects.research.source.europeana`

Europeana

### Source: Europeana, about
`projects.research.source.europeana.about`

Europeana: books, newspapers and objects from European libraries and museums; needs a free key

### Source: feeds
`projects.research.source.feeds`

feeds

### Source: feeds, about
`projects.research.source.feeds.about`

a Substack or a blog, by its feed address (name.substack.com/feed)

### Sources combine
`projects.research.sources.combine`

Choose any: each is searched, and what they find goes into one library and one reading list. An item found in several places is one entry, with every place it was found.

### Decision: fields to pair
`projects.research.decision.fields`

fields to pair

### Field: the humanities
`projects.research.field.humanities`

the humanities

### Field: the humanities, about
`projects.research.field.humanities.about`

history, art, music, philosophy, media studies

### Field: the sciences
`projects.research.field.sciences`

the sciences

### Field: the sciences, about
`projects.research.field.sciences.about`

physics, acoustics, physiology, psychology

### Field: technology
`projects.research.field.technology`

technology

### Field: technology, about
`projects.research.field.technology.about`

engineering, computer science, inventions

### Fields, about
`projects.research.fields.about`

Searches are written for each field, and each gets its own share of what the screener reads. An item's field is the source's own label, never the model's; items with two or more are bridges.

### Decision: your library
`projects.research.decision.library`

your library

### Library: its proxy
`projects.research.library.proxy`

its proxy, for links

### Library: its proxy, about
`projects.research.library.proxy.about`

every link in the reading list opens through your library's proxy; you sign in yourself, in your browser

### Library: keys
`projects.research.library.keys`

keys you hold

### Library: keys, about
`projects.research.library.keys.about`

a key a source or a publisher gave you, kept in a file on this Mac, never in the workspace you share

### Library: your own copies
`projects.research.library.copies`

your own copies

### Library: your own copies, about
`projects.research.library.copies.about`

PDFs you downloaded through the library: the screener and summariser read their full text

### Library: what is never done
`projects.research.library.never`

Variable Machine never fetches through your library and never keeps a password: you sign in yourself, in your browser. Keys stay in a file in your Library on this Mac (papers keys), outside the workspace, so a zip never carries them.

### Decision: a model for each role
`projects.research.decision.models`

a model for each role

### Role: writer
`projects.research.role.writer`

writer

### Role: writer, what it does
`projects.research.role.writer.does`

writes the searches from the topic and the seeds

### Role: ranker
`projects.research.role.ranker`

ranker

### Role: ranker, what it does
`projects.research.role.ranker.does`

compares each item with the topic and the seeds, so the closest come first

### Role: screener
`projects.research.role.screener`

screener

### Role: screener, what it does
`projects.research.role.screener.does`

keep or skip, with a line why: a model's point of view, not a fact

### Role: summariser
`projects.research.role.summariser`

summariser

### Role: summariser, what it does
`projects.research.role.summariser.does`

claims from what you kept, each quoting the text it rests on, or left out

### Role: second screener
`projects.research.role.second`

second screener

### Role: second screener, what it does
`projects.research.role.second.does`

reads the same items as the first: where the two disagree, your decision settles it

### Models and memory
`projects.research.models.memory`

This Mac has {memory} GB. qwen3:4b is 2.5 GB and wants 16 GB or more; qwen3:1.7b is 1.4 GB, quicker and looser. A ! marks a model too large for this Mac.

### Decision: how many the screener reads
`projects.research.decision.top`

how many the screener reads

### How many: the number
`projects.research.top.n`

the closest {n}

### How many: 40
`projects.research.top.40`

the rest are skipped by closeness alone, and say so

### How many: 100
`projects.research.top.100`

about 2½ times as long; enough to override 30

### How many: 200
`projects.research.top.200`

the longest; the most decisions for a point of view

### Decision: compare two screeners
`projects.research.decision.compare`

compare two screeners

### Compare: no
`projects.research.compare.no`

one screener

### Compare: no, about
`projects.research.compare.no.about`

the model chosen above

### Compare: yes
`projects.research.compare.yes`

two, side by side

### Compare: yes, about
`projects.research.compare.yes.about`

a second screener reads the same items; you see where they disagree, and how often each agrees with you

### Decision: summaries
`projects.research.decision.summaries`

summaries

### Summaries: none
`projects.research.summaries.none`

none

### Summaries: none, about
`projects.research.summaries.none.about`

the list says why each was kept

### Summaries: from abstracts
`projects.research.summaries.abstracts`

from abstracts

### Summaries: from abstracts, about
`projects.research.summaries.abstracts.about`

kept items free to read, with an abstract: papers summarise

### Summaries: from the full text
`projects.research.summaries.full`

from the full text

### Summaries: from the full text, about
`projects.research.summaries.full.about`

items whose source has the text: the archives' scans, patents, your own copies

### Decision: whose decisions
`projects.research.decision.whose`

whose decisions it learns from

### Whose: yours
`projects.research.whose.mine`

yours

### Whose: yours, about
`projects.research.whose.mine.about`

the point of view holds your sense of what is relevant

### Whose: the class, pooled
`projects.research.whose.class`

the class, pooled

### Whose: the class, about
`projects.research.whose.class.about`

every student's decisions on the same topic, pooled: an item is kept when most of those who decided kept it; a tie stays undecided. papers check sets each student against the pool

### Decision: how the point of view is trained
`projects.research.decision.trainFrom`

how the point of view is trained

### Trained from all your decisions
`projects.research.trainFrom.all`

from all your decisions

### Trained from all your decisions, about
`projects.research.trainFrom.all.about`

Train imitates every keep and skip, yours and the screener's where you left them: your whole point of view, with some of the screener's in it where you agreed.

### Trained from your overrides
`projects.research.trainFrom.overrides`

from where you overrode the screener

### Trained from your overrides, about
`projects.research.trainFrom.overrides.about`

Prefer learns only the places you disagreed: your point of view against this screener's. Few examples, all disputed; change the screener and what it learned means something else.

### Decision: the base
`projects.research.decision.base`

the base it is trained on

### Decision: where it runs
`projects.research.decision.runs`

where the point of view runs

### Where it runs: here
`projects.research.runs.here`

here

### Where it runs: here, about
`projects.research.runs.here.about`

it is the screener on each new search: papers screen --model

### Where it runs: a folder of its own
`projects.research.runs.folder`

here, and a folder of its own

### Where it runs: a folder of its own, about
`projects.research.runs.folder.about`

package: the model, research.js and the topic; zip it; node research.js runs the whole loop anywhere with Ollama

## Project mode: the research bot's schematic

### Replay the unfolding
`projects.research.mode.replay`

◂ from the Start map

### New on the Start map
`projects.research.mode.newBox`

new on the start map

### Papers, opened: its head
`projects.research.mode.headPapers`

papers · where it searches

### Models, opened: its head
`projects.research.mode.headModels`

models · one per role

### Lane: inside models
`projects.research.mode.laneModels`

inside models: a model for each role

### Lane: inside papers
`projects.research.mode.lanePapers`

inside papers: what finds and reads the items

### Lane: the point of view
`projects.research.mode.laneView`

the point of view: your decisions become a model

### The point of view becomes the screener
`projects.research.mode.becomes`

your point of view becomes the screener

### Caption: search code
`projects.research.mode.capSearch`

finds every item

### Caption: rank
`projects.research.mode.capRank`

closest first

### Caption: screen
`projects.research.mode.capScreen`

keep or skip, and why

### Caption: you decide
`projects.research.mode.capYou`

keep or skip each

### Caption: reading list
`projects.research.mode.capList`

what you get

### Caption: data
`projects.research.mode.capData`

your decisions as rows

### Caption: train
`projects.research.mode.capTrain`

imitate them all

### Caption: prefer
`projects.research.mode.capPrefer`

lean toward your side

### Caption: adapters
`projects.research.mode.capAdapters`

export: a point of view

### Caption: share
`projects.research.mode.capShare`

package, zip

## Project mode: the research bot's steps

### Step: the models
`projects.research.mode.models`

get the models for each role, and the ranker

### Step: the models, missing
`projects.research.mode.missing`

not here yet: {models}

### Step: search
`projects.research.mode.search`

search: a topic and its seeds, in the sources chosen

### Step: search, done
`projects.research.mode.searched`

workspace/research/{folder} · searches run: {runs}

### Step: screen
`projects.research.mode.screen`

rank what was found, then screen the closest

### Step: screen, done
`projects.research.mode.screened`

{n} screened by a model

### Step: keys
`projects.research.mode.keys`

put any keys you hold in their file: papers keys shows where, and which are set

### Step: keys, done
`projects.research.mode.keysResult`

the file is outside the workspace, so this page can't see it: papers keys says which keys are set

### Step: your own copies
`projects.research.mode.add`

add your own PDFs (put them in uploads on the Files tab first): each is read in full, every page

### Step: your own copies, done
`projects.research.mode.added`

{n} of your own copies in the library

### Step: the second screener
`projects.research.mode.second`

the second screener reads the same items as the first

### Step: the second screener, done
`projects.research.mode.secondRead`

{n} read by the second screener

### Step: compare the screeners
`projects.research.mode.check`

compare the two screeners with your decisions: how often each agrees with you, and with the other

### Step: pool the class
`projects.research.mode.pool`

bring in your classmates' research folders (each zipped on the Share tab), then pool every student's decisions into the class's

### Step: pool the class, done
`projects.research.mode.pooled`

{n} students pooled · {decided} items with a pooled decision

### Step: decide
`projects.research.mode.decide`

keep or skip each yourself: yours wins, and yours are what a point of view learns from

### Step: decide, how many
`projects.research.mode.decided`

{mine} decided by you, {overrides} of them overriding the screener · {target} needed

### Step: summarise
`projects.research.mode.summarise`

summarise what you kept: each claim quotes the text it rests on

### Step: summarise from the full text
`projects.research.mode.summariseFull`

summarise what you kept from its full text: each claim quotes the text and says where (a page)

### Step: the reading list, the last step
`projects.research.mode.read`

make the reading list and BibTeX, and read it

### Step: the reading list, before a point of view
`projects.research.mode.list`

make the reading list and BibTeX from this search

### Step: the point of view's set
`projects.research.mode.set`

turn your decisions into a set for a point of view, and split it

### Step: the set, made
`projects.research.mode.setMade`

{rows} rows · {pairs} pairs where you overrode the screener

### Step: train
`projects.research.mode.train`

train the point of view on all your decisions

### Step: prefer
`projects.research.mode.prefer`

train the point of view on where you overrode the screener

### Step: export
`projects.research.mode.export`

export it into Ollama

### Step: package
`projects.research.mode.package`

package it with research.js, and zip it

### Step: use it, the last step
`projects.research.mode.use`

use it: search again, and your point of view screens what's new
