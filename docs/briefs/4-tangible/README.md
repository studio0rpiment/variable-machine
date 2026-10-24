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
