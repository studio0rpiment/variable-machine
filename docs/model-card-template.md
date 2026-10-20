# Model card: <your model's name>

**By:** <name> · **Date:** <date> · **Final model in Ollama:** `<name>` · **Base:** SmolLM2-360M-Instruct

## The concept

<One or two sentences: what character or job your model has, and how you would know it in one answer.>

## The five probes

1. <the one the concept is made for>
2. <a little off to the side>
3. <something it can't know>
4. <one that invites a long answer>
5. <a strange one>

## Stage 2 · Words (Modelfile)

- **Variant:** `<name>` from `smollm2:360m` (and `<name>` from `qwen3:4b`)
- **Instructions (SYSTEM):** "<…>"
- **Temperature:** <…> · open choice: <on/off> · **example:** "<question>" → "<answer>"
- **What words changed:** <…>
- **What they didn't:** <…>
- **Small model vs big model:** <…>

## Stage 3 · Examples (Train)

- **Dataset:** `<name>` · <rows> rows, <n> set aside · **from:** <source> · **license:** <license>
- **Command** (from the terminal): `train <…>`
- **Loss reading** (the sentence under the chart): "<…>" · train <a → b>, valid <a → b>
- **What it learned:** <form, facts, both?>
- **An answer with the right shape and the wrong fact:** "<…>"

## Stage 4 · Taste (Prefer)

- **Preference set:** `<name>` · <pairs> pairs · **"better" meant:** <…>
- **Command:** `prefer <…>`
- **Loss reading:** "<…>" (it starts near 0.69: no preference)
- **What changed compared with the trained model:** <…>
- **Anything it picked up that you didn't mean:** <…>

## Stage 5 · Combination

- **Blends:** `<name>` at t = 0.25 / 0.5 / 0.75 · `merge <…>`
- **Stack:** <Modelfile on top of which model, with which instructions>
- **The one you chose, and why:** <…>

## The five probes, every version

Paste short answers (the first line or two is enough).

| probe | original | words | trained | preferred | final |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

## What surprised you

<One thing each approach did that you didn't expect. A clear failure counts.>

## Data and licenses

<Every dataset you used: where it came from and its license, as Variable Machine recorded it. Anything someone should know before using your model.>

## Files handed in

- `data-<name>.zip`
- `adapters-<name>.zip` (trained) and `adapters-<name>.zip` (preferred)
- `merges-<name>.zip` (if you blended)
