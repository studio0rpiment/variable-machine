# Releases

Every release of Variable Machine, newest first. Downloads are on the [releases page](https://github.com/studio0rpiment/variable-machine/releases).

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
