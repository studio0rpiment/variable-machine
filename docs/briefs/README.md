# The four "How might we" briefs, tried

Each brief was worked through on 2026-10-24 with Variable Machine v0.2, as a student would: the app's real commands, real public data, timings, what broke, and what we changed because of it. Each folder has the record, the files it made, and **the real instructions**, rewritten from what happened rather than from the plan.

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
