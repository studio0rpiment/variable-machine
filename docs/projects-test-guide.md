# Projects: step-by-step test guide

One walk-through per card on the Projects tab, in the order the tab shows them. Each step names the tab that does it, what you do there, the command it echoes in the terminal, and what to check before going on. Every command can also be run from the Projects card itself.

**Before you start**

- Open **http://localhost:4817**, which is main with the Projects tab. Port 4827 is an older copy from before the tab.
- This copy's workspace is `~/__DEV/retension/workspace`, on the Mac's own disk. A training run plus an export needs about 2 GB free. Check with `df -h /` first.
- After each step, open the Projects tab and check that the step now says **done**. That is part of the test.

Words in angle brackets, like `<table>`, are names you choose or that the page fills in.

**Project mode.** Press *open <tab>* on a step: the tab opens with the guide bar at the top (the card, step n of m, what to do, *back to the card*, *next step*, ×). Check on each step:

- The address says `?project=<card>&step=<n>`; a reload keeps the bar and the step.
- The names the card chose are filled in on the tab.
- A step with a walkthrough points at one control at a time, with a dashed box round it. Using the control (a choice changed, its button pressed) moves to the next note; so does *next note*. After the last note the bar shows the step's count and *show the walkthrough again*. No card on the Projects tab has walkthroughs now: the agents card had them, and it has moved to `agent-training/`.
- A step with no walkthrough shows its commands in the bar, to run from there.
- When the step is done, *next step* gets the dashed box. Nothing moves on by itself.
- On a tab the step doesn't use, the bar stays and offers *back to step n*.
- × closes the bar; the tab stays where it is.

---

## 1. Ask a table

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

## 2. Gesture controller

**Makes:** a model trained on your own gestures, sent as OSC. **Time:** about 10 minutes. **Needs:** a camera, and TouchDesigner, Max or Pure Data listening on port 9000, or any OSC monitor.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Gesture | Get the hand tracker | `model get hands` | The download finishes; the step checklist moves on |
| 2 | Gesture | Name a new set | `gesture new <set> --tracker hands` | The set appears |
| 3 | Gesture | Start the camera; for each of 2 gestures, tap to record, wait for the countdown, record 5 or more examples | (in the page) | The count shows on the camera picture; the card's step shows each gesture's count and is done when two gestures have 5 or more |
| 4 | Gesture | Train | `gesture train <set>` | Set-aside examples are mostly named right |
| 5 | Gesture | Send | `gesture send <set> --port 9000` | The patch receives the gesture names |

## 3. Cut-out tool

**Makes:** PNGs with a transparent background, each with a record. **Time:** about 5 minutes.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Look → segmentation | Get the cut-out model | `model get cutout` | The download finishes |
| 2 | Look → segmentation | Bring in the example photos (or your own) | `look example classic-cv` | The photos show |
| 3 | Look → segmentation | Cut one out | `look cutout images/classic-cv/<photo>` | A transparent PNG appears in outputs with its record |

## 4. A character's voice

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

## 5. Research bot

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
