# Brief 4: making information you can touch — what happened when we tried it

Tried on 2026-10-24 with Variable Machine v0.2 (M1 Pro, 32GB; 16GB-tier training settings). OpenSCAD isn't part of Variable Machine and wasn't installed, so designs were checked with **OpenSCAD's WebAssembly build** (`openscad-wasm-prebuilt` 1.2.0, GPL-2), run from Node: [check-design.mjs](check-design.mjs) renders the code to STL, measures it, and compares it with the printer's bed.

**The idea in one line:** a shop helper that knows your machines (words only), and a model trained on the class's own design library that turns a small table and an encoding into OpenSCAD you can print.

## What we did, step by step

### 1. The shop helper (Modelfile) · 1 minute to make

[shop-helper.Modelfile](shop-helper.Modelfile): the shop's laser cutter (600 × 400 mm bed, cuts up to 6 mm, never PVC), 3D printer (250 × 210 × 220 mm, walls at least 1.2 mm), hours. Ten yes/no questions whose answers follow from those facts ([shop-questions.json](shop-questions.json)):

| base | right of 10 | time |
|---|---|---|
| smollm2:1.7b | 5 (it says "No" to everything) | 3 s for all ten |
| **qwen3:4b** | **10** | 136 s for all ten (it thinks first) |

### 2. The class design library · the class's real work

Four templates a class would write together (bars, stacked layers, a radial chart, a grid of columns on a base), each a short, commented piece of OpenSCAD with the data in a list called `values`, filled with many small tables and differently worded encodings: [make-library.py](make-library.py) → [scad-library.csv](scad-library.csv), 160 rows like

```
Data (ward, trees):
W1, 10
W2, 38 …
Encoding: Columns on a grid, 3 per row, 15 mm square, height = trees (tallest 40 mm), on a 2 mm base.
Write the OpenSCAD.
```

Every library design was itself checked first: a library that teaches broken designs teaches broken designs.

### 3. Train data-to-shape · 2 minutes

```
data import file uploads/scad-library.csv scad-library --license "CC0 (class design library)"
data split scad-library --valid 0.1          144 train · 16 valid · about 139 tokens a row
train data-to-shape-360m --data scad-library --base HuggingFaceTB/SmolLM2-360M-Instruct --iters 200 …
export data-to-shape-360m --name data-to-shape --quantize int8
```

Set-aside loss 1.88 → 0.012.

### 4. Ask for designs, and check them · 3 seconds a design

16 new requests: 12 in the library's encodings with new tables, and 4 encodings no template covers (a wavy ribbon, a staircase, a ring of towers, a hollow box). Each answer rendered and measured:

| | renders | fits the printer | right data and form |
|---|---|---|---|
| data-to-shape (trained, 360M) | 16 / 16 | 15 | library encodings: 10 of 12 · new encodings: 0 of 4 |
| qwen3:4b, words only ([shape-writer-qwen.Modelfile](shape-writer-qwen.Modelfile), no training) | 0 / 16 | 0 | 0: it thought until it ran out of room (700 tokens, then 6,000 on 6 of the requests, 25 minutes) and never wrote the code |

What the trained model does with a new encoding: it picks the nearest of its four templates. The "120 mm ribbon" came back as 14 mm of bars; the "ring of towers" as a 280 mm tower, too tall for the printer. Its answers are in [data-to-shape-answers.md](data-to-shape-answers.md). It learned the class's forms, not how to design.

### 5. Prefer on fabricability: not done, and why

The brief's step 4 (pairs scored by whether they render and fit) has little to work with here: on the library's own encodings 15 of 16 designs already render and fit. Where it fails (new encodings), the problem is the form, which the checker can't see; a person looking at the render can.

## Reproduce it

`VM ›` lines go in Variable Machine's terminal; `$` lines in a Terminal window in the `variable-machine` folder. About 10 minutes, half of it the shop helper thinking.

**Starting over** (only if you've run this before):

```
VM › trash data/scad-library
VM › trash adapters/data-to-shape-360m
VM › trash fused/data-to-shape-360m
```

**1. The shop helper.**

```
$ cp docs/briefs/4-tangible/shop-helper.Modelfile workspace/modelfiles/
VM › ollama create shop-helper -f workspace/modelfiles/shop-helper.Modelfile
$ python3 docs/briefs/4-tangible/ask-shop.py shop-helper
```

Expect: **10 of 10 right**, in about 2 minutes (each answer thinks first).

**2–3. The class library, and data-to-shape.** [make-library.py](make-library.py) writes the library from its four templates; the same seed writes the same 160 rows as [scad-library.csv](scad-library.csv).

```
$ python3 docs/briefs/4-tangible/make-library.py workspace/uploads/scad-library.csv
VM › data import file uploads/scad-library.csv scad-library --license "CC0 (class design library)"
VM › data split scad-library --valid 0.1
VM › train data-to-shape-360m --data scad-library --base HuggingFaceTB/SmolLM2-360M-Instruct --type lora --rank 8 --layers 8 --lr 1e-4 --iters 200 --batch 4
VM › export data-to-shape-360m --name data-to-shape --quantize int8
```

Expect: **144 train · 16 valid**; the set-aside line **1.88 → 0.011 (step 50)**, then flat at about 0.01: the library is very regular, so it learns it in one pass. About 2 minutes.

**4. Ask for 16 new designs, and check them.** [design-requests.jsonl](design-requests.jsonl) holds the 16 requests (12 in the library's encodings with new tables, 4 new encodings).

```
$ npm install --prefix docs/briefs/4-tangible
$ node docs/briefs/4-tangible/ask-designs.mjs data-to-shape
```

Expect, the same every time: **renders 16 of 16**, **fits the printer 15** (the "ring of towers" comes out 356 mm wide), **12 keep the request's numbers**, in about 40 seconds. 10 of the 12 library requests keep their numbers; the 4 new encodings come back as the nearest template (the 120 mm ribbon as a 14 mm wall, the hollow box as one 10 mm wall). Open a few answers from `workspace/outputs/designs-data-to-shape.json` in OpenSCAD and look: whether the form is right is for a person to judge.

To see the untrained comparison (25 minutes, and it never finishes the code):

```
$ cp docs/briefs/4-tangible/shape-writer-qwen.Modelfile workspace/modelfiles/
VM › ollama create shape-writer-qwen -f workspace/modelfiles/shape-writer-qwen.Modelfile
$ node docs/briefs/4-tangible/ask-designs.mjs shape-writer-qwen
```

## The real instructions (rewritten from what happened)

1. **Shop helper:** a Modelfile on **qwen3:4b** with your shop's machines, sizes, materials and rules, one per line. Ask it in Chat. It's right but slow (10–15 s an answer); the smaller models agree with whatever you ask.
2. **Design library, as a class:** agree on 3–6 encodings (bars, layers, …). For each, write one short, commented OpenSCAD template with the data in `values = […]`. Check each renders in OpenSCAD and fits your machines.
3. **Fill the library:** every student adds rows: a small table, an encoding in their own words, and the template filled in. 150+ rows; vary the wording.
4. **Data → your own file**, check, split; **train** on SmolLM2-360M with the defaults; **export** as `data-to-shape`.
5. **Ask it for designs** with new data. Paste each into OpenSCAD, render, check the size against your bed, then export the STL (or DXF for the laser).
6. **Want a new kind of form?** Write its template and 20+ rows of it, and train again: the model only knows the forms in the library.

## What Variable Machine needs, found by doing this

- **A design preview:** render OpenSCAD in the page (its WebAssembly build runs in Node and in browsers), show the object and its size against the shop's beds.
- **The shop's machines as a setting** the checker and the shop helper both read.
- **Export to STL/DXF** from the preview, recorded like any other output.
- **A faster shop helper:** qwen3:4b is right but slow; a Prefer or Train run on the shop's own Q&A for a smaller model would be worth trying.
