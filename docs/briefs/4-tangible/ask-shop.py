"""Ask a shop helper the ten yes/no questions in shop-questions.json and count
the answers that begin with the right yes or no.

    python3 docs/briefs/4-tangible/ask-shop.py shop-helper

Each answer follows from the facts in shop-helper.Modelfile (the laser's bed and
thickness, never PVC, the printer's size and walls, the hours). Only the
standard library.
"""

import json
import sys
import time
import urllib.request


def ask(model: str, text: str) -> str:
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": text}], "stream": False}).encode()
    req = urllib.request.Request("http://localhost:11434/api/chat", data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req) as res:
        return json.load(res)["message"]["content"].strip()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    model = sys.argv[1]
    questions = json.load(open(__file__.rsplit("/", 1)[0] + "/shop-questions.json"))
    right, start = 0, time.time()
    for q, want in questions:
        answer = ask(model, q)
        said = answer.lstrip("*_ \n").lower()
        ok = said.startswith(want)
        right += ok
        print(f"{'right' if ok else 'WRONG'}  {q}\n       {answer.splitlines()[0][:110]}")
    print(f"\n{right} of {len(questions)} right · {time.time() - start:.0f}s")


if __name__ == "__main__":
    main()
