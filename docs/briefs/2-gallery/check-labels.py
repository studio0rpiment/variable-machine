"""Ask a label writer for a label for every work it was not trained on (the
set-aside rows of a dataset), and print each draft under its facts and notes,
with the names it used that the facts and notes don't contain.

    python3 docs/briefs/2-gallery/check-labels.py <model> <dataset>
    python3 docs/briefs/2-gallery/check-labels.py label-writer-notes cma-labels-notes

A name the facts and notes don't contain (a person, place or event in capitals)
is the clearest sign the model invented something; the count at the end is a
quick way to compare two models. It doesn't catch every invention: read the
drafts too. Nothing leaves this computer; only the standard library.
"""

import json
import re
import sys
import time
import urllib.request

OLLAMA = "http://localhost:11434/api/chat"


def ask(model: str, text: str) -> str:
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": text}], "stream": False, "options": {"temperature": 0}}).encode()
    req = urllib.request.Request(OLLAMA, data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req) as res:
        return json.load(res)["message"]["content"].strip()


def new_names(draft: str, given: str) -> list[str]:
    """Capitalised words in the draft, not at the start of a sentence, that the facts and notes don't contain."""
    known = {w.lower() for w in re.findall(r"[\w'’-]+", given)}
    found = []
    for m in re.finditer(r"(?<![.!?]\s)(?<!^)\b([A-Z][\w'’-]+)", draft):
        w = m.group(1)
        base = re.sub(r"['’]s$", "", w).lower()
        if base not in known and w not in found:
            found.append(w)
    return found


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    model, dataset = sys.argv[1:]
    rows = [json.loads(l) for l in open(f"workspace/data/{dataset}/valid.jsonl", encoding="utf-8")]
    total, start = 0, time.time()
    for r in rows:
        given = r["messages"][0]["content"]
        draft = ask(model, given)
        names = new_names(draft, given)
        total += len(names)
        print(f"\n{given}\n→ {draft}\n  names not in the facts or notes: {', '.join(names) or 'none'}")
    print(f"\n{len(rows)} works it hadn't seen, {time.time() - start:.0f}s; {total} names not in the facts or notes")


if __name__ == "__main__":
    main()
