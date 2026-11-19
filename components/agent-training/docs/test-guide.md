# Test guide: models for a multi-agent studio

Section 6 of Variable Machine's `docs/projects-test-guide.md`, as it was before the card moved out (2026-11-19). Every command runs in Variable Machine's terminal; the card ran them from the Projects tab. On the card, steps 1, 2, 4 and 5 had walkthroughs: the tab opened with the card's names filled in (the set on Data; the set, adapter name, base and max seq on Train), and a dashed box pointed at one control at a time.

## Models for a multi-agent studio

**Makes:** one reader model per job (`studio-mail`, `studio-invoice`, …), each returning fixed JSON fields. **Time:** about 20 minutes per reader. Test one reader, `studio-mail`, first.

| # | Tab | Do | Command | Check |
|---|---|---|---|---|
| 1 | Data | New set named for the reader | `data new studio-mail` | The set appears |
| 2 | Data → drafts | Upload the studio's notes (a .txt or .md) under drafts, then draft. Fields fill in as sender,work,ask,deadline. Keep, edit or reject each draft | `data draft studio-mail --from uploads/<notes>.txt --fields sender,work,ask,deadline --count 200 --model qwen3:4b` | Drafts come in ten to a call and wait, unreviewed, in `drafts.jsonl`. Each draft is a message plus its fields as JSON; an edit that breaks the JSON can't be kept. The card shows *n of 150 rows kept · n drafts to read*; done at 150 |
| 3 | Data | Add the lead's corrections as rows | `data append studio-mail '<row json>' --source corrections` | Rows show their source |
| 4 | Data | Set rows aside and validate | `data split studio-mail --valid 0.15`, `data validate studio-mail` | No bad rows |
| 5 | Train | Train on SmolLM2-360M | `train <adapter> --data studio-mail --base <small> --max-seq 512` | The run ends without an error |
| 6 | Adapters | Export under the reader's name | `export <adapter> --name studio-mail` | `studio-mail` is in Ollama |
| 7 | Chat | Compare with qwen3:4b given a prompt | `reader check studio-mail studio-mail` | The card shows both scores. The session's test, on made-up mail only: 95% against 85% of fields, about 6× faster |
