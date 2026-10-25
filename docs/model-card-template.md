# Model card: <your model's name>

**Group:** <three names> · **Date:** <date> · **Demo:** <1 public data · 2 gallery · 3 gesture · 4 tangible>
**The model:** `<name in Ollama>` (or gesture set `<name>`) · **Base:** <SmolLM2-360M-Instruct, SmolLM2-1.7B-Instruct, the hand tracker…>
**Zips:** `data-<name>.zip` · `adapters-<name>.zip` (or `gestures-<name>.zip`)

## In one sentence

<What your model does: what goes in, what comes out.>

## The larger project

- **What it is:** <the project this model is a part of, in two or three sentences>
- **Who it is for:** <…>
- **Where the model lives:** <a local web app, a patch in TouchDesigner/Max/Pure Data, a printer, a gallery wall, a notebook…>
- **What it does there:** <the model's job inside the project>
- **What a person still has to check:** <what it gets wrong, and who catches it>

## Use, steer, train

| | in this project |
|---|---|
| **use** (ready-made, nothing changes) | <…> |
| **steer** (instructions, a schema, examples in front of it) | <…> |
| **train** (your examples changed it) | <…> |

## What we did

The commands, in order, copied from the terminal (every run also keeps its own record in `workspace/runs/`).

```
<data import …>
<data split …>
<train …>
<export …>
```

## Why

The choices, and what made you choose them.

- **The data:** <where it came from, and why this source>
- **The rule** you cleaned, labelled or recorded by: <…>
- **How many examples, and which kinds you added** after the first test: <…>
- **The model you started from, and when you stopped training:** <…>

## Before and after

The same test, before you trained and after: the check script's numbers, the gesture grid, the renders that fit, or your own test.

| | before | after | after the added rows |
|---|---|---|---|
| <what you measured> | | | |

Three answers on things it hadn't seen:

| input | before | after |
|---|---|---|
| | | |
| | | |
| | | |

## One honest failure

<Where it fails, invents, or learned something you didn't mean, and what you think causes it.>

## Data and licenses

<Every source you used: where it came from and its license, as Variable Machine recorded it. Anyone whose hands, voice or work is in it, and that they agreed.>

## Who did what

- <name>: <…>
- <name>: <…>
- <name>: <…>
