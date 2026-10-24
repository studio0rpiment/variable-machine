# Brief 1: finding, cleaning and charting public data — what happened when we tried it

Tried on 2026-10-24 with Variable Machine v0.2, on an M1 Pro with 32GB, using the 16GB tier's training settings so the numbers match a student laptop. Every step below is a real command; the files it made are in this folder.

**The question:** who gives money to DC campaigns, by employer?
**The idea in one line:** a small model trained on 260 names you cleaned by hand cleans the other 16,000; a bigger model, held to a chart schema, turns questions into charts.

## What we did, step by step

### 1. Bring in the table (Data → public data) · 17 seconds

Searched DC Open Data for "campaign contributions". The first result, *Campaign Financial Contributions* (Office of Campaign Finance, CC BY 4.0), came in with:

```
data raw arcgis https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Public_Service_WebMercator/MapServer/34 dc-contributions --license "CC BY 4.0" --about "…" --page https://opendata.dc.gov/datasets/84d0702e81954f918551c2f7c4355382
```

87,000 rows (the importer stops there: "plenty for a class dataset"), 20 columns. The messy one is **EMPLOYER**: 16,708 different spellings. Verizon alone appears as 34 of them ("Verizon Corp Rsrcs Group LLC", "Verizon Corp Svcs . Corp", "Cellco Partnership"…); "Self", "self", "Self-Employed", "SELF EMPLOYED"; and 20 ways of saying the employer wasn't given ("Requested", "Info. Requested", "REQ", "x").

### 2. Clean names by hand · the real work

Took the 260 most common spellings (they cover most of the donations) and wrote the clean name for each in a spreadsheet with two columns, `input` and `output`: [dc-employers-cleaned.csv](dc-employers-cleaned.csv). The house rules, decided before starting:

1. the organisation's usual short name, without LLC, Inc, Corp, PC, LLP;
2. every Verizon company is Verizon;
3. Self-employed, Retired, Not employed, Student, Homemaker, written like that;
4. anything saying the employer wasn't given is *Not given*;
5. DC agencies start with DC ("DCFD" → "DC Fire and EMS");
6. typos fixed ("Patrick Malone Asssociates").

260 rows → 143 clean names. Decisions came up that rules didn't cover (is "Prudential Carruthers" Coldwell Banker now? is "Washington Hospital Center" MedStar?). **Writing the rules down first is what made the 260 consistent.** For a student, plan an hour or two.

Then set aside 26 *rarer* spellings of the same families, not in the 260, to test with: [employers-test.csv](employers-test.csv).

### 3. Bring the spreadsheet in, check it, split it · seconds

Saved the CSV into `workspace/uploads` (the Data tab's "your own file" does this), then:

```
data import file uploads/dc-employers-cleaned.csv dc-employers --license "CC BY 4.0 (employer names from DC Office of Campaign Finance) + the clean names are mine"
data validate dc-employers
data count dc-employers        260 rows · about 4,701 tokens · longest 36
data split dc-employers --valid 0.1      234 train · 26 valid
```

The importer read `input` as the question and `output` as the answer by itself.

### 4. Words first (Modelfile) · 1 minute

Before training, the recipe says try words alone. [name-cleaner-words.Modelfile](name-cleaner-words.Modelfile): the six rules as SYSTEM, temperature 0, one example. `ollama create name-cleaner-words -f …`

### 5. Train and export · 36 seconds + 6 seconds

```
train dc-employers-360m --data dc-employers --base HuggingFaceTB/SmolLM2-360M-Instruct --type lora --rank 8 --layers 8 --lr 1e-4 --iters 200 --batch 4 --max-seq 1024 --eval-every 50
export dc-employers-360m --name name-cleaner --quantize int8
```

Set-aside loss 4.04 → 0.095.

### 6. Test on names it never saw

[clean-column.py](clean-column.py) runs every value in a CSV column through a model in Ollama and writes a new column beside it. Used on the 26 test names:

| model | right of 26 |
|---|---|
| smollm2:360m, untouched | 0 (it chats about the name) |
| name-cleaner-words (rules as words) | 9 (and "na" → "Verizon") |
| name-cleaner (trained on 234 rows) | **17** |

All 9 mistakes were kinds of name the 260 never showed: "Retired Teacher", "Long **and** Foster", "Self employed consultant", "Coldwell Bank".

### 7. Fix the mistakes by adding that *kind* of row · 2 minutes

Picked 13 more spellings of those kinds from the table (never the test names themselves), typed their clean names, and added them one at a time:

```
data append dc-employers '{"messages":[{"role":"user","content":"Retired from DCPS"},{"role":"assistant","content":"Retired"}]}'
…
train dc-employers-360m-2 --data dc-employers …        (same settings)
export dc-employers-360m-2 --name name-cleaner-2 --quantize int8
```

**17 → 21 of 26.** The 5 left: "Retired Teacher", "Coldwell Bank", and three hospitals and a law school ("Georgetown University Hospital"). Whether a university hospital *is* the university is a decision for you, not the model: add a rule, then rows.

### 8. Use it on the whole table · 0.5 seconds a name

```
python3 docs/briefs/1-public-data/clean-column.py name-cleaner-2 contributions.csv EMPLOYER contributions-clean.csv
```

300 distinct employers took 148 seconds, so all 16,708 take about **2.3 hours**: run it over lunch, or on the top few thousand names. A random look at the output found "Empower DC" → **"DC Comics"**. The model makes things up when a name is unlike anything it saw: keep the original column next to the clean one, and check a random sample before you trust the totals.

### 9. Charts from questions · the part that didn't work as written

The brief said: a Modelfile, `chart-writer`, "answer only with Vega-Lite". Tried it on three models with 12 questions about the cleaned table ([chart-questions.json](chart-questions.json)), checking each answer with [check-chart.mjs](check-chart.mjs) (does it parse, does Vega-Lite compile it, does it have a title, do its axes start at zero, are its fields real columns):

| | smollm2:360m | smollm2:1.7b | qwen3:4b |
|---|---|---|---|
| words only | 0 / 12 | 0 / 12 | 0 / 12 |
| words + `--format json` | 0 / 12 | 0 / 12 | 0 / 12 |
| words + a chart **schema** | **12 / 12** | **12 / 12** | **12 / 12** |
| …and the chart answers the question (read by hand) | about 3 | about 6 | about 8 |

What went wrong without the schema: the SmolLM2 models invent the data instead of pointing at the file, and mix Vega syntax into Vega-Lite; qwen3:4b writes its reasoning before the chart even with thinking off, and runs out of room. JSON mode made it JSON, not Vega-Lite.

What worked: [chart-schema.json](chart-schema.json), a small slice of Vega-Lite (a title, the file, a mark, x / y / colour, and only the table's real column names), passed as `--format`. The model can only fill in that shape. All 12 compile; qwen3:4b's charts mostly answer the question. None can filter ("top ten", "in 2022"): the schema has no `transform`.

One rendered on the real 87,000 rows: [chart-contributor-type.svg](chart-contributor-type.svg).

### 10. Prefer: not done here, and why

The brief's step 6 (Prefer on chart-writer, scored by design rules) doesn't fit as written:
- Prefer trains a SmolLM2 base from Hugging Face, not a Modelfile variant, so `chart-writer` has to *be* SmolLM2 to be preferred.
- With the schema, every chart already passes the design rules, so a rule-based scorer has nothing to reject. What's left to prefer is *meaning* (did it chart the right thing), which a person judges by looking.

## The real instructions (rewritten from what happened)

1. **Data → public data:** search, bring in the table. Look at its columns and pick the messy one.
2. **Write your cleaning rules down** (five or six lines), then clean the 200–300 most common values by hand in a spreadsheet with columns `input` and `output`. Keep 20–30 *other* messy values aside, with the answers you want, to test with.
3. **Data → your own file:** bring the spreadsheet in. Check, count, split (10%).
4. **Modelfile:** try your rules as words first, and test on your 20–30. Write down the score.
5. **Train** on SmolLM2-360M with the defaults, **export**, and test on the same 20–30. Write down the score.
6. **Look at every mistake.** For each kind, add 5–10 rows of that kind (not the test ones) with `data append` or on the Data tab, and train again. Stop when the mistakes left are ones your rules don't decide.
7. **Clean the whole column** with `clean-column.py`. It takes about half a second a name. Check a random 50 by eye; keep the original column.
8. **Charts:** make a Modelfile on **qwen3:4b** that names your table's columns ([chart-writer-qwen3-4b.Modelfile](chart-writer-qwen3-4b.Modelfile)), and ask it with a **schema**. In the Variable Machine terminal, paste the schema's text in single quotes (the terminal isn't a shell, so `$(cat …)` doesn't work there):
   ```
   ollama run-once chart-writer-qwen3-4b --no-think --format '{"type":"object", … }' "Average donation in each ward."
   ```
   About 4 seconds a chart. Paste the answer into the [Vega editor](https://vega.github.io/editor/) with your CSV. Filters ("top 10", one year) you do in the CSV or the editor.

## What Variable Machine needs, found by doing this

- **"Run over every row"** in the app: clean-column.py as a recipe (`data map <model> raw/<table> <column>`), with progress and the new column saved as a table with its own record.
- **A list of a column's distinct values, by count, to clean** (step 2 was done with a script).
- **A schema setting** for a Modelfile or a Chat column, so the chart schema works in Chat, not only in `run-once`.
- **A chart preview**: render the Vega-Lite answer against the table, in the page.
- Prefer for meaning: pairs chosen by looking at rendered charts.
