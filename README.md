# retension

A localhost instrument for changing small language models on an Apple Silicon Mac: swap models, swap weights, author training data, train, merge, prefer. Every GUI action composes a real command and echoes it into the terminal docked at the bottom of the page before it runs. The terminal and the GUI are two views of one event stream.

The floor is a 16GB Apple Silicon Mac on macOS 14+. Bigger machines just go faster.

## Install

1. Install [Ollama](https://ollama.com) and open it.
2. Install `uv`: `curl -LsSf https://astral.sh/uv/install.sh | sh`
3. Install Node 22 or newer (directly, or with `fnm` / `nvm`; `.nvmrc` says 22).
4. `git clone … && cd retension && npm install && uv sync --project python`
5. `ollama pull qwen3:4b` (the default chat model and the data generator) and `ollama pull smollm2:360m` (the same family as the default training base)
6. `npm run dev` opens http://localhost:4817

`npm run dev` rebuilds the UI on save (reload the page to see it) and restarts the helper on save. Set `RETENSION_PORT` to use another port, or `RETENSION_OPEN=0` to stop it opening a browser.

## Layout

```
helper/     Node + TypeScript. One process on 127.0.0.1:4817: serves ui/dist, proxies /ollama/* to Ollama,
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
ollama run-once <model> [--system "<text>"] <prompt…>
ls | cat | head | tail | wc <path>        inside workspace/ only
status   help   clear                     ctrl-c stops what is running
```

Lines typed while a command runs wait their turn. Commands the GUI runs are echoed with `▸`, and typed ones with `›`. Both go through the same parser and allowlist.

`list` and `show` run the real CLI. `pull`, `rm`, `create` and `run-once` go through Ollama's API, so the helper can turn their progress into events the GUI draws as well. The terminal line is still the CLI form, which does the same thing. `create` prints, dimmed, the `/api/create` JSON it sent. A Modelfile whose FROM or ADAPTER points at a file needs a blob upload, so for those the real `ollama create` runs instead.

## Milestones

- [x] **1. Helper, UI shell, terminal, Ollama proxy, Chat.** Two models answer one prompt side by side. Each call is echoed as `ollama run-once …` and appended to `workspace/chat/<date>.jsonl`.
- [x] **2. Models + Modelfile.** Two inventories (runs on: Ollama; trains on: Hugging Face) and a curated library. Pulls show progress in the card and the terminal. The licenses shown are the ones each model actually carries. The Modelfile editor marks which lines are weights, and `ollama create` turns the text into a model you can chat with.
- [ ] 3. Data
- [ ] 4. Train → fuse/export → register
- [ ] 5. Merge
- [ ] 6. Prefer (optional)
- [ ] 7. Doctor, examples, zip/unzip

## How it stays honest

- **One stream.** The helper sends `status`, `terminal.output`, `workspace.changed` and `heartbeat` events over `/ws` (types in `helper/src/events.ts`, mirrored in `ui/src/lib/events.ts`).
- **The proxy is the witness.** The Chat panel calls Ollama's `/api/chat` through `/ollama/*`. The proxy echoes each call as the `ollama run-once` line that would do the same thing, then logs the finished exchange. A stopped answer is shown but not logged.
- **Event-driven.** The only timer is the 15s WebSocket heartbeat, because a half-open socket produces no event. When the socket drops, the page reconnects on focus, on coming back online, or on a click. It never polls.
- **Localhost only.** The helper binds to 127.0.0.1 and refuses HTTP requests and WebSocket upgrades from any other origin. Its terminal runs commands, so no other site may talk to it.

## Licenses

Code: MIT. The hand-drawn icons (`ui/src/icons/`, favicon) are *hand-icons by Kevin Patton*, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Models, weights and data used by the app are restricted to open licenses that allow commercial use (Apache 2.0 / MIT for models; Apache 2.0, CC BY-SA, ODC-BY for data).
