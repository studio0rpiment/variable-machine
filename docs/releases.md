# Releases

Every release of Variable Machine, newest first. Downloads are on the [releases page](https://github.com/studio0rpiment/variable-machine/releases).

## v0.2.9: gestures with two hands, tap to record (2026-10-27)

**Gesture tab**
- **Hands, one or two:** a set now follows hands or a body. A hands set takes one hand or two, so it can hold one-handed gestures and two-handed ones. It runs on the same hands tracker, now finding up to two, so there is nothing new to download.
- **One hand reads the same with either hand:** a left hand is turned over to read as a right, so a thumbs up recorded with one hand is named with the other. On the example set, it named set-aside examples right as often as before (21 of 22).
- **Two hands keep left and right,** and where the hands are from each other, so hands together and hands apart are different gestures.
- **Tap to record:** one tap starts recording and the next stops it (the space bar too), since your hands are busy making the gesture. After the tap, a count on the camera picture gives you 3 seconds to get your hands into place (5 to step back, for a body); only then are examples kept.
- **Sets you already have still work:** one-hand sets and models trained on them are read as hands sets, without recording again.

## v0.2.8: the next step, marked on the Data tab (2026-10-27)

**Data tab: the next step, marked**
- **No more jump:** a table you bring in from public data now goes straight to *ask a table*, chosen and in view, with a line saying what to do next. Before, the page jumped past it to the hand-written questions.
- **A dashed box on the next step**, as on the gesture tab: it flashes as it arrives and stays until that step is done. *Bring it in*, then *read the table*, then *make a training set from this table*; on the dataset that opens, *split* it if it isn't, then *open the Train tab with it*.
- The terminal's line after a table arrives says the same.

## v0.2.7: ask a table (2026-10-27)

**Data tab: ask a table**
- **What's in this table:** for a table you brought in (DC Open Data, data.gov or your own CSV), the rows, the dates, the source and license, and a line for each column: its type, how many values, how much is missing, examples, and its role in a question (what, where, when, how much, how, or an id to leave out). The roles are guessed from the names and values; change any of them. Click a column to see its values and the everyday words for each ("murders" for HOMICIDE).
- **One button, *make a training set from this table*:** several hundred questions made from the table's own values, each with the query that answers it: how many, near a block, in a month or a season or at night, two places or periods or kinds compared, which has the most, and some whose answer is none. Each step is a command you can open, change and run again.
- **A model that writes queries, not answers:** the answer is counted from the table, so it is always what the table says. On DC's crime incidents for 2025, SmolLM2-360M (it trains on an 8GB Mac, in about 9 minutes on an M1 Pro) got 145 of 150 questions it had never seen right, and 14 of 15 written in other words. It still slips: "pickpocketings" became robberies, and the query on screen is how you catch it.
- **Or the rows as they are:** a smaller option that trains a model to write rows like the table's. What it writes are invented records, never real ones, and Chat says so.

**Chat**
- **Ask the table:** each model writes a query; you see the query, the counts and the rows behind them, the answer in a sentence, and the same query in SQL. A question the table can't answer (a place or a value it doesn't have, a year it doesn't cover) gets no answer rather than a guess. Put the base model in the next column to compare.

**Share**
- **A package to take away:** the model with a one-line `ollama create`, the table, its roles, `ask.js`, a one-page `demo.html` and a README for web pages, Node, Python, and TouchDesigner or Max over OSC, with the data's license and credit. The web page needs only Ollama. About 600MB zipped: the model is most of it.

## v0.2.6: two speaking models; gestures that can say none; recording up close (2026-10-26)

**Speech tab**
- **A second speaking model:** Qwen3-TTS 0.6B (Apache 2.0, about 1.8 GB the first time), with four voices of its own: aiden, ryan, serena and vivian. It can't copy a voice from a recording. The voice you choose picks the model: `speak <name> "<text>" --voice aiden`.
- **Robot and baritone:** Soprano's one voice changed afterwards by a short script you can read (`python/variable_machine/voice.py`): robot is ring-modulated, baritone eight semitones lower at the same speed.
- **More voices:** a link to other speaking models for Macs on Hugging Face, for your own projects.
- **The space bar** starts and stops recording, like a click on record.

**Gesture tab**
- **None:** a pose far from all your examples, or no hand in the picture, is named *none* (with 0), in the test and on OSC.
- **A lightbox for recording and for testing:** the camera and just those controls in the middle of the page, everything else faded; esc or done closes it.
- **Stop the camera** under the picture.
- **The next step** gets a dashed box that flashes when it arrives and stays until it is done.
- **The space bar** records like holding the record button.
- **Train** turns on at two gestures with 5 examples each, as training needs.

## v0.2.5: install with one line in Terminal (2026-10-26)

- **Installing:** macOS 26 won't open the zip's *Variable Machine.command* at all, because Apple hasn't signed it. Instead, open Terminal and paste `curl -fsSL https://variablemachine.orpiment.studio/install.sh | bash`. It downloads the newest release into `~/variable-machine`, makes a **Variable Machine** app (the spiral) in the Applications folder in your home folder, and opens it. Next time, open the app like any other (cmd-space, *Variable Machine*). To update, paste the same line again: your workspace stays as it is.
- **Gesture tab:** *make your own* flashes a dashed box around the name and puts the cursor in it, so naming the set reads as the next step.
- **`npm run dev`:** while the page is still being built, the browser shows "building the page…" and opens the page by itself when it's ready, instead of "ui not built yet" until you refresh.

## v0.2.4: double-click to start; the gesture tab from a standing start (2026-10-26)

- **Starting it:** download the zip, unzip it, and double-click **Variable Machine.command** in the folder. The first time, it installs what it needs and opens the page; after that it starts in seconds. macOS asks once (System Settings → Privacy & Security → Open Anyway), as the README and the download page explain.
- **Gesture tab, step by step:** a checklist of the six steps, each marked done, now or waiting, with how to do it. The tracker is offered where it is needed, *make the set* is a clear button, and the camera starts only when you click *start the camera*, with plain directions when it is blocked, missing or busy.
- **An example set to start from:** three hand gestures, 113 examples, ready to train (`gesture example example-hands`). The sets show as cards: the example first, then your own, then *make your own*. A set's name takes what you type (spaces become hyphens, capitals small) and says when the name is taken.
- **Layout:** setting up on the left; the camera (smaller), examples, training and testing in a column on the right that stays in view. Testing sits in a dashed box. The trackers are under *choose a model*, with what each does and doesn't do.
- **Use it in your patch:** under testing, the OSC message a trained set sends, what receives it in TouchDesigner, Max and Pure Data, how to check it arrives, and how to take the set with you.
- **Waits you can read:** the hand-drawn spiral turns while something loads, with what can honestly be said: downloads in size, speed and time left; training in steps and time left; a tracker loading as an estimate.
- **Fixed:** choosing a new set no longer snaps back to the first set when files change.

## v0.2.3: the Start map, redrawn; tabs named for what their models do (2026-10-24)

- **Start map:** five columns read left to right: what you bring, preparing it, how a model learns, making it a model, using it. The language models' tabs fill a band across the top, with your words and your photos (and what they show) coming in as rows and picture rows. Below, one row for each other kind: image segmentation and speech, whose models their makers trained (drawn dotted), and gesture, which you train yourself in seconds. Every box opens its tab, lights its wires and shows its commands.
- **Tabs renamed** for what their models do: *look*, *voice* and *move* are now **image segmentation**, **speech** and **gesture**. Old links still land on them; the terminal commands are unchanged.

## v0.2.2: audio players in the page's own style (2026-10-24)

- **Voice:** sounds play in Variable Machine's own style instead of the browser's player: the hand-drawn play triangle and stop blob, a fine line for where you are (drag it, or use the arrow keys), and the time.

## v0.2.1: fixes from trying the four briefs (2026-10-24)

Fixes found by working through the four class briefs as a student would; their records and rewritten instructions are in [docs/briefs](briefs/README.md). If you have v0.2, replace it with this one.

**Fixes**
- **Voice:** *speak* sometimes hummed for half a minute instead of stopping at the end of the text. It now finishes every sentence, every time.
- **Move:** right after you picked a new photo, *add this photo* could save the previous photo's points under the new gesture. Picking a photo now clears the old points at once.
- **Move:** *train* chooses how many neighbours vote from your smallest gesture, so five examples each works.

**Editing the flags:** every explanation flag's words are in one plain-text file, `ui/src/explain/flags.md`. Edit it and the page shows the change on the next reload (with `npm run dev`; restart it once after updating).

**The four briefs, tried:** public data, gallery, gesture and making information tangible, each with what worked, what didn't, timings, and the instructions rewritten from what happened.

## v0.2: every kind of model (2026-10-24)

With this release every kind of model on the Models tab works: it writes, sees, looks, speaks, listens and moves. If you have v0.1 or v0.1.5, replace it with this one, then run `npm install && uv sync --project python` again in the folder.

**Voice tab** (new: speaks and listens)
- **Speak:** type something and Soprano-1.1-80M (Apache 2.0) reads it aloud (`speak <name> "<text>"`).
- **Listen:** record your voice in the page, or pick any sound, and Qwen3-ASR-0.6B (Apache 2.0) writes down what it heard, in 52 languages and dialects (`listen audio/<set>/<file>.wav`). Speak something, then listen to it: text to voice and back.
- Sounds are WAV files in `workspace/audio`, each with what it was asked to say or what was heard. Both models download the first time they run (about 300MB and 1GB), and their Python packages install then too.

**Move tab** (new: gesture and pose tracking)
- MediaPipe finds 21 points on a hand or 33 on a body, from the camera or a photo, in the page (`model get hands`, `model get body`).
- Hold a button to record examples of your own gestures; only the points are kept, never pictures. *Train* is k-nearest neighbours, instant, checked on every fifth example with a grid of what it mixed up (`gesture train`).
- Test it live, and send each guess as OSC to TouchDesigner, Max or Pure Data on this computer (`gesture send <set> --port 9000`).
- The camera is on only while the Move tab is open.

**Also**
- The Start map shows Look, Voice and Move together under *use it as it is*; the About page and the Models tab list them.
- Share zips image sets, sounds and gesture sets too.

**Not yet:** Merge and Prefer for picture adapters; the Voice and Move tabs' timings on a 16GB Mac.

## v0.1.5: models that see, the Look tab, worked examples (2026-10-23)

If you have v0.1, replace it with this one, then run `npm install && uv sync --project python` again in the folder.

**Models that see** (new: a picture in, words about it out)
- **Models:** SmolVLM 256M and 500M (Apache 2.0). They aren't in Ollama's library, so *get* (`model get smolvlm-256m`) downloads their two files and makes `smolvlm:256m` with `ollama create`.
- **Chat:** *add a picture* sends a photo from an image set to the models that see; models that only write get the words, and say so. The terminal shows it as `ollama run-once … --image images/<set>/<photo>`.
- **Data:** picture datasets: a photo, a question and the answer you want, one row at a time (`data picture`). Each photo keeps its own credit and license. Example: `classic-cv-labels`, museum wall labels for four classic computer-science objects.
- **Train:** a picture dataset trains SmolVLM with mlx-vlm (LoRA, about 4.5GB). The extra packages, about 800MB, install the first time you train one. **Adapters** exports it into Ollama next to the original, and *try it* shows the photo too.
- Not yet: Merge and Prefer don't take picture adapters.

**Look tab** (new): ready-made image tools that run in the page: cut something out, the distance between blobs (a depth map), select a blob. Example photos: `look example classic-cv`.

**Changing models**
- **Merge** blends exactly (1 − t)·A + t·B, and a Prefer adapter can blend with a trained one.
- **Prefer** `--sft` keeps the writing whole while the preference moves.
- **Data:** `data raw jsonl` brings in a table written as JSON lines.

**Worked examples:** four models made each way, with their commands, records and loss numbers, in [docs/examples](examples/README.md), and animated on the [site](https://variablemachine.orpiment.studio/examples/).

**Interface:** the Start map has Look in its own band and the sees wire into Data; the flags toggle is green when on.

## v0.1: fixes after the first class (2026-10-21)

Fixes after the first class with v0. If you have v0, replace it with this one.

**Training**
- The loss chart, the plain-words reading and the saved loss now fill in while training runs. In v0 they could stay empty (mlx-lm's progress bar hid the loss lines), which looked like training had stalled.
- *Before you train*: plain warnings when the settings will likely fall apart (learning rate too high), run out of memory, or crawl, with one press back to the recommended settings. Layers are capped to what the model has.
- A run that fails says why: out of memory, too many layers, stopped, a download that failed.

**Data**
- DC Open Data tables are read straight from the city's map service, so a download the portal is "still preparing" no longer stalls. Such a note is refused instead of being saved as an empty table, and the template step comes into view once a table arrives.
- Datasets that come with the app, shown on the Data tab's first screen: art history (Art Institute of Chicago, CC BY 4.0), customer-discovery interview coaching (written for the app, CC0), Dolly creative writing (CC BY-SA 3.0), DC street trees (CC BY 4.0) and two small starters.

**Removing everything**
- `bash scripts/remove-everything.sh` removes the models, Ollama, uv, Node (if it came from nodejs.org) and the app, asking before each step and moving things to the Trash. `--dry-run` only shows what it would remove.

**Interface**
- The terminal is a short strip, with *taller ▴* to lift it to half the window.
- The explanation flags are on by default; *flags on/off* in the top bar turns them off for anyone who prefers that.
- No stray hover tooltip on the Start map.

## v0: first demo (2026-10-20), withdrawn

v0 is no longer offered for download: in its first class, training looked stalled (the loss never showed) and tables from DC Open Data could arrive empty. Use v0.1 or later. Its notes are kept here as a record.

Variable Machine v0: first demo

The seven milestones of the plan, with the explanation layer:
- Start: a clickable, zoomable map of the tabs and what flows between them; About: each tab in words
- Models, Modelfile (presets, side-by-side compare, temporary variants), Data (descriptions,
  Hugging Face by name, your own file, DC Open Data and data.gov tables, templates),
  Train and Prefer (loss explained, next step: export and chat), Merge, Adapters (try it),
  Chat, Share
- every GUI action echoed as a real command in the terminal
