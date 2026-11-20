# Projects: step-by-step test guide

One walk-through per card on the Projects tab, in the order the tab shows them. Each step names the tab that does it, what you do there, the command it echoes in the terminal, and what to check before going on. Every command can also be run from the Projects card itself.

**Before you start**

- Open **http://localhost:4817**, which is main with the Projects tab. Port 4827 is an older copy from before the tab.
- This copy's workspace is `~/__DEV/retension/workspace`, on the Mac's own disk. A training run plus an export needs about 2 GB free. Check with `df -h /` first.
- After each step, open the Projects tab and check that the step now says **done**. That is part of the test.

Words in angle brackets, like `<table>`, are names you choose or that the page fills in.

**Project mode.** Press *open <tab>* on a step: the tab opens with the guide bar at the top (the card, step n of m, what to do, *back to the card*, *next step*, ×). Check on each step:

- The address says `?project=<card>&step=<n>`; a reload keeps the bar and the step.
- The names the card chose are filled in on the tab (on the studio card: the set on Data, and the set, adapter name, base and max seq on Train).
- A step with a walkthrough points at one control at a time, with a dashed box round it. Using the control (a choice changed, its button pressed) moves to the next note; so does *next note*. After the last note the bar shows the step's count and *show the walkthrough again*. So far only the studio card has walkthroughs (steps 1, 2, 4, 5).
- A step with no walkthrough shows its commands in the bar, to run from there.
- When the step is done, *next step* gets the dashed box. Nothing moves on by itself.
- On a tab the step doesn't use, the bar stays and offers *back to step n*.
- × closes the bar; the tab stays where it is.

---

## 1. Latent image

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

## 2. Image moods

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

## 3. Ask a table

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

## 4. Gesture controller

**Makes:** a model trained on your own gestures, sent as OSC. **Time:** about 10 minutes. **Needs:** a camera, and TouchDesigner, Max or Pure Data listening on port 9000, or any OSC monitor.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Gesture | Get the hand tracker | `model get hands` | The download finishes; the step checklist moves on |
| 2 | Gesture | Name a new set | `gesture new <set> --tracker hands` | The set appears |
| 3 | Gesture | Start the camera; for each of 2 gestures, tap to record, wait for the countdown, record 5 or more examples | (in the page) | The count shows on the camera picture; the card's step shows each gesture's count and is done when two gestures have 5 or more |
| 4 | Gesture | Train | `gesture train <set>` | Set-aside examples are mostly named right |
| 5 | Gesture | Send | `gesture send <set> --port 9000` | The patch receives the gesture names |

## 5. Cut-out tool

**Makes:** PNGs with a transparent background, each with a record. **Time:** about 5 minutes.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Look → segmentation | Get the cut-out model | `model get cutout` | The download finishes |
| 2 | Look → segmentation | Bring in the example photos (or your own) | `look example classic-cv` | The photos show |
| 3 | Look → segmentation | Cut one out | `look cutout images/classic-cv/<photo>` | A transparent PNG appears in outputs with its record |

## 6. A character's voice

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

## 7. Research bot

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

## 8. Models for a multi-agent studio

**Makes:** one reader model per job (`studio-mail`, `studio-invoice`, …), each returning fixed JSON fields. **Time:** about 20 minutes per reader. Test one reader, `studio-mail`, first.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Data | New set named for the reader | `data new studio-mail` | The set appears |
| 2 | Data → drafts | Upload the studio's notes (a .txt or .md) under drafts, then draft. Fields fill in as sender,work,ask,deadline. Keep, edit or reject each draft | `data draft studio-mail --from uploads/<notes>.txt --fields sender,work,ask,deadline --count 200 --model qwen3:4b` | Drafts come in ten to a call and wait, unreviewed, in `drafts.jsonl`. Each draft is a message plus its fields as JSON; an edit that breaks the JSON can't be kept. The card shows *n of 150 rows kept · n drafts to read*; done at 150 |
| 3 | Data | Add the lead's corrections as rows | `data append studio-mail '<row json>' --source corrections` | Rows show their source |
| 4 | Data | Set rows aside and validate | `data split studio-mail --valid 0.15`, `data validate studio-mail` | No bad rows |
| 5 | Train | Train on SmolLM2-360M | `train <adapter> --data studio-mail --base <small> --max-seq 512` | The run ends without an error |
| 6 | Adapters | Export under the reader's name | `export <adapter> --name studio-mail` | `studio-mail` is in Ollama |
| 7 | Chat | Compare with qwen3:4b given a prompt | `reader check studio-mail studio-mail` | The card shows both scores. The session's test, on made-up mail only: 95% against 85% of fields, about 6× faster |
