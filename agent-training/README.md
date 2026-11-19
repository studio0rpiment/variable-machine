# Agent training: models for a multi-agent studio

This folder is the agents card ("models for a multi-agent studio") taken out of Variable Machine whole, so it can be moved to the agent harness (`~/__DEV/agent-harness`). Variable Machine no longer shows the card, runs its command or reads its words. Everything the card had is here, and nothing here is built or run by Variable Machine.

**What it does.** It trains the small models a multi-agent studio calls for one job each. A **reader model** reads one kind of text (a message, an invoice, a build log) and returns the same fields every time, as JSON. The studio's agents run on qwen3:4b and call the readers from their scripts. The card's steps: make a set named `studio-<reader>`, have a model draft rows from the studio's notes, add corrections, set rows aside, train SmolLM2-360M on the rest, export it into Ollama as `studio-<reader>`, then check it against qwen3:4b given a prompt (`reader check`).

## What is in the folder

| Path | What it is | Where it was in Variable Machine |
|---|---|---|
| `ui/card.ts` | The card: its steps, each with its tab, its command (filled in from the workspace), its walkthrough notes and when it is done. Also `readReaderChecks`, which reads the saved checks. | `ui/src/components/ProjectsPanel.tsx` (the `studio` card in `projects()`, its facts, and the reader checks in `readHave`) |
| `ui/readers.ts` | The fields each reader returns, by its set's name (`studio-mail`: sender, work, ask, deadline). | `ui/src/lib/readers.ts`; the Data tab's drafts used it to fill in the fields |
| `helper/reader.ts` | The helper command `reader check <model> <dataset> [--against qwen3:4b\|none] [--limit 100]`. | `helper/src/reader.ts`, dispatched from `helper/src/terminal.ts` |
| `helper/score.ts` | How `reader check` marks an answer: JSON read from the answer, values compared as a person would, the schema the stand-in is held to. No dependencies. | inside `helper/src/reader.ts` |
| `tests/score.test.ts` | Tests for `score.ts`. | new |
| `text/agents.md` | The card's words, every `projects.studio.*` entry. | `ui/src/text/projects.md`, section "Models for a multi-agent studio" |
| `docs/test-guide.md` | The card's step-by-step test. | `docs/projects-test-guide.md`, section 6 |

## What it depends on

- **Ollama**, at `http://127.0.0.1:11434`: qwen3:4b, which drafts the rows and is the stand-in a reader is checked against, and the exported readers.
- **MLX** (mlx-lm, on Apple silicon), through Variable Machine's `train` and `export` commands: SmolLM2-360M-Instruct as the base.
- **Variable Machine's general parts, which stay in Variable Machine.** The card uses them; it doesn't own them:
  - the Data, Train, Adapters and Chat tabs, and their walkthrough anchors (`data.new.name`, `data.drafts.from`, `train.base`, …);
  - the helper commands `data new`, `data draft <set> --from <notes> --fields a,b,c`, `data append <set> '<row>' --source corrections`, `data split`, `data validate`, `train`, `export`;
  - the helper routes `/api/workspace/list`, `/api/workspace/file` and `/api/workspace/manifests` (the card reads the workspace through them) and the terminal socket that runs a step's command;
  - in the UI: `say()` and the words build (`ui/scripts/text.mjs`), `joinWords` (`@shared/quote`), `DatasetManifest` (`@shared/manifest`), `listDir` and `readFile` (`ui/src/lib/workspace.ts`), and the `Project` type (`ProjectsPanel.tsx`);
  - in the helper: `WORKSPACE` (`config.ts`), `print` (`hub.ts`), `ollamaPost` (`ollama.ts`), `setRunning` and `write` (`run.ts`), `DatasetManifest` (`shared/manifest.ts`).
- **Data.** The studio's notes (a .txt or .md of who the clients and suppliers are, and the work, all made up) and the readers' sets were never in this repository. The three readers trained on 2026-11-05 (mail, log and update) should be in the workspace on the drive "KP 512", where Variable Machine's workspace was moved: their sets in `workspace/data/studio-*` (each with its `check-*.json`), their adapters in `workspace/adapters/`, the notes in `workspace/uploads/` or `workspace/raw/`. This was not checked: the drive wasn't mounted when this folder was made. The check notes are in the agent harness's `interactive-studio-vault/Studio/Checks/`.

The imports in `ui/card.ts` and `helper/reader.ts` are the ones the files had in Variable Machine, so they compile there unchanged (checked on 2026-11-19 by putting them back in place).

## How to move it

1. Copy this whole folder into `~/__DEV/agent-harness` (for example as `agent-harness/agent-training/`).
2. Decide where the training runs:
   - **Training stays in Variable Machine (the simplest).** The agent harness keeps this folder as the reference, and the commands go back into Variable Machine: copy `helper/reader.ts` and `helper/score.ts` into `helper/src/`, and add to `helper/src/terminal.ts` the import `import { readerCommand } from './reader.ts'`, the line `if (cmd === 'reader') return readerCommand(args)`, and the help line `reader check <model> <dataset> [--against qwen3:4b|none]   a reader model against qwen3:4b given a prompt, on rows set aside`.
   - **Training moves to the agent harness.** It needs a helper with the commands and routes listed above (or calls to Variable Machine's helper on port 4817). Replace the imports in `helper/reader.ts` with that helper's own (workspace path, print, Ollama post, running state, dataset manifest).
3. To show the card again, in whichever app shows it: put `ui/card.ts` beside that app's projects list, add `studioCard(have)` to its cards, add `readerChecks: await readReaderChecks(data)` to what it reads from the workspace, and put the entries of `text/agents.md` into its words (in Variable Machine, back into `ui/src/text/projects.md`). To have the Data tab's drafts fill in a reader's fields again, use `readerFields(dataset) ?? fieldsOf(train)` in `DataDrafts.tsx` where it now uses `fieldsOf(train)`.
4. Run the tests: `npx tsx --test tests/score.test.ts` (from this folder; tsx is in Variable Machine's `node_modules`).
5. Copy the data from the drive (above), then follow `docs/test-guide.md` with one reader, `studio-mail`.
6. Delete this folder from Variable Machine once the agent harness has it, by moving it to the Trash.

## Checked

On 2026-10-31, on made-up studio mail (fields: sender, work, ask, deadline, urgency): a 360M reader trained on 39 rows in about 2 minutes. On 11 emails with requests it never trained on, it got 95% of fields right against qwen3:4b's 85%, and 73% of rows right for both, at 0.3 s a row against 1.8 s. qwen3:4b wrote the rows from fields chosen first, so every answer is known; a reader for real mail needs real rows. On 2026-11-05 the mail reader scored 69% on cases written another way.
