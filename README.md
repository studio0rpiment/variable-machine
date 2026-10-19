# Variable Machine

A localhost instrument for changing small language models on an Apple Silicon Mac. You can:

- swap models and weights;
- write and collect training data;
- train with LoRA;
- merge two adapters;
- tune a model toward the answers you prefer (DPO);
- share what you made.

Every action in the page composes a real command and echoes it into the terminal docked at the bottom before it runs. The terminal and the page are two views of one event stream, so nothing happens that you can't see as a command, a file or a log line.

The floor is a 16GB Apple Silicon Mac on macOS 14 or later. Bigger machines just go faster.

## Install

1. Install [Ollama](https://ollama.com) and open it.
2. Install `uv`: `curl -LsSf https://astral.sh/uv/install.sh | sh`
3. Install Node 22 or newer (directly, or with `fnm` / `nvm`; `.nvmrc` says 22).
4. `git clone https://github.com/studio0rpiment/variable-machine && cd variable-machine && npm install && uv sync --project python`
5. `ollama pull qwen3:4b` and `ollama pull smollm2:360m` (the Models panel can pull them too)
6. `npm run doctor` checks all of the above; `npm run dev` opens http://localhost:4817

The first training run downloads its base model into `workspace/hf`: about 700MB for SmolLM2-360M, 3.4GB for the 1.7B. The base kit is about 8GB on disk.

`npm run dev` rebuilds the page on save (reload to see it) and restarts the helper on save. `VARIABLE_MACHINE_PORT` picks another port and `VARIABLE_MACHINE_OPEN=0` stops it opening a browser.

## The panels, in the order you'd use them

- **Models.** There are two inventories: what runs (Ollama models) and what trains (Hugging Face bases). Each card shows the license the model actually carries, read from Ollama, and flags any that aren't open-license. The curated library pulls with progress in the card and in the terminal.
- **Modelfile.** Start from any model, edit the text and create a variant. A column beside the text marks which lines are weights (FROM, ADAPTER) and which only travel with them (SYSTEM, PARAMETER, TEMPLATE…).
- **Data.** Datasets live in `workspace/data/<name>/` as train and valid JSONL plus a manifest. You can:
  - import Dolly, OpenAssistant (oasst1), the Apache-2.0 subsets of SmolTalk, or the examples, with each license read from Hugging Face at import;
  - fetch raw material (a Project Gutenberg book, or a CSV or TXT with its stated license) and have a model write rows from a passage;
  - validate, split and count rows;
  - curate generated rows by keeping, editing or rejecting each one;
  - build preference sets from the chat log.
- **Train.** LoRA, DoRA or full fine-tuning on a Hugging Face base, with tier defaults (§11), the exact `mlx_lm.lora` command, and loss plotted live.
- **Prefer.** DPO on a base or a fused model, from a preference set. It shows the loss and a held-out before/after check.
- **Adapters.** What training made. Export folds an adapter into its base and imports the result into Ollama, ready to chat with next to the untouched base.
- **Merge.** Blend two compatible adapters: out = (1 − t)·A + t·B.
- **Chat.** Two to four models side by side, one prompt, every answer streaming. Each exchange is echoed as `ollama run-once …` and logged to `workspace/chat/<date>.jsonl`, where the Data panel can mine it for preference pairs.
- **Share.** Zip any artifact's folder, download it, and unzip one someone sent you back into the right place.

## Layout

```
helper/     Node + TypeScript. One process on 127.0.0.1:4817: serves ui/dist, proxies /ollama/* to Ollama,
            carries the /ws event stream, runs the terminal and the recipes, watches workspace/.
            helper/src/shared/ holds types and pure functions the UI imports too.
ui/         React + Vite + TypeScript. One panel per workflow step; xterm.js terminal always docked.
workspace/  The state: plain folders and JSON manifests (see workspace/README.md). No database.
            workspace/examples/ is tracked in git; everything else in workspace/ stays local.
python/     uv project with mlx-lm, plus two scripts: merge_adapters.py and dpo.py. Only the helper runs them.
```

## Terminal

It isn't a shell and it isn't a pty. The helper splits each line into words, checks them against an allowlist, and spawns the real program without a shell, so nothing is interpolated. Anything else prints `not allowed here`. Type `help` for the full list.

```
ollama list | show | pull | rm <model>
ollama create <name> -f workspace/modelfiles/<name>.Modelfile [-q int8]
ollama run-once <model> [--system "<text>"] [--no-think] [--format json|<schema>] <prompt…>
data new <name> [--format chat|preference]
data import dolly|oasst1 <name> [--limit 300]
data import smoltalk <name> --subset smol-magpie-ultra|smol-constraints|smol-rewrite|smol-summarize
data import example <example> <name>
data raw gutenberg <book number> <name>
data raw csv|txt <url> <name> --license "<what the source states>"
data validate | count <name>
data split <name> [--valid 0.1] [--seed 0]
data append <name> '<row json>' [--source <model>] [--from raw/<name>]
train <adapter> --data <dataset> [--base <hf id>] [--type lora|dora|full] [--rank 8] [--layers 8] [--lr 1e-4] [--iters 200] [--batch 4] [--max-seq 1024]
prefer <adapter> --data <preference set> [--model <hf id|workspace/fused/NAME>] [--beta 0.1] [--iters 100] [--lr 2e-5]
merge <name> --a <adapter> --b <adapter> [--t 0.5]
fuse <adapter|merge> [--name <fused>]
register <fused> [--name <model>] [--quantize int8|int4|none]
export <adapter|merge> [--name <model>] [--quantize int8|int4|none]      fuse + register in one go
zip <data|adapters|merges|runs|fused>/<name>
unzip <file.zip>
ls | cat | head | tail | wc <path>        inside workspace/ only
status   doctor   help   clear            ctrl-c stops what is running
```

Lines typed while a command runs wait their turn. The page sends the same lines through the same parser: they're echoed with `▸`, and typed ones with `›`.

## Milestones

All seven milestones in the plan are built and were checked in the browser on an M1 Pro (32GB):

1. **Helper, terminal, Chat.** Two models stream side by side. Each call shows as `ollama run-once …`, and the theme toggle flips everything, including xterm.
2. **Models and Modelfile.** Pulling smollm2:360m shows progress in both views. An edited Modelfile created a variant that chats.
3. **Data.** Dolly imported (license read from Hugging Face), then validated and split. qwen3:4b generated 10 candidates, 5 were kept, and the manifest records each source with its license.
4. **Train and export.** 200 LoRA iterations on SmolLM2-360M over 305 rows took 141 seconds, with loss plotted live, and export took under 10 seconds. The run folder keeps its config, command, log, loss and manifest. The result chats next to its base.
5. **Merge.** Two adapters merged at t = 0.5, then A, B and the merge chatted side by side.
6. **Prefer.** A 40-pair "be concise" preference set was built from chat logs (30 to train, 10 held out). After DPO on SmolLM2-360M:
   - the held-out check went from 7/10 to 8/10;
   - held-out answers shrank from a median of about 800 characters to about 180, with no system prompt.
7. **Doctor, examples, sharing.** `npm run doctor` and `doctor`; CC0 example datasets; zip, download, upload and unzip with checks.

Not verified: the 16GB timings. There was no 16GB machine to test on, and a base M1 has fewer GPU cores than an M1 Pro.

## How it stays honest

- **One stream.** The helper sends `status`, `terminal.output`, `pipeline.*`, `workspace.changed`, `ollama.*` and `heartbeat` events over `/ws` (`helper/src/shared/events.ts`).
- **The proxy is the witness.** Chat calls go through `/ollama/*`. The proxy echoes each one as the `ollama run-once` line that would do the same thing, then logs the finished exchange. A stopped answer is shown but not logged.
- **Every artifact has a manifest:** `name`, `kind`, `created`, `license`, `inputs` (what it was made from) and `command` (what made it). Follow `inputs` from a model back to its run, adapter, data and sources.
- **Event-driven.** There are two kinds of timer in the code, and each has a comment saying why:
  - the 15s WebSocket heartbeat, because a half-open socket produces no event;
  - timeouts on network checks in `doctor`, so a request that never answers can't hang it.

  When the socket drops, the page reconnects on focus, on coming back online, or on a click. Nothing polls.
- **Localhost only.** The helper binds to 127.0.0.1 and refuses HTTP requests and WebSocket upgrades from any other origin. Its terminal runs commands, so no other site may talk to it.

## Where it differs from the plan, and why

Each of these was checked against the installed tools (plan §13) on 2026-10-18 and 2026-10-19:

- **qwen2.5:3b is not open-license.** It carries the Qwen Research License (non-commercial), so qwen3:4b (Apache 2.0) is the default chat model, and qwen2.5:1.5b (Apache 2.0) is in the library.
- **No GGUF step.** With Ollama 0.40.6:
  - the GGUF that `mlx_lm.fuse --export-gguf` writes fails to load ("invalid gguf type for tokenizer.ggml.token_type");
  - Ollama won't quantize a GGUF on import;
  - safetensors imports quantize only to `int4`, `int8`, `nvfp4`, `mxfp4` or `mxfp8`.

  So `register` imports the fused safetensors folder directly, with `int8` as the default. Ollama's own smollm2 is f16, and int8 keeps before/after comparisons fair. The chain is data → run → adapter → fused → Ollama model. `register` writes SmolLM2's chat template into the Modelfile, because imports don't bring one.
- **DPO is our own script, not mlx-tune.** mlx-tune 0.6 has a DPOTrainer, but it's a Python API rather than a command, and it brings about 80 more packages (mlx-vlm, mlx-audio, datasets, pandas, opencv). `python/variable_machine/dpo.py` is about 200 lines. It computes the reference log-probabilities once, before adding LoRA layers, so no second model is held in memory. On learning rate: at 5e-5 some answers collapsed to a few words ("To bake bread"), which is what over-optimising a preference looks like. The default is 2e-5.
- **`think: false` doesn't stop qwen3:4b reasoning.** It writes the reasoning into the answer. The Data generator asks Ollama for structured output (a JSON schema with exactly N rows), which keeps the rows clean.
- **SmolTalk's license is per subset.** Its dataset card declares none in its metadata, and its License section names only the four new subsets as Apache 2.0. The importer offers only those.
- **Raw CSV and TXT sources take the license you read on the source page** (`--license`), recorded "as stated at import". The plan's Open Data DC traffic counts go through this route; the DC dataset itself wasn't fetched while building.
- **A pull doesn't stop when the page stops listening.** Ollama finishes the download on its own, and the terminal says so.
- **What a linear merge averages.** LoRA stores each weight change as a product, `lora_b @ lora_a`. Averaging the factors separately isn't the same as averaging the weight changes. It behaves sensibly here because mlx-lm starts every run from the same seeded initialisation.
- **`pipeline.run` isn't used.** The page sends recipes as command lines (`train …`, `export …`), so typed and clicked runs are literally the same thing.
- **Native code:** there are no node-gyp modules. Vite 8 (rolldown) and tsx (esbuild) ship prebuilt platform binaries, and TypeScript 7 is the native tsc.

## Licenses

Code: MIT. The hand-drawn icons (`ui/src/icons/`, the favicon) are *hand-icons by Kevin Patton*, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The example datasets in `workspace/examples` are CC0. Models, weights and data used by the app are kept to open licenses that allow commercial use. Every artifact's manifest carries the licenses of everything it was made from.
