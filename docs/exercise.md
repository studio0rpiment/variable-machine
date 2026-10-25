# The Variable Machine project: a model of your own, for a project of your own

In a group of three, choose one of the four demos below, make it work, then **make it yours**: change it with your own data until it does a job for a project you care about. You hand in **the model you made**, and **a card** that says what you did, why, and the larger project the model is for.

The point is not a perfect model. The point is to make something real, small and your own, and to know exactly what you changed, how you can tell, and where it still fails.

## Use, steer, train

Keep these three apart, in your work and on your card:

- **Use:** your input goes through a ready-made model and nothing in it changes. Cutting out a photo, reading a label aloud, finding the points on a hand.
- **Steer:** your input points the model at the outcome you want, this time: instructions in a Modelfile, a schema it must answer in, the examples you put in front of it. Take them away and it is the model it was.
- **Train:** your examples change the model. The change stays, it can be exported, and someone else can use it.

Every demo uses and steers. **Your hand-in must train**: the model you hand in is one your examples changed.

## 1 · Choose a demo (as a group)

Each demo has a folder in [`briefs/`](briefs/README.md) with what happened when we tried it, the instructions rewritten from that, and a **Reproduce it** section: every command in order and the numbers you should see.

| | demo | the model you train | you bring | trains in | ends up in |
|---|---|---|---|---|---|
| 1 | [**Public data**](briefs/1-public-data/README.md): finding, cleaning and charting a public table | a cleaner: messy values in one column → the clean name | a table from an open-data portal, and 150–300 values you clean by hand | 1 minute | a cleaned table, a chart, a map, a story |
| 2 | [**Gallery**](briefs/2-gallery/README.md): documenting work and guiding a show | a label writer: facts + your notes → a label in your voice | 40+ works (yours, or a collection you care about), each with facts, notes and a label you wrote | 1–2 minutes | wall labels, an audio guide, a show's website |
| 3 | [**Gesture**](briefs/3-gesture/README.md): gesture recognition for camera projects | a gesture namer: points on a hand or body → the gesture's name | your own hands (or bodies) in front of the camera: 3+ gestures and a "nothing" | seconds | a TouchDesigner, Max or Pure Data patch, a performance, an installation |
| 4 | [**Tangible**](briefs/4-tangible/README.md): making information you can touch | data-to-shape: a small table + an encoding → OpenSCAD you can print or cut | a design library: at least one template of your own and 20+ rows of it | 2 minutes | a printed or laser-cut object, a series of them |

Choose by the project you want at the end, not by the tool.

## 2 · Make it work as it is (first session)

Run the demo's **Reproduce it** section on one group member's Mac, command by command, and check each number against its *Expect* line. If yours are far off, something differs on that Mac: find out before you change anything.

- **Disk:** keep 8GB free (the gallery demo's bigger model needs it while it exports).
- **Browser:** Chrome. The gesture demo needs the camera, and the speech tab the microphone: allow them when Chrome asks.
- **Time:** 5 to 15 minutes, most of it the first downloads.

Write down the numbers you got. They are your **before**.

## 3 · Make it yours

Swap the demo's data for yours. What that means for each:

1. **Public data.** Find your own table and your own question. Pick the one messy column that stands between you and the answer. Clean 150–300 of its values by hand in a spreadsheet: the rule you clean by is what the model learns, so write it down. Train, test on values it hasn't seen, and add rows of the kinds it gets wrong. Then run it over the whole column.
2. **Gallery.** Your own works, or a collection you care about. For each work: the facts, **three or four notes in your own words about what to say**, and the label you wrote. Without the notes it invents (the brief shows how much). Train on SmolLM2-1.7B. Then, if you like, photos (cut-out, depth), a picture model, and the labels spoken.
3. **Gesture.** Choose gestures that mean something in your piece. Record each with the camera, 3–5 seconds while moving a little, with the hand, distance and angle you'll use in the piece; add a "nothing". Train, test it live, and send it as OSC into the patch you'll perform with. Then try it on someone else's hand, and record theirs too (with their agreement) if it fails.
4. **Tangible.** Write at least one OpenSCAD template of your own (an encoding the class library doesn't have), check that it renders and fits your machine, and add 20+ rows of it to the library with different tables and differently worded encodings. Train, ask for designs, render and measure every one. Print or cut the best.

All four: **test on things it hasn't seen**, read every answer, and **fix mistakes by adding rows of the kind it gets wrong**, not by training longer. Keep each version (every run keeps its own name); the numbers from each are what your card compares.

## 4 · Hand it in

Three things, from the group:

1. **The model**, as zips from **Share** (each carries its record: where its data came from, its license, and the commands that made it):
   - demos 1, 2, 4: your dataset (`zip data/<name>`) and your adapter (`zip adapters/<name>`). Anyone can unzip them and run `export` to have your model in their own Ollama.
   - demo 3: your gesture set (`zip gestures/<name>`): the examples and the trained model in one.
   - and the model's name in Ollama, so we can ask it in Chat.
2. **The card**, filled in from [`model-card-template.md`](model-card-template.md): what you did, **why** (the choices: which data, which rule, which model, when you stopped), the numbers before and after, one honest failure, and **the larger project**: who it is for, where this model will live (a local web app, a patch, a printer, a gallery wall), what it does there, and what a person still has to check.
3. **A three-minute demo:** the model working, live, on something it hasn't seen. Show the before next to the after, and say what your examples changed.

## Working as three

Every member cleans, records or writes some of the examples: that is where the model's character comes from, and everyone should feel it. Beyond that, one way to share the rest:

- **data:** finding the source, its license, the rule you clean or label by, the spreadsheet;
- **training and testing:** the runs, the checks, the numbers, the next set of rows;
- **project:** the larger idea, the card, the demo.

Say on the card who did what.

## What to look for (for the class discussion, or grading)

- **It trains, and you can show what training changed:** the same test before and after, with numbers.
- **The why is clear:** each choice on the card has a reason, and the reasons come from what you saw happen.
- **Use, steer and train are kept apart:** the card says which parts of the project are which.
- **Honest notes:** where it fails, invents, or learned something you didn't mean. A clear account of a failure is worth as much as a success.
- **Data handled with care:** every source and license is on the card; no one's private information; anyone recorded agreed.
- **The larger project is real:** someone could build it, and the model is a working part of it, not a decoration.

## Notes for the teacher

- Before class, run each demo's **Reproduce it** on a class Mac: it downloads everything, and the numbers show the Mac is set up. A checklist is at the end of [`briefs/README.md`](briefs/README.md).
- Check every Mac with `npm run doctor`. Training needs Python (`uv sync --project python`, from the README).
- On a 16GB Mac, Chat and training don't run at the same time: training stops the Ollama models to free memory, and Chat loads them again after. The gallery demo trains SmolLM2-1.7B at batch 1 for this reason.
- Exporting a 360M model takes about 1GB, a 1.7B model about 5GB while it works. Remove old exports on Adapters between runs if disks are tight; `trash` moves things to the Trash, so empty it too.
- The camera and microphone were not tried with real devices when the demos were tested: check them in Chrome on the class Macs first.
