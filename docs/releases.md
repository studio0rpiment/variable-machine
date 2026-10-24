# Releases

Every release of Variable Machine, newest first. Downloads are on the [releases page](https://github.com/studio0rpiment/variable-machine/releases).

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
