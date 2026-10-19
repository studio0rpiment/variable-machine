# Variable Machine

A localhost instrument for changing small language models on an Apple Silicon Mac: swap models, swap weights, author training data, train, merge, prefer. Every GUI action composes a real command and echoes it into the terminal docked at the bottom of the page before it runs. The terminal and the GUI are two views of one event stream.

The floor is a 16GB Apple Silicon Mac on macOS 14+. Bigger machines just go faster.

## Install

1. Install [Ollama](https://ollama.com) and open it.
2. Install `uv`: `curl -LsSf https://astral.sh/uv/install.sh | sh`
3. Install Node 22 or newer (directly, or with `fnm` / `nvm`; `.nvmrc` says 22).
4. `git clone … && cd variable-machine && npm install && uv sync --project python`
5. `ollama pull qwen3:4b` (the default chat model and the data generator) and `ollama pull smollm2:360m` (the same family as the default training base)
6. `npm run dev` opens http://localhost:4817

`npm run dev` rebuilds the UI on save (reload the page to see it) and restarts the helper on save. Set `VARIABLE_MACHINE_PORT` to use another port, or `VARIABLE_MACHINE_OPEN=0` to stop it opening a browser.

## Layout

```
helper/     Node + TypeScript (shared/ holds types and pure functions the UI imports too). One process on 127.0.0.1:4817: serves ui/dist, proxies /ollama/* to Ollama,
            carries the /ws event stream, runs the terminal, watches workspace/.
ui/         React + Vite + TypeScript. Panels over workspace folders; xterm.js terminal always docked.
workspace/  The state: plain folders and JSON manifests (see workspace/README.md). No database.
python/     uv project with mlx-lm. Only ever run by the helper, as `uv run --project python …`.
```

## Terminal

It isn't a shell and it isn't a pty. The helper splits each line into words, checks them against an allowlist, and spawns the real program without a shell, so nothing is interpolated. Anything else prints `not allowed here`.

```
ollama list | show <model> | pull <model> | rm <model>
ollama create <name> -f workspace/modelfiles/<name>.Modelfile [-q q4_K_M]
ollama run-once <model> [--system "<text>"] [--no-think] [--format json|<schema>] <prompt…>
data new <name>
data import dolly <name> [--limit 300] [--category <c>] [--seed 0]
data validate | count <name>
data split <name> [--valid 0.1] [--seed 0]
data append <name> '<row json>' [--source <model>]
train <adapter> --data <dataset> [--base <hf id>] [--type lora|dora|full] [--rank 8] [--layers 8] [--lr 1e-4] [--iters 200] [--batch 4] [--max-seq 1024]
fuse <adapter> [--name <fused>]
register <fused> [--name <model>] [--quantize int8|int4|none] [--system "<text>"]
export <adapter> [--name <model>] [--quantize int8|int4|none]      fuse + register in one go
ls | cat | head | tail | wc <path>        inside workspace/ only
status   help   clear                     ctrl-c stops what is running
```

Lines typed while a command runs wait their turn. Commands the GUI runs are echoed with `▸`, and typed ones with `›`. Both go through the same parser and allowlist.

`list` and `show` run the real CLI. `pull`, `rm`, `create` and `run-once` go through Ollama's API, so the helper can turn their progress into events the GUI draws as well. The terminal line is still the CLI form, which does the same thing. `create` prints, dimmed, the `/api/create` JSON it sent. A Modelfile whose FROM or ADAPTER points at a file needs a blob upload, so for those the real `ollama create` runs instead.

## Milestones

- [x] **1. Helper, UI shell, terminal, Ollama proxy, Chat.** Two models answer one prompt side by side. Each call is echoed as `ollama run-once …` and appended to `workspace/chat/<date>.jsonl`.
- [x] **2. Models + Modelfile.** Two inventories (runs on: Ollama; trains on: Hugging Face) and a curated library. Pulls show progress in the card and the terminal. The licenses shown are the ones each model actually carries. The Modelfile editor marks which lines are weights, and `ollama create` turns the text into a model you can chat with.
- [x] **3. Data.** Datasets are train/valid pairs of chat-format JSONL in `workspace/data/<name>/`. Dolly imports with the license read from Hugging Face at import time. A dataset can be validated, split (seeded) and token-counted (an estimate). A model writes candidate rows that you edit, keep or reject, and each kept row is a `data append`. The manifest records every source with its license, row count and the commands that touched it.
- [x] **4. Train → export → chat.** The Train panel shows the exact `mlx_lm.lora` command, runs it (stopping Ollama's loaded models first to free memory) and plots loss live. Every run keeps `config.yaml`, `command.txt`, `log.txt`, `loss.jsonl` and `manifest.json` in `workspace/runs/<time>-<name>/`. Export folds the adapter into its base (`mlx_lm.fuse`) and imports the result into Ollama, where it chats next to the untouched base. On an M1 Pro (32GB), 200 iterations of LoRA on SmolLM2-360M over 305 rows took 141 seconds; export took under 10.
- [ ] 5. Merge
- [ ] 6. Prefer (optional)
- [ ] 7. Doctor, examples, zip/unzip

## Notes from building it

- **qwen2.5:3b is not open-license.** It carries the Qwen Research License (non-commercial), so qwen3:4b (Apache 2.0) is the default chat model.
- **`think: false` doesn't stop qwen3:4b reasoning.** It writes the reasoning into the answer instead. The Data generator asks for structured output (a JSON schema with exactly N rows), which keeps the reasoning out and the rows clean.
- **A pull doesn't stop when the app stops listening.** Ollama finishes the download on its own.
- **No GGUF step.** The plan's route (mlx-lm `--export-gguf`, then `ollama create -q q4_K_M`) doesn't work with Ollama 0.40.6, for two reasons:
  - The GGUF mlx-lm writes fails to load: "invalid gguf type for tokenizer.ggml.token_type".
  - Ollama only quantizes safetensors imports, and only to `int4`, `int8`, `nvfp4`, `mxfp4` or `mxfp8`.

  So `register` imports the fused safetensors folder directly (`FROM ../fused/<name>`). It uses `int8` by default, because Ollama's own smollm2 is f16 and that keeps before/after comparisons fair. The chain is data → run → adapter → fused → Ollama model.
- **Imported models get their chat template from the Modelfile.** `register` writes SmolLM2's ChatML template and stop tokens into it.

## How it stays honest

- **One stream.** The helper sends `status`, `terminal.output`, `workspace.changed` and `heartbeat` events over `/ws` (types in `helper/src/events.ts`, mirrored in `ui/src/lib/events.ts`).
- **The proxy is the witness.** The Chat panel calls Ollama's `/api/chat` through `/ollama/*`. The proxy echoes each call as the `ollama run-once` line that would do the same thing, then logs the finished exchange. A stopped answer is shown but not logged.
- **Event-driven.** The only timer is the 15s WebSocket heartbeat, because a half-open socket produces no event. When the socket drops, the page reconnects on focus, on coming back online, or on a click. It never polls.
- **Localhost only.** The helper binds to 127.0.0.1 and refuses HTTP requests and WebSocket upgrades from any other origin. Its terminal runs commands, so no other site may talk to it.

## Licenses

Code: MIT. The hand-drawn icons (`ui/src/icons/`, favicon) are *hand-icons by Kevin Patton*, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Models, weights and data used by the app are restricted to open licenses that allow commercial use (Apache 2.0 / MIT for models; Apache 2.0, CC BY-SA, ODC-BY for data).
