"""How many answers in a CSV match the answers you expected.

    python3 docs/briefs/1-public-data/score.py <file.csv> <answer column> <expected column>

Prints the count, then every one that didn't match, so you can see what kind of
mistake it made. Only the standard library.
"""

import csv
import sys

if len(sys.argv) != 4:
    sys.exit(__doc__)
path, got, want = sys.argv[1:]
rows = list(csv.DictReader(open(path, newline="", encoding="utf-8")))
wrong = [r for r in rows if r[got].strip() != r[want].strip()]
print(f"{len(rows) - len(wrong)} of {len(rows)} right")
for r in wrong:
    print(f"  {r[next(iter(r))]!r} -> {r[got]!r} (wanted {r[want]!r})")
