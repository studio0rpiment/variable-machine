# Brief 2: documenting work and guiding a gallery — what happened when we tried it

Tried on 2026-10-24 with Variable Machine v0.2 (M1 Pro, 32GB; 16GB-tier training settings unless noted). Every step is a real command; the files are in this folder.

**The idea in one line:** your notes about a work become a wall label in the house voice; the photo becomes a cut-out, a depth map, and a description; the label becomes a recording for an audio guide.

There was no student's own writing to train on, so the stand-in is the **Cleveland Museum of Art's open-access collection** (all data CC0, including its curatorial descriptions): 180 paintings with title, artist, date, medium, size and label, in [cma-paintings.csv](cma-paintings.csv). The Art Institute of Chicago's API, the first choice, refused requests (403) on the day.

## What we did, step by step

### 1. A spreadsheet of your works → a dataset · the importer can't do it alone

A student's spreadsheet has a column per fact plus the label. `data import file uploads/cma-paintings.csv …` refused it:

> couldn't tell which columns are the question and the answer. columns: title, artist, date, medium, size, label

`data template` *can* join columns ("{title}, {artist}, …"), but only for tables fetched from a web address into `workspace/raw`, not for your own file. So the columns were joined in the spreadsheet with one formula into two columns, `input` and `output`, and that imported:

```
data import file uploads/cma-labels.csv cma-labels --license "CC0 (Cleveland Museum of Art open access)"
data split cma-labels --valid 0.1          162 train · 18 valid · about 165 tokens a row
```

### 2. Facts → label: the brief's rows, trained · 102 seconds

```
train cma-labels-360m --data cma-labels --base HuggingFaceTB/SmolLM2-360M-Instruct --iters 200 …
```

Set-aside loss: 3.16 → **2.75 at step 50 → 3.59 at step 200**: it went *up* after one pass through the data, memorising. 50 steps was the better stop.

Then the real problem, on works it hadn't seen: every model invented what the painting shows. Given "A Builder of Boats, John George Brown, c. 1904, oil on canvas", the trained model wrote about boats "painted for the 1893 Chicago World's Fair" and the 1904 Paris World's Fair. **Title, date and medium don't say what's in a work or why it matters, so no model can write a true label from them.** The brief's rows (facts → label) can't work.

### 3. Facts + your notes → label · the version that can

Each input got the student's notes added, a few words about what to say ([cma-labels-notes.csv](cma-labels-notes.csv); here the stand-in notes are eight content words taken from each real label):

```
Title: St. Matthew | Artist: William Blake (British, 1757–1827) | Date: 1799 | Medium: tempera on canvas
My notes: energy, evangelist, Matthew, responds, presenting, divinely, inspired, echoes
```

| model | how | time to make | what it wrote for St. Matthew |
|---|---|---|---|
| SmolLM2-360M, trained 100 steps | Train | 1 min | invents ("a vision Blake experienced during a trip to Italy") |
| **SmolLM2-1.7B, trained 100 steps, batch 1** | Train | 83 s | "The energy of the evangelist Matthew responds to the divine inspiration of the divine message…" (close to the notes; still adds a little elsewhere) |
| qwen3:4b, two example labels in a Modelfile ([label-writer-qwen.Modelfile](label-writer-qwen.Modelfile)) | Modelfile, no training | 1 min | "St. Matthew, the evangelist, responds with energetic grace to divinely inspired vision." (keeps to the notes, stiff, **56–126 seconds a label**) |

qwen3:4b only works with thinking *on*: with `think` off it writes its reasoning into the answer and runs out of room before the label.

### 4. Prefer: pick the better draft · 100 seconds, too few pairs to tell

Asked the 1.7B label writer for two drafts of each of 36 works, and chose the one that added fewer words not in the facts or notes (a stand-in for a student choosing). 17 of the 36 pairs were too alike to choose between, leaving **19 pairs**:

```
data new label-prefs --format preference
data append label-prefs '{"prompt": …, "chosen": …, "rejected": …}' --source label-writer-notes-1.7b     (×19)
data split label-prefs --valid 0.2          15 train · 4 held out
prefer label-writer-prefer --data label-prefs --model workspace/fused/cma-notes-1.7b --iters 60 --lr 2e-5 --sft 1
```

Held out: prefers the chosen draft in 3 of 4 before, 3 of 4 after. Four pairs can't show a change; the haiku example needed 44.

### 5. Photos: cut-out and depth (Look) · 3 seconds each

```
look cutout images/classic-cv/utah-teapot.jpg       3.1 s
look depth images/classic-cv/utah-teapot.jpg        2.7 s
```

![cut-out](teapot-cutout.png) ![depth](teapot-depth.png)

The depth map is clean. The cut-out kept the teapot, but also part of its lit glass base, and faded the white teapot's bottom into it: light, shiny work on a light ground needs a plain contrasting background when you photograph it.

### 6. Describe from the photo (SmolVLM)

Done when the sees kind was built ([docs/releases.md](../../releases.md), v0.1.5): `data picture` for 16 rows over 4 photos, `train` 60 steps (loss 5.1 → 0.01, about 2.5 minutes with the download), `export`, and in Chat the trained model answers with its labels where the base writes paragraphs. With only four photos it recites the labels it learned; on a picture it hadn't seen it only partly picked up the style.

### 7. The audio guide: label → voice · found a bug, fixed

```
ollama run-once cvl-causal-60 --image images/classic-cv/stanford-bunny.jpg "What is this?"     4 s
speak stanford-bunny-label "Stanford bunny, 1994. A 3D print of …" --set audio-guide             10 s
listen audio/audio-guide/stanford-bunny-label.wav
```

The recording was **41 seconds** long for an 11-second label, with long humming where "A 3D print of a scanned clay rabbit" should be. Speaking that one sentence again and again: it came out right 1 time in 3; the other 2 ran to the 32.8-second limit. Soprano was sampling and sometimes never reached its "stop". Lower temperature didn't help; **greedy decoding (temperature 0) finished every sentence, every time**, at about 15 characters a second. `speak` now does that (commit a562b6e). After the fix: 11.2 seconds, three times out of three: [stanford-bunny-label.wav](stanford-bunny-label.wav). Listening back is the check: `listen` heard "…Greg Turk and Marc Lavois scanned it at Stanford" (it is Levoy).

## The real instructions (rewritten from what happened)

1. **Write notes for each work, not just facts.** Two columns in a spreadsheet: *input* = title, materials, year, size **and three or four notes in your own words about what to say**; *output* = the label you wrote. 40 works at least; 150+ is better. (Joining the columns into *input* is one spreadsheet formula.)
2. **Data → your own file**, then check, count, split.
3. **Train on SmolLM2-1.7B** (on a 16GB Mac, batch 1) for about one pass through your rows: steps ≈ rows ÷ batch. Watch the set-aside line: if it turns up, stop sooner. Export as `my-label-writer`.
4. **Test on works it hasn't seen**, and read every draft against your notes. **It will still add things that aren't in the notes.** It drafts in your voice; you check every fact.
5. **Prefer:** ask for two drafts of each of 40+ works and pick the one that stays truer to the notes. Fewer than about 40 pairs won't show a change.
6. **Photos (Look):** photograph each work on a plain background that contrasts with it, then cut-out and depth.
7. **Describe from photos (Data → picture, then Train):** at least 15–20 different works, a few questions each; with four it only recites.
8. **Voice:** speak each approved label, then **listen to every recording** (or run `listen` on it) before it goes on a wall. Names are where it slips.

## What Variable Machine needs, found by doing this

- **"Your own file" with more than two columns:** let `data template` read an uploaded spreadsheet, so the facts and notes columns become the question without a formula.
- **A loss reading that says "stop at step 50"** when the set-aside line turns up, and offers that number for the next run.
- **"Two drafts, pick one"** on Chat or Adapters, feeding a preference set directly (pairs here were made with a script).
- **Batch voice:** speak every label in a dataset or a CSV column, one sound per row, each listened back automatically and flagged when what was heard doesn't match.
- **The visitor side** (a show page with each work's label and recording, a QR code per work, search by description) is outside Variable Machine today.
