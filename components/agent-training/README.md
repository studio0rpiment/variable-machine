# agent-training: models for a multi-agent studio

Everything that belonged only to the Projects card "Models for a multi-agent studio", moved out of Variable Machine on 2026-11-19 to go into the agent harness app (`~/__DEV/agent-harness`). Variable Machine builds and runs without this folder: nothing in `helper/`, `ui/` or `scripts/` imports from it.

## What it is

A **reader model** is a small model with one job: it reads one kind of text (a message, an invoice, a build log, a package update, a page of credits, a list of deadlines) and returns the same fields every time, as JSON. In a multi-agent studio every agent runs on qwen3:4b; the agents' scripts call the readers, and the agents never train them. One reader is trained per job and named `studio-<reader>` (`studio-mail`, `studio-invoice`, `studio-log`, `studio-update`, `studio-facts`, `studio-status`).

The card walked a student through training one reader in Variable Machine:

| # | Tab | Command |
|---|---|---|
| 1 | Data | `data new studio-mail` |
| 2 | Data → drafts | `data draft studio-mail --from uploads/<notes>.txt --fields sender,work,ask,deadline --count 200 --model qwen3:4b`, then keep, edit or reject each draft (done at 150 kept) |
| 3 | Data | `data append studio-mail '<row json>' --source corrections` (the lead's corrections) |
| 4 | Data | `data split studio-mail --valid 0.15`, `data validate studio-mail` |
| 5 | Train | `train studio-mail-360m --data studio-mail --base HuggingFaceTB/SmolLM2-360M-Instruct --max-seq 512` |
| 6 | Adapters | `export studio-mail-360m --name studio-mail` |
| 7 | Chat | `reader check studio-mail studio-mail`: the reader against qwen3:4b given a prompt, on the rows set aside |

Checked 2026-10-31 on made-up studio mail only: a 360M reader trained on 39 rows in about 2 minutes got 95% of fields right against qwen3:4b's 85%, at 0.3 s a row against 1.8 s. A reader for real mail needs real rows.

## Files

| File | What it is | Where it was |
|---|---|---|
| `helper/reader.ts` | the `reader check` command: reads every row set aside with the reader and with the stand-in (qwen3:4b held to the fields by a JSON schema), scores both, saves `check-<model>.json` (with `reader: true`) in the set's folder | `helper/src/reader.ts` (moved with `git mv`, history kept) |
| `ui/readers.ts` | the fields each reader returns, by set name (`studio-mail` → `sender,work,ask,deadline`); filled the Data tab's drafts and the card's command | `ui/src/lib/readers.ts` (moved with `git mv`) |
| `ui/studio-card.tsx` | the card's code, kept whole but not compiled: what it read from the workspace, its seven steps, their commands, done tests and walkthrough notes | cut from `ui/src/components/ProjectsPanel.tsx` |
| `text/projects-studio.md` | the card's words, every `projects.studio.*` key | cut from `ui/src/text/projects.md` |
| `docs/test-guide.md` | the card's step-by-step test | section 6 of `docs/projects-test-guide.md` |
| `docs/variable-machine-readme.md` | what Variable Machine's README and site said about the card, word for word | `README.md`, `site/index.html` |

Not here, because they were never in the repository: the made-up studio mail, the studio's notes and the trained readers. They live in a workspace (`workspace/data/studio-*`, `workspace/uploads/*notes*`, Ollama's `studio-*` models) on the machine that trained them; the studio Hermes build in the agent harness app trained three readers that way.

## What it depends on

**Programs:** Ollama (serves qwen3:4b, the writer and the stand-in, and the exported readers) and MLX through Variable Machine's Python environment (`python/.venv`, LoRA training of SmolLM2-360M-Instruct). Apple Silicon Mac.

**Variable Machine:** v0.3.0 or later; this folder was cut from commit d9cb8fc. These general parts stay in Variable Machine, and the component uses them as they are:

- **Helper core**, imported by `helper/reader.ts`: `config.ts` (`WORKSPACE`), `hub.ts` (`print`), `ollama.ts` (`ollamaPost`), `run.ts` (`setRunning`, `write`), `shared/manifest.ts` (`DatasetManifest`). The terminal's router is `helper/src/terminal.ts`.
- **Helper commands** the card's steps run: `data new`, `data draft … --fields` (`helper/src/drafts.ts`: with `--fields`, each draft is a made-up text and its fields as JSON), `data append`, `data reject`, `data split`, `data validate`, `train`, `export --name`.
- **Routes:** the terminal WebSocket the commands go through, `POST /api/workspace/upload` (the studio's notes, a .txt or .md, for `data draft --from uploads/…`), and the workspace reads `ui/src/lib/workspace.ts` makes (`readManifests`, `listDir`, `readFile`).
- **Tabs:** Data (with drafts, `ui/src/components/DataDrafts.tsx`), Train, Adapters, Chat, and the guide bar that shows a step's walkthrough notes (`notes`, `fill` on a step in `ProjectsPanel.tsx`).
- **In `studio-card.tsx`, names from `ProjectsPanel.tsx`:** `Have` (what the workspace holds), `Project`, `say` (`ui/src/text/say.ts`), `joinWords` (`@shared/quote`), `last`, `kept` (rows kept from drafts), `KEEP` (the card's target was 150), `SMALL` (`HuggingFaceTB/SmolLM2-360M-Instruct`).

## Moving it into the agent harness app

Kevin's call; nothing has been copied yet.

1. Copy the folder: `cp -R ~/__DEV/retension/components/agent-training ~/__DEV/agent-harness/agent-training`.
2. Decide where `reader check` runs:
   - **In Variable Machine** (simplest): copy `helper/reader.ts` back to Variable Machine's `helper/src/reader.ts`, and in `helper/src/terminal.ts` put back `import { readerCommand } from './reader.ts'`, the help line `reader check <model> <dataset> [--against qwen3:4b|none]` and `if (cmd === 'reader') return readerCommand(args)`. The harness then trains readers in Variable Machine, as the Hermes build did.
   - **In the harness**: replace the five helper-core imports at the top of `reader.ts` with the harness's own (a workspace folder, a print to its log, a POST to Ollama's `/api/chat`, a running flag). The rest only needs Node and Ollama.
3. Rebuild the card's steps in the harness's own UI from `ui/studio-card.tsx` and `text/projects-studio.md`; each step's command still runs in Variable Machine's terminal.
4. Run the test in `docs/test-guide.md` on `studio-mail`.
5. Once it is in the harness, delete this folder from Variable Machine (to the Trash).
