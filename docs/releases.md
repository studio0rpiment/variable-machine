# Releases

Every release of Variable Machine, newest first. Downloads are on the [releases page](https://github.com/studio0rpiment/variable-machine/releases).

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
