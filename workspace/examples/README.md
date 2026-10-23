# examples

Small datasets written for Variable Machine, released under CC0 (public domain), so anything trained on them keeps a clean license chain.

- `data/curious-guide`: 24 chat rows about art and design in a museum guide's voice (three short sentences, the last a question back). Train it for 100–200 iterations on SmolLM2-360M and chat with the result next to the base.
- `data/concise-mini`: 12 preference pairs, a plain answer chosen over a padded one. A seed for the Prefer panel; build bigger sets from your own chat logs in the Data panel.

- `data/haiku-575`: 44 haiku preference pairs. The chosen haiku keeps 5-7-5 (written by qwen3:4b and checked by a syllable rule); the rejected one is what smollm2:360m wrote. Prefer it with `--sft 1` so the model keeps writing whole haiku (see docs/examples).

Copy one into your workspace with `data import example <name> <as>`, or from the Data panel.
