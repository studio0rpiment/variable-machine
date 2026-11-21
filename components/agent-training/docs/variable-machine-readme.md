# What Variable Machine's README and site said about the card

Removed from Variable Machine's `README.md` and `site/index.html` on 2026-11-19, kept here word for word.

**README, the Projects paragraph:**

> **models for a multi-agent studio** (one reader model per job, each returning fixed fields as JSON: Data → Train → export as `studio-<reader>`; then `reader check`, which reads the rows set aside with the trained reader and with qwen3:4b given a prompt, and scores both). Checked 2026-10-31 on made-up studio mail (fields: sender, work, ask, deadline, urgency): a 360M reader trained on 39 rows in about 2 minutes; on 11 emails with requests it never trained on, it got 95% of fields right against qwen3:4b's 85%, 73% of rows right for both, at 0.3s a row against 1.8s. The rows were written by qwen3:4b from fields chosen first, so every answer is known; a reader for real mail needs real rows.

**README, the terminal's commands:**

```
reader check <model> <dataset> [--against qwen3:4b|none]   a reader model against qwen3:4b given a prompt, on rows set aside: fields right, rows right, time a row
```

**Site, the Projects tab:** the list of cards ended "a character's voice, a research bot, and models for a multi-agent studio".

**Release notes:** `docs/releases.md` in Variable Machine still records v0.3.0 (2026-11-11), which brought the card and `reader check`; release notes are history, so they stay.
