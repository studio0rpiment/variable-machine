"""Run every value in one column of a CSV through a model in Ollama, and write
the answers into a new column next to it, so you can check them side by side.

    python3 docs/briefs/clean-column.py <model> <in.csv> <column> <out.csv>
    python3 docs/briefs/clean-column.py name-cleaner contributions.csv EMPLOYER contributions-clean.csv

Each distinct value is asked once (a table of 87,000 donations has about
17,000 distinct employers) and remembered. Nothing leaves this computer: the
model runs in Ollama, on localhost. Only the standard library, so plain
python3 runs it.
"""

import csv
import json
import sys
import time
import urllib.request

OLLAMA = "http://localhost:11434/api/chat"


def ask(model: str, text: str) -> str:
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": text}], "stream": False, "options": {"temperature": 0}}).encode()
    req = urllib.request.Request(OLLAMA, data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req) as res:
        return json.load(res)["message"]["content"].strip()


def main():
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    model, src, column, out = sys.argv[1:]
    rows = list(csv.DictReader(open(src, newline="", encoding="utf-8")))
    if not rows or column not in rows[0]:
        sys.exit(f"no column {column!r} in {src}")
    values = sorted({r[column].strip() for r in rows if r[column].strip()})
    print(f"{len(rows)} rows, {len(values)} distinct values in {column}; asking {model}", file=sys.stderr)
    clean: dict[str, str] = {}
    start = time.time()
    for i, v in enumerate(values, 1):
        clean[v] = ask(model, v)
        if i % 100 == 0 or i == len(values):
            print(f"  {i}/{len(values)}  {time.time() - start:.0f}s", file=sys.stderr)
    new = f"{column}_CLEAN"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=[*rows[0].keys(), new])
        w.writeheader()
        for r in rows:
            w.writerow({**r, new: clean.get(r[column].strip(), "")})
    print(f"wrote {out} with a {new} column", file=sys.stderr)


if __name__ == "__main__":
    main()
