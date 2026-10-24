# The four "How might we" briefs, tried

Each brief was worked through on 2026-10-24 with Variable Machine v0.2, as a student would: the app's real commands, real public data, timings, what broke, and what we changed because of it. Each folder has the record, the files it made, **the real instructions**, rewritten from what happened rather than from the plan, and a **Reproduce it** section: every command in order, with the numbers you should see. All four were run again from scratch from those sections on 2026-10-24 and gave the same numbers (training is repeatable to three decimals); the one exception is noted below.

| | brief | what worked | what didn't, or isn't in the app yet |
|---|---|---|---|
| 1 | [Finding, cleaning and charting public data](1-public-data/README.md) | 87,000 DC donations in 17 s; a name cleaner trained on 260 hand-cleaned employers (17 of 26 unseen names, 21 after adding 13 rows of the kinds it got wrong); charts that always compile once the model is held to a schema | charts from words alone (0 of 12 for every model); "run over every row" and a chart preview are scripts, not the app; the cleaner sometimes invents ("Empower DC" → "DC Comics") |
| 2 | [Documenting work and guiding a gallery](2-gallery/README.md) | labels from **facts + your notes** on SmolLM2-1.7B; cut-out and depth in 3 s; photo → label → spoken label in about 15 s | labels from facts alone (every model invents); Prefer with 19 pairs showed nothing; a spreadsheet with a column per fact can't be imported without a formula; **fixed:** the voice sometimes hummed for 30 s |
| 3 | [Gesture recognition](3-gesture/README.md) | hands found in 11 of 13 photos; train, live naming and OSC out all worked | the camera (blocked where this was tested); photos of strangers' hands make a poor training set; **fixed:** a new photo could be saved with the previous photo's points |
| 4 | [Making information tangible](4-tangible/README.md) | a shop helper on qwen3:4b (10 of 10, but 14 s an answer); a model trained on the class design library: 16 of 16 render, 10 of 12 right | new kinds of design (it reuses the class's templates); qwen3:4b never finished an OpenSCAD answer; OpenSCAD isn't part of the app (checked with its WebAssembly build) |

Three things held across all four:

1. **Words first, then train, then fix the mistakes by kind.** The Modelfile is quick and shows what the model can't do; training on 150–300 rows fixes most of it; the rest is fixed by adding rows of the kinds it gets wrong, not by training longer.
2. **A small model writes in your form, not with your knowledge.** It invents whatever the input doesn't say: give it the facts and notes, and check every answer that leaves the room.
3. **A checker beats a better prompt.** Where a program can check the answer (Vega-Lite compiles, OpenSCAD renders, the clean name is in the list), the model can be held to a shape, and its mistakes can be counted.

Tested on an M1 Pro with 32GB, using the 16GB tier's training settings; 16GB timings themselves are still unmeasured.

## Before a demo

Run on the demo Mac the day before, so nothing downloads in front of the room.

1. **Free disk space: 8GB or more.** Brief 2's 1.7B export needs about 5GB while it works; on 2026-10-24 this Mac had 3GB and that export stopped with "Unable to write … bytes to file". Emptying the Trash is the quickest way (every `trash` command lands there).
2. **Start it:** `npm run dev` in the `variable-machine` folder; it starts Ollama and opens http://localhost:4817. Use **Chrome**.
3. **Run each brief's *Reproduce it* once**, which also downloads everything the demo needs: SmolLM2-360M and 1.7B, SmolVLM-256M, qwen3:4b, the hand tracker, the voice and the listener. Times on an M1 Pro: brief 1 about 5 minutes, brief 2 about 15, brief 3 about 10, brief 4 about 10.
4. **The camera** (brief 3, *With a camera*): never tried with a real camera, because the browser this was tested in blocks it. Allow it in Chrome, record two gestures and a "nothing", and watch the names arrive in `osc-listen.mjs`.
5. **The microphone** (speech tab, *record your voice*): also never tried with a real microphone. Allow it in Chrome, say a sentence, press *stop, save and listen*, and check the words come back.
6. **Check the numbers** against each brief's *Expect* lines: if one is far off, something is different on that Mac.

| brief | run again from *Reproduce it* | same as the first time? |
|---|---|---|
| 1 | words 9 of 26 · trained 17 of 26 · with extra rows 21 of 26 · charts 12 of 12 | yes |
| 2 | facts only: 33 names it invented over 18 works · facts + notes: 14 · picture model answers the bunny's label word for word · recording 11.2 s, three runs alike | yes, except the 1.7B export (disk full); its 14 is from the earlier export of the same training, whose losses matched to three decimals |
| 3 | hands found in 11 of 14 photos · k = 3, 0 of 2 · the unseen thumbs-up named "thumbs up" 100%, received as OSC | yes |
| 4 | shop helper 10 of 10 · designs: 16 render, 15 fit, 12 keep the numbers | yes, once `ask-designs.mjs` asked at temperature 0 (before, three answers changed from run to run) |
