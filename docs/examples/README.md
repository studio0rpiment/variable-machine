# Four worked examples

One example for each way Variable Machine changes a model. Each was made through the app's own commands, so every step below is a line you can type in the terminal (or the button that types it for you). Each folder keeps the real records: the manifests, the commands, the loss numbers and some chat answers. The motion graphics are drawn from these files.

| | way | model | starts from | you can chat with it as |
|---|---|---|---|---|
| 1 | **words** (Modelfile, no weights change) | studio crit | `smollm2:1.7b` | `studio-crit` |
| 2 | **examples** (Train, LoRA) | colour → hex | SmolLM2-360M | `colour-hex-3k-360m` |
| 3 | **taste** (Prefer, DPO) | haiku that keep 5-7-5 | SmolLM2-360M | `haiku-575-dpo` |
| 4 | **blend** (Merge) | colour + haiku | both of the above | `colour-x-haiku-50`, `colour-x-haiku-75` |

Put each one next to the model it started from in Chat and ask both the same thing.

---

## 1 · Studio crit: change it with words

**What it shows:** a Modelfile changes how a model answers without touching its weights. The `FROM` line is the only line that names weights; `SYSTEM`, `PARAMETER` and `MESSAGE` are instructions placed in front of the same model.

**The Modelfile** ([studio-crit.Modelfile](1-studio-crit/studio-crit.Modelfile)): every answer is exactly three lines, *What works / What doesn't / Try next*, at temperature 0.3, with one example exchange.

**Commands:**
```
ollama pull smollm2:1.7b
ollama create studio-crit -f workspace/modelfiles/studio-crit.Modelfile
```

**Before and after** ("I built a chair out of cardboard tubes…", in [chat.json](1-studio-crit/chat.json)):
- `smollm2:1.7b`: a five-step how-to list about glue, sandpaper and paint, 318 tokens.
- `studio-crit`: three lines, 61 tokens. *What works: a sturdy cardboard chair that holds your weight. What doesn't: the brown color and wobbly wobble… Try next: paint the chair…*

---

## 2 · Colour → hex: change it with examples

**What it shows:** training on examples teaches a new habit. Describe a colour in words and the model answers with a hex code, and nothing else.

**Data:** 3,000 colours sampled from [burkelibbey/colors](https://huggingface.co/datasets/burkelibbey/colors) (MIT), each a description ("Light mustard yellow: a vibrant shade of yellow…") and its hex code (`#ffcc40`).

**Commands:**
```
data raw jsonl https://huggingface.co/datasets/burkelibbey/colors/resolve/main/colors.jsonl colors --license "MIT"
data template raw/colors colour-hex-3k --question "{description}" --answer "{color}" --limit 3000 --seed 0
data split colour-hex-3k --valid 0.05
train colour-hex-3k-360m --data colour-hex-3k --base HuggingFaceTB/SmolLM2-360M-Instruct --rank 16 --layers 16 --iters 1500
export colour-hex-3k-360m
```

**Loss:** the held-out loss fell from 5.67 to about 1.0 ([run/loss.jsonl](2-colour-hex/run/loss.jsonl)).

**How close are the colours?** On 60 held-out descriptions its answer was on average 44.6 away from the true colour (distance in RGB, where 441 is black to white). A random guess is 167.8 away. So it has learned roughly where colours are, not exactly ([eval.json](2-colour-hex/eval.json)). Some answers have the right shape and the wrong fact: "a deep, dusty plum" once came back beige.

**Before and after** ("The green of a tennis ball at dusk."):
- `smollm2:360m`: a paragraph about the scene.
- `colour-hex-3k-360m`: `#55a033` (asked again, `#809030`: sampling varies).

**What went wrong first:** the first run used the Train tab's default base, which on a 32GB Mac is the larger SmolLM2-1.7B. The name said 360M, but it wasn't, and it couldn't be blended with the 360M haiku adapter. Naming the base (`--base …360M…`) fixed it. A 1,000-row, 600-step run on 360M was further off (54.8), so this one has more examples and more steps.

---

## 3 · Haiku that keep 5-7-5: change it with taste

**What it shows:** preference tuning (DPO) teaches a model to lean toward one kind of answer over another. Here the preference is form: three lines of 5, 7 and 5 syllables.

**Making the pairs ourselves:** for each of 108 topics an artist might write about ("a kiln cooling overnight", "a red thread", "a paper lantern"):
1. `smollm2:360m` writes a haiku. This is the base, as a student would hear it.
2. `qwen3:4b` writes one too, asked for 5-7-5, up to four tries.
3. A small rule scores each: three lines, then a syllable count per line ([tools/make_pairs.py](3-haiku-dpo/tools/make_pairs.py)).
4. When qwen3's haiku scores 4/4 and the base's doesn't, the pair goes in: chosen = qwen3's, rejected = the base's.

44 pairs passed (37 to train on, 7 held out). Every pair went in with `data append`, so the terminal shows each one. The set is also in `workspace/examples/data/haiku-575` (CC0).

**Commands:**
```
data new haiku-575 --format preference
ollama run-once smollm2:360m "Write a haiku about a red thread."
ollama run-once qwen3:4b --no-think --format '<three lines>' "Write a haiku about a red thread. Line 1 has 5 syllables, line 2 has 7, line 3 has 5. …"
data append haiku-575 '{"prompt": …, "chosen": …, "rejected": …}' --source "…by the 5-7-5 rule"
data split haiku-575 --valid 0.15
prefer haiku-575-dpo --data haiku-575 --rank 16 --layers 16 --lr 5e-5 --iters 150 --beta 0.1 --sft 1
export haiku-575-dpo
```

**What went wrong first, and why it's worth seeing:** plain DPO ([collapsed-run](3-haiku-dpo/collapsed-run/)) learned the easiest difference between the pairs. The chosen haiku average 77 characters and the rejected ones 130, so the easiest lesson was "write less". Its answers fell apart into fragments: *keyboards keyboard keyboards keys keys keystrokes keys…* That is what over-optimising a preference looks like. Gentler settings didn't move the preference at all. The fix was a new option, `--sft 1`, which also pulls the model toward actually writing the chosen haiku while the preference moves (DPO with a likelihood term, as in RPO, Pang et al. 2024).

**Before and after** (12 new topics, scored out of 4; [eval.json](3-haiku-dpo/eval.json)):

| | three lines | exact 5-7-5 | mean score |
|---|---|---|---|
| `smollm2:360m` | 10/12 | 1/12 | 1.33 |
| plain DPO (collapsed) | 2/12 | 0/12 | 0.17 |
| `haiku-575-dpo` (two samplings) | 12/12 | 1–2/12 | 1.83–2.42 |

*"Snow-covered fox steps / Silent as a shadow's sigh / Leaves a trail of frost"*: `haiku-575-dpo`, 4/4.

---

## 4 · Colour + haiku: blend

**What it shows:** two adapters trained on the same base can be blended into one model. `t` is how much of each: 0 is all A, 1 is all B.

**How the blend is made:** each layer's change is the product of two small matrices. Averaging those matrices separately would mix A's half with B's half, a change neither adapter learned. So merge stacks the two adapters side by side, with weights 1 − t and t, and the result is exactly (1 − t)·A + t·B. The merged adapter has rank 16 + 16 = 32. The script prints a check on one layer: *largest difference 4.66e-10*.

**Commands:**
```
merge colour-x-haiku-50 --a colour-hex-3k-360m --b haiku-575-dpo --t 0.5
export colour-x-haiku-50
merge colour-x-haiku-75 --a colour-hex-3k-360m --b haiku-575-dpo --t 0.75
export colour-x-haiku-75
```

**What it does** ([chat.json](4-merge/chat.json)):

| | "The green of a tennis ball at dusk." | "Write a haiku about a paper lantern." |
|---|---|---|
| `colour-x-haiku-50` (half and half) | `#558833` | `#97a0c0`: a hex code, not a haiku |
| `colour-x-haiku-75` (¾ haiku) | `#50b040` | *Silent lantern glows / In the quiet garden's embrace / Glowing light on earth* |

Half the weights is not half the behaviour. The colour habit is strong and narrow (1,500 steps, one kind of answer). The haiku preference is a gentler change. At t = 0.5 the colour habit wins everything. At t = 0.75 the model does both: colour descriptions get hex codes, haiku requests get haiku, and a plain question ("What colour is the sea in winter?") gets ordinary prose. Where one character turns into the other is the thing to listen for.
