# Projects: step-by-step test guide

One walk-through per card on the Projects tab, in the order the tab shows them. Each step names the tab that does it, what you do there, the command it echoes in the terminal, and what to check before going on. Every command can also be run from the Projects card itself.

**Before you start**

- Open **http://localhost:4817**, which is main with the Projects tab. Port 4827 is an older copy from before the tab.
- This copy's workspace is `~/__DEV/retension/workspace`, on the Mac's own disk. A training run plus an export needs about 2 GB free. Check with `df -h /` first.
- After each step, open the Projects tab and check that the step now says **done**. That is part of the test.

Words in angle brackets, like `<table>`, are names you choose or that the page fills in.

**Project mode.** Press *open <tab>* on a step: the tab opens with the guide bar at the top (the card, step n of m, what to do, *back to the card*, *next step*, ×). Check on each step:

- The address says `?project=<card>&step=<n>`; a reload keeps the bar and the step.
- The names the card chose are filled in on the tab (on the voice card: the set on Data, and the set, adapter name and base on Train).
- A step with a walkthrough points at one control at a time, with a dashed box round it. Using the control (a choice changed, its button pressed) moves to the next note; so does *next note*. After the last note the bar shows the step's count and *show the walkthrough again*. The multi-agent studio card's walkthrough moved out of Variable Machine with the card on 2026-11-19.
- A step with no walkthrough shows its commands in the bar, to run from there.
- When the step is done, *next step* gets the dashed box. Nothing moves on by itself.
- On a tab the step doesn't use, the bar stays and offers *back to step n*.
- × closes the bar; the tab stays where it is.

---

## 1. Dream reading

**Makes:** an installation for a student's dream project. Sixteen cards: four for each quality, who (誰), what (什麼), when (何時), where (何地). A visitor chooses one card of each, a combination (256 of them). Each combination has an interpretation, written by a language model from the guide texts the student chose, and variations drawn by Kandinsky 2.2. Plan: `docs/dream-card-plan.md`; sources: `docs/dream-reading.md`.

It is a **walkthrough**: on the Projects tab, the dream reading's box opens project mode. The Start map unfolds into the dream's schematic; the decisions come first; then all eight steps on one long page, each with its command and its own view.

- **Time:** with the demo deck, about 15 minutes to a first combination (6 to draw the deck); then about 2 hours to interpret all 256 and 3 to draw them, which can run overnight and stop and start.
- **Disk:** Kandinsky 9 GB, its prior 6.9 GB (for the demo deck, and for drawing with the interpretation), SigLIP 214 MB; `qwen3:4b` 2.5 GB and `nomic-embed-text` 274 MB in Ollama; torch about 1 GB. On Kevin's Mac the two Kandinsky folders are on KP 512, linked from `workspace/tools/`.
- **Memory:** a Mac with 16 GB or more.
- **Privacy:** a visitor's words stay in `workspace/dreams/<name>/` on this computer; every model runs locally.

**The decisions** (top of the page). Change one and watch the schematic and the steps change:

| Decision | Try | Check |
|---|---|---|
| where the cards come from | her own pictures, then the demo deck | Her own: four set pickers appear, and step 2 becomes an upload. Demo: step 2 runs `dream cards dream-demo`, and **kandinsky-prior** lights in MODELS |
| the texts to interpret with | tick Freud | Step 4 adds `data raw gutenberg 66048 freud-dreams` if it isn't brought in; step 5's command adds `raw/freud-dreams` |
| which models read | the writer `none` | The writer's box in MODELS goes faint; steps 6 and 7 add `--model none` |
| how the variations are drawn | the cards and the interpretation | **kandinsky-prior** lights, and its wire runs to VARIATIONS; the draw commands add `--with prior` |
| how many variations | 4 | `--variations 4`; the time shown for all 256 doubles |
| when | in the room only | Step 7 (all of them) disappears: the route has 7 steps |
| the visitor's own words | read into the interpretation | Step 8's `dream respond` adds `--read-words` |

**The steps** (default decisions: the demo deck; the Zhougong jiemeng, Wang Fu and the Liezi in Giles's English; `qwen3:4b`; two variations from the cards; all ahead):

| # | Box | Do | Command | Check |
|---|---|---|---|---|
| 1 | models | get what is missing | `model get kandinsky`, `model get siglip`, `model get kandinsky-prior`, `ollama pull nomic-embed-text`, `ollama pull qwen3:4b` | The step lists the five and turns done when all are here |
| 2 | cards | draw the demo deck (or, with her own pictures, upload each quality's pictures in the step's four rows) | `dream cards dream-demo` | About 6 minutes. Four rows fill in: an old woman in a dark blue robe, a child with a paper lantern, a white snake, a monk; a boat, a bronze mirror, a red candle, a comb; a full moon, snow at dusk, summer rain, sunrise; a river, a temple courtyard, a mountain path, a kitchen. One ink-and-watercolour style |
| 3 | deck | make the deck | `dream deck dream --who images/dream-demo-who --what … --when … --where …` | The step shows the sixteen cards, each with three glossary words (the snake: *a snake* 蛇; the moon: *the moon* 月). It says **256 combinations** |
| 4 | guide texts | bring in the library texts not here yet; upload her own writing (.txt or .md) in the step | `data raw txt …` for each | Her upload appears in the decision's list, ticked, and in step 5's command as `uploads/<file>` |
| 5 | passages | cut and measure the guide texts | `dream guide dream raw/zhougong-jiemeng raw/wangfu-menglie raw/liezi-dreams` | It says the Zhougong jiemeng is a dream book (looked up by the glossary) and how many passages each other text has |
| 6 | interpret | pick a card in each row, then run both commands | `dream interpret dream --combination 1-1-1-1`, `dream draw dream --combination 1-1-1-1` | About 25 s and 40 s. The step shows the two variations, the reading in English and Chinese, the picture sentence, and the passages (the ones used marked). **open its page** shows the same, on its own |
| 7 | variations | make all 256, before the show | `dream interpret dream --all`, `dream draw dream --all` | Each line says how long is left. Stop it and run it again: what is made is kept. The step's result counts them |
| 8 | the room | try a visitor, then **open the room** | `dream choose dream --who 1 --what 2 --when 3 --where 4`, `dream respond dream` | Respond says *interpreted ahead of time* or *interpreting now*. The room: four rows of four cards; a card in each row turns green and dims the others; **read my dream**; the four cards, the variations, the reading in Chinese and English; **another dream** |

**Tested** on port 4843 on 2026-11-20 with the demo deck and the default decisions, every step through the tool. `--all` was run for eight combinations, stopped with the page's stop, and run again: it said `8 interpreted already, kept; 248 to go`. In the room, combination 3-1-1-2 (made ahead) came back in about 10 s; 1-3-2-4 with the words *my grandmother was cooking but the fire would not light* was made live in about 90 s, its reading drawn from the Zhougong jiemeng, the Liezi and Wang Fu.

---

## 2. Dream reader, trained (訓練解夢)

**Makes:** the dream reading's installation, with every part made by the student. Same folder, deck and guide texts as card 1 (`workspace/dreams/dream`). A **teacher** model (`qwen3:4b`) reads all 256 combinations; each reading becomes a **row** (the question asked and the teacher's answer, as JSON); a small **reader** model is trained on the rows and exported to Ollama, then reads all 256 again. A **style** trained from someone's drawings (a decoder LoRA for Kandinsky 2.2) draws the variations. Plan: `docs/dream-card-plan.md` §10.

It is a walkthrough like card 1: the schematic adds a training lane (rows → train → export → share) and the drawings → style boxes.

- **Time:** on top of card 1's steps: the teacher's 256 readings about 107 minutes; training the 0.5B reader about 40 minutes; the reader's 256 readings about 45 minutes; 30 demo drawings 8 minutes; the style 22 minutes; all 256 drawn again about 3 hours.
- **Disk:** card 1's, plus the base model from Hugging Face (Qwen2.5 0.5B, 1 GB; 1.5B, 3 GB) and the exported reader in Ollama.

**The decisions** (besides card 1's):

| Decision | Try | Check |
|---|---|---|
| the teacher | `olmo2:7b` | Step 6 and step 7's `dream rows` add `--by olmo2:7b` |
| the reader's base | Qwen2.5 1.5B | Step 8's `--base Qwen/Qwen2.5-1.5B-Instruct` |
| the rows | keep at once | Step 7's `dream rows` adds `--keep`; with *read*, the drafts wait on the Data tab |
| the diffusion model | the cards and the prior | Kandinsky only; SD 1.5 and FLUX.1 schnell show as choices that are off, with why |
| the style | from drawings | Step 11 appears, with a set picker; step 12 adds `--style latents/<style>` |

**The steps** (the default decisions; the drawings set `demo-drawings`):

| # | Box | Do | Command | Check |
|---|---|---|---|---|
| 1–5 | models, cards, deck, texts, guide | as card 1 | | done if card 1 is |
| 6 | the teacher reads | all 256 | `dream interpret dream --all --model qwen3:4b` | The step counts readings by the teacher |
| 7 | rows | make rows; read and keep them on the Data tab; split | `dream rows dream dream-readings`, `data split dream-readings --valid 0.2` | The Data tab's drafts panel says the rows are readings, offers **make rows** (not the writer), and **keep** moves a row into train.jsonl |
| 8 | train | train the reader | `train dream-reader --data dream-readings --base Qwen/Qwen2.5-0.5B-Instruct --max-seq 3072` | The loss falls; the adapter appears |
| 9 | export | into Ollama | `export dream-reader` | It writes `fused/dream-reader/model.gguf` (Qwen's GGUF with the trained weights) and `ollama list` has dream-reader, 675 MB |
| 10 | the reader reads | all 256 again | `dream interpret dream --all --again --model dream-reader` | The step's combination shows the reader's reading |
| 11 | drawings → style | choose the drawings set in the decision (the style is named after it: demo-drawings → demo-style); upload drawings, or draw the demo set; make and train the style | `dream drawings demo-drawings`, `latent make demo-style images/demo-drawings`, `latent train demo-style` | The step shows the drawings; `latents/demo-style/lora.safetensors` exists |
| 12 | variations | draw again in the style | `dream draw dream --all --style latents/demo-style --again` | The page says *in the style of* |
| 13 | the room | open **#room/dream/trained** | `dream respond dream --model dream-reader --style latents/demo-style` | A live reading comes from the reader and is drawn in the style |
| 14 | share | zip the reader and its rows | `zip adapters/dream-reader`, `zip data/dream-readings` | Both zips in workspace/shared, each with its manifest |

**Tested** on port 4843 on 2026-11-20 and 21, every step through the tool: 246 rows (25 kept on the Data tab), split 197 / 49; the 0.5B reader trained 200 iterations in about 40 minutes (the set-aside loss lowest at 100: 1.24, then rising to 1.48, so 100 iterations is enough for this many rows); exported through the GGUF route; a reading in about 10 s against the teacher's 25; the demo style trained in 22 minutes; the trained room read 2-3-2-4 live and drew it in the style in about 80 s. The Projects card said 12 of 14 steps done before the two runs over all 256.

---

## 3. Latent image

**Makes:** the latent image of what a person keeps (the picture 15 or more screenshots of their photo roll, or of their Instagram saved posts, stories or reels, hold without any one showing it), beside the pixel average; a decoder trained on the set; and a gallery page that sets each part beside the media theory it is like (Benjamin, Barthes, Baudrillard, Lacan), with JSON of every picture's distance and what it brings.

- **Time:** about 15 minutes for 15 pictures: 1 to crop, 2 to make, 6 to train and redraw, 1 to measure, plus the download.
- **Disk:** 9 GB for Kandinsky 2.2 and about 1 GB for torch. On Kevin's machine, run from the KP 512 install, not the Mac's own disk.
- **Memory:** a Mac with 16 GB or more; the helper refuses below that and says why.
- **Privacy:** the screenshots show a person's own photographs or other people's posts. Both sets, the latent image and the gallery are marked private, and `zip` refuses them. Student project only.

**The walkthrough.** Press the card: it opens as a walkthrough, like the research bot's. The Start map is drawn with the route lit on your photos, your words and the ready-made model (Kandinsky 2.2, the diffusion model), and four boxes it adds, marked NEW: crop, latent image, train and gallery. Under it are the decisions:

- **which pictures:** grid screenshots, single screenshots, or a public-domain set;
- **the set's name;**
- **which diffusion model:** Kandinsky 2.2 (TAESD is shown, not built);
- **which texts:** the six media-theory texts, and your own writing or PDFs;
- **whose look:** the model's, or the set's own, which adds the train step;
- **what to measure against.**

Then come the steps on one long page. Each shows its own copy of its tab: the image set for the pictures, Data's raw material for the texts, and the new "your own writing, or a PDF" card. Scrolling folds the map into a strip, and the box of the section in view turns green.

- Check: changing a decision redraws the route. "A public-domain body of work" drops the crop box; "the model's look" drops the train box.
- Check: with "your own writing, or PDFs" on, step 5 shows the upload card. Choose a .txt, .md or .pdf, then **bring it in** (`data raw file uploads/<file> <name> --license "my own writing"`). It lands in `workspace/raw/<name>` with `"private": true`. A scanned PDF with no text layer is refused with a reason. Tested 2026-11-20 with a .txt, a text PDF and a scanned one.
- Check: after make and train, steps 6 and 7 show the latent image, the pixel average and the trained decoder's drawing.

The steps by hand, for checking each one:

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Models | Get the picture encoder and decoder (picture encoders section, **kandinsky**) | `model get kandinsky` | 9 files in `workspace/tools/kandinsky/prior` and `/decoder`; the licence reads Apache 2.0 from Hugging Face. It refuses first if the disk has less than 9.9 GB free |
| 2 | Image segmentation | On the phone, screenshot 15 or more saved posts, stories or reels, one a screenshot, or a few screens of the Saved grid or the photo roll. Upload them into a new set, `screenshots` | none: upload in the page | The pictures in `workspace/images/screenshots`. To try the card without screenshots, use `look museum "Utagawa Hiroshige" hiroshige --limit 100` instead and go to step 4 with `images/hiroshige` |
| 3 | Image segmentation | Crop each screenshot to its picture | `latent crop images/screenshots screenshots-pictures` (add `--grid` for the Saved grid or the photo roll) | Each line names what it found: **post** (the picture between the header and the buttons) or **full screen: the middle square** (a story or reel). With `--grid`, the number of thumbnails each screenshot gave. Look through `images/screenshots-pictures`: no usernames, buttons, captions or cut thumbnails. Both sets' manifests say `"private": true`. On 15 mock screenshots (feed posts light and dark, square posts, stories, reels), 3 mock Saved grids and mock photo rolls (3 and 5 columns, light and dark), every post's box matched the picture and every grid gave all its thumbnails. **Real iPhone Photos screenshots (2026-11-20):** the 5- and 3-column views gave every whole thumbnail, with the rows under the title and the bottom bar left out; a zoomed-out view gives 0 and says to zoom in to 3 or 5 columns. **Real Instagram grids (2026-11-20):** two Saved grids and two profile grids gave every whole thumbnail (12, 12, 9, 9), part-rows left out. Single posts, stories and reels are tested on mocks only: grids are the way to collect (Kevin, 2026-11-20: "Grids are enough") |
| 4 | Data → raw material | Bring in texts, as framing | `data raw wikipedia The_Work_of_Art_in_the_Age_of_Mechanical_Reproduction benjamin-work-of-art`, `data raw wikipedia Camera_Lucida_(book) barthes-camera-lucida`, `data raw wikipedia Simulacra_and_Simulation baudrillard-simulacra`, `data raw wikipedia Mirror_stage lacan-mirror-stage`, `data raw gutenberg 11751 holmes-stereograph`, `data raw gutenberg 1735 plato-sophist` | Each lands in `workspace/raw`. They frame the card and don't change the model. The works by Benjamin, Barthes, Baudrillard and Lacan are in copyright: only the Wikipedia articles come in, and the works are read through the library (`docs/latent-image-reading.md`) |
| 5 | Image segmentation | Make the latent image | `latent make screenshots-pictures images/screenshots-pictures` | About 2 minutes. With fewer than 30 pictures it says it draws no axes. On the 15 mocks: centre across halves 0.942, just under the 0.95 it calls stable; the card shows that. **see the latent image** opens `latent.png` |
| 6 | Train | Train the decoder on the set | `latent train screenshots-pictures` | 20 steps a picture: 300 steps for 15, 6 minutes on the mocks. Afterwards `latent-trained.png` is beside `latent.png` |
| 7 | Image segmentation | Measure the pictures; press **open the gallery** on the card | `latent gallery screenshots-pictures images/screenshots-pictures` | The page shows the latent image (before and after training) and the pixel average, each with its line of media theory (Barthes, Baudrillard, Benjamin); a list "what media theory says it is like" (Baudrillard's phases, Lacan's mirror stage, Flusser), with Steyerl's poor image and the line on saved posts and the recommender; "no axes"; then every picture, nearest first, with what it brings. On the mocks: 0.86 to 1.31 spreads |
| 8 | Share | Try to zip it | `zip latents/screenshots-pictures` | Refused: it says the set is private and stays on this computer |

**The example** (the default picture choice): `model get kandinsky-prior`, then `latent example example-roll` (about 25 minutes on 32 GB): three photo roll screenshots in `images/example-roll`; then the route as on screenshots, with `latent crop images/example-roll example-roll-pictures --grid` (15 a screenshot). Its sets are not marked private.

**The room** (the walkthrough's last step): `latent room <name> <text> …` with Ollama running and nomic-embed-text pulled; open `#latent-room/<name>`; choose three pictures and press draw: about 50 s, then two drawings, the "nearer than" line, and two passages under each media-theory line. Choose the same three again: shown at once.

## 4. Image moods

**Makes:** a mood classifier (calm, lively, tense, sombre) for what a picture conveys, its score on pictures set aside, and a gallery page with CSV and JSON. **Time:** about 10 minutes, 2 of them embedding the texts. **Disk:** about 360 MB (encoder 204 MB, OASIS 88 MB zip plus 51 MB dataset). **Note:** OASIS includes unpleasant photos (a carcass, a crash); its licence is research use, so the results are for student projects only.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Models | Get the picture encoder (picture encoders section) | `model get siglip` | 7 files in `workspace/tools/siglip`; the licence reads Apache 2.0 from Hugging Face |
| 2 | Data | Bring in OASIS as a picture dataset | `data import oasis oasis-moods` | 513 rows: calm 201, lively 138, tense 118, sombre 56; it says 346 Person photos and 41 photos of people were left out |
| 3 | Data → raw material | Bring in texts: a book and an article (the "wikipedia" source is new) | `data raw gutenberg 50572 goethe-colours`, `data raw wikipedia Color_psychology colour-psychology` | Each lands in `workspace/raw`; the Wikipedia one's licence names CC BY-SA 4.0 and the article's address |
| 4 | Data | Set pictures aside and validate | `data split oasis-moods --valid 0.2`, `data validate oasis-moods` | 410 train · 103 valid; all valid picture rows |
| 5 | Data | Pick each mood's sentences, then read them and cut what doesn't fit | `mood describe oasis-moods --texts raw/goethe-colours raw/colour-psychology`, `cat data/oasis-moods/labels.md` | `labels.md` has four moods, each a prompt and 8 sentences with their source |
| 6 | Train | Train and check (the Train tab also offers it for a picture dataset of moods) | `mood train oasis-moods-siglip --data oasis-moods` | About 30 s. The card shows the score: the session's test, 71% right on 103 pictures (balanced F1 0.68), against 35% for always "calm" and 36% for the texts alone |
| 7 | Image segmentation | Bring in a gallery: public-domain artworks | `look museum landscape aic-landscapes --limit 40` | 40 pictures; the set's manifest credits each (title, artist, CC0) |
| 8 | Image segmentation | Sort the gallery; press **open the gallery** on the card | `mood gallery oasis-moods-siglip images/aic-landscapes` | The page shows each picture's mood, confidence and reason; the passages differ from picture to picture; `moods.csv` and `moods.json` are beside it |
| 9 | Share | Package and zip; in the unzipped folder, `sh get-encoder.sh`, then classify.py on a folder | `package oasis-moods-siglip`, `zip packages/oasis-moods-siglip` | A zip of about 120 KB; `classify.py` writes `moods/gallery.html` |

## 5. Ask a table

**Makes:** a small model that turns a question into a query; the answer is counted from the table. **Time:** about 20 minutes, 9 of them training.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Data | Bring in a table: open data → search "crime" → DC crime 2025 | `data raw csv <address> <table> --license <license>` | The table appears with its row count |
| 2 | Data | Open "what's in this table", check the roles and everyday words, then press **make a training set from this table** | `data profile` → `data questions … --rows 1000` → `data split … --valid 0.15` → `data validate` | All four run in the terminal; validate reports no bad rows |
| 3 | Train | Defaults (SmolLM2-360M, rank 8, 800 steps) → train | `train <adapter> --data <set>` | The loss falls; the run ends without an error |
| 4 | Adapters | Export | `export <adapter>` | The model shows in Ollama |
| 5 | Chat | Ask the table: `ask check` | `ask check <model> <set>` | About 95% right on the held-out questions |
| 6 | Chat | Ask three questions of your own, one with a place not in the table | — | The query and SQL show; the unknown place is refused with a list of real places, never answered with 0 |
| 7 | Share | Package, then zip | `package <model>`, `zip packages/<model>` | The folder has `ask.js`, `demo.html` and the README; `node ask.js "how many …"` answers |

## 6. Gesture controller

**Makes:** a model trained on your own gestures, sent as OSC. **Time:** about 10 minutes. **Needs:** a camera, and TouchDesigner, Max or Pure Data listening on port 9000, or any OSC monitor.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Gesture | Get the hand tracker | `model get hands` | The download finishes; the step checklist moves on |
| 2 | Gesture | Name a new set | `gesture new <set> --tracker hands` | The set appears |
| 3 | Gesture | Start the camera; for each of 2 gestures, tap to record, wait for the countdown, record 5 or more examples | (in the page) | The count shows on the camera picture; the card's step shows each gesture's count and is done when two gestures have 5 or more |
| 4 | Gesture | Train | `gesture train <set>` | Set-aside examples are mostly named right |
| 5 | Gesture | Send | `gesture send <set> --port 9000` | The patch receives the gesture names |

## 7. Cut-out tool

**Makes:** PNGs with a transparent background, each with a record. **Time:** about 5 minutes.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Look → segmentation | Get the cut-out model | `model get cutout` | The download finishes |
| 2 | Look → segmentation | Bring in the example photos (or your own) | `look example classic-cv` | The photos show |
| 3 | Look → segmentation | Cut one out | `look cutout images/classic-cv/<photo>` | A transparent PNG appears in outputs with its record |

## 8. A character's voice

Two ways. **A** takes 5 minutes. **B** takes about 30 minutes.

**A: Modelfile**

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Modelfile | Write the voice's standing instructions; make the variant | `ollama create <name> -f workspace/modelfiles/<name>.Modelfile` | The variant answers in the voice in Chat |

**B: training on someone's writing**

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Data | Bring in a public-domain book | `data raw gutenberg <book number> <name>` | The text appears |
| 2 | Data → drafts | Draft rows from its passages, then keep, edit or reject each draft | `data draft <name>-qa --from raw/<name> --count 150 --model qwen3:4b` | The set appears with its drafts, marked unreviewed. Each keep echoes `data append … --draft <id>`, each reject `data reject <name>-qa <id>`. The card shows *n of 100 rows kept*; done at 100 |
| 3 | Train | Train on SmolLM2 | `train <adapter> --data <rows> --base <small>` | The run ends without an error |
| 4 | Adapters → Chat | Export, then talk to it | `export <adapter>` | It sounds like the writer, and more than the base model does |

## 9. Research bot

**Makes:** a reading list, BibTeX, a library of what's been seen, and later a judge trained on your decisions. **Time:** about 15 minutes to the reading list; training adds about 10 minutes and needs about 2.2 GB of disk.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Data → papers and articles | A topic in a sentence, plus 2–5 seed DOIs or links, plus any Substack feed (`name.substack.com/feed`) | `papers search <name> --topic "<topic>" --seed <doi> …` | Results come in from OpenAlex, arXiv, Crossref and the feeds, with duplicates removed |
| 2 | Data | Screen; then go through and change any keep or skip you disagree with | `papers screen <name>` | Each item has keep or skip and a reason; your changes stick |
| 3 | Data | Summarise and list | `papers summarise <name>`, `papers list <name>` | The reading list says why each item is relevant; every quote is in the abstract; a `.bib` file is written |
| 4 | Data | Turn your decisions into a set | `papers judge <name> <set>`, `data split <set> --valid 0.2` | A keep/skip set plus preference pairs from your overrides |
| 5 | Train | Train the judge | `train <judge> --data <set> --base <small>` | The run ends without an error |
| 6 | Adapters | Export | `export <judge>` | It's in Ollama |
| 7 | Data | Measure it: `papers check` | — | It agrees with your decisions more often than the stock screen (70%) and than keeping everything |
| 8 | Share | Package; run `node research.js` in the folder | `package <judge>`, `zip packages/<judge>` | A rerun shows only new items |
