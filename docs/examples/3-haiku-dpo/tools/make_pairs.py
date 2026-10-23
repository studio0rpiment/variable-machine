"""Make the haiku preference set through Variable Machine's own terminal.

Run from the repo root with Variable Machine running:  python3 docs/examples/3-haiku-dpo/tools/make_pairs.py
(after `data new haiku-575 --format preference`). tools/term.mjs sends one line to the helper, as typing it would.

For each topic: smollm2:360m writes a haiku (the base, as students will hear it)
and qwen3:4b writes one (asked for 5-7-5, up to three tries). A rule scores
each: 3 lines, and each line's syllables against 5, 7, 5 (score out of 4).
chosen = a qwen3 haiku that scores 4; rejected = the smollm2 haiku when it
scores less. Each pair goes in with `data append`, so it shows in the terminal.
"""
import json, re, subprocess, sys
from pathlib import Path

S = Path(__file__).parent
ROOT = Path(__file__).resolve().parents[4]
CHAT = sorted((ROOT / "workspace" / "chat").glob("*.jsonl"))[-1]  # today's chat log: run-once answers land here

TOPICS = [
    "a kiln cooling overnight", "graphite on the side of my hand", "a blank canvas", "the last day of a crit",
    "wet clay on the wheel", "a darkroom", "a print coming off the press", "a broken pencil",
    "the studio at 3 a.m.", "a museum guard", "dust in a gallery spotlight", "a sketchbook in the rain",
    "cutting mat scratches", "a roll of masking tape", "an empty frame", "a spilled jar of ink",
    "a figure drawing class", "a loom", "a welding spark", "sawdust", "the smell of turpentine",
    "a bus stop poster", "a neon sign", "a photograph of my grandmother", "a typeface",
    "a red thread", "a ceramic bowl with a crack", "an exhibition opening", "a moth on a lamp",
    "a laser cutter", "a 3D printer working all night", "a projector in a dark room", "a mural",
    "a puddle reflecting a building", "the first snow", "autumn leaves", "a heron", "the ocean at dusk",
    "a city at night", "a train window", "a cup of coffee going cold", "my cat asleep on my drawings",
    "a library", "a lighthouse", "a garden after rain", "fog on a bridge", "a full moon",
    "a paper crane", "a violin", "a dancer's shoes", "an old map", "a candle", "a mirror",
    "a staircase", "a field of sunflowers", "a mountain", "a river stone", "a spider web", "bread rising",
    "a deadline", "glass being blown", "a woodblock", "a quilt", "a chair nobody sits in",
    "a paintbrush drying", "charcoal dust", "a pottery shard", "a sewing needle", "a skylight",
    "a gallery bench", "a stack of zines", "a silkscreen", "a cardboard model", "a plaster cast",
    "a tin of buttons", "a rusted gate", "a bicycle bell", "a window box", "a kite", "a seashell",
    "an orange peel", "a cracked teacup", "a pair of scissors", "a ladder", "a market stall",
    "a rooftop garden", "a park bench", "a streetlight", "a rainy window", "a clothesline",
    "a pine forest", "a desert road", "a snowy field", "a frozen pond", "a wildflower meadow",
    "a hummingbird", "a crow on a wire", "a goldfish", "a beehive", "a bookshop", "an umbrella",
    "a radio at night", "a tea kettle", "a lantern",
]

SCHEMA = '{"type":"object","properties":{"line1":{"type":"string"},"line2":{"type":"string"},"line3":{"type":"string"}},"required":["line1","line2","line3"]}'
DONE = ROOT / "workspace" / "data" / "haiku-575" / "train.jsonl"


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    special = {"the": 1, "fire": 1, "every": 2, "evening": 2, "poem": 2, "quiet": 2, "being": 2, "create": 2, "idea": 3, "museum": 3, "canvas": 2, "a": 1}
    if w in special:
        return special[w]
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$", lambda m: m.group(0)[0], w)
    w = re.sub(r"^y", "", w)
    return max(1, len(re.findall(r"[aeiouy]+", w)))


def score(text: str) -> int:
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    if len(lines) != 3:
        return 0
    return 1 + sum(sum(syllables(w) for w in l.split()) == want for l, want in zip(lines, (5, 7, 5)))


def term(line: str) -> bool:
    out = subprocess.run(["node", str(S / "term.mjs"), line], capture_output=True, text=True, timeout=600).stdout
    return "[done ok=true]" in out


def last_answer(model: str) -> str:
    for l in reversed(CHAT.read_text().splitlines()):
        r = json.loads(l)
        if r.get("model") == model:
            return r.get("answer") or r.get("response") or ""
    return ""


def q(s: str) -> str:
    return json.dumps(s)


def main():
    made = 0
    for topic in TOPICS:
        prompt = f"Write a haiku about {topic}."
        if DONE.exists() and prompt in DONE.read_text():
            continue
        term(f"ollama run-once smollm2:360m {q(prompt)}")
        base = last_answer("smollm2:360m").strip()
        if score(base) == 4:
            print(f"skip {topic}: the base already scored 4")
            continue
        chosen = ""
        for _ in range(4):
            term(f"ollama run-once qwen3:4b --no-think --format '{SCHEMA}' {q(prompt + ' Line 1 has 5 syllables, line 2 has 7, line 3 has 5. Count them. Concrete images, no title.')}")
            try:
                j = json.loads(last_answer("qwen3:4b"))
                h = "\n".join(j[k].strip() for k in ("line1", "line2", "line3"))
            except Exception:
                continue
            if score(h) == 4:
                chosen = h
                break
        if not chosen:
            print(f"skip {topic}: no 5-7-5 haiku from qwen3:4b in four tries")
            continue
        row = json.dumps({"prompt": prompt, "chosen": chosen, "rejected": base})
        ok = term(f"data append haiku-575 '{row.replace(chr(39), '’')}' --source {q('qwen3:4b (chosen, scored 4/4) and smollm2:360m (rejected) by the 5-7-5 rule')}")
        made += ok
        print(f"{'+' if ok else '!'} {topic}: chosen 4 · rejected {score(base)}")
    print(f"{made} pairs")


if __name__ == "__main__":
    if sys.argv[1:] == ["test"]:
        for t in ["An old silent pond\nA frog jumps into the pond—\nSplash! Silence again.", "Wet clay spins and climbs\nmy thumbs press a quiet bowl\nthe wheel slows to rest"]:
            print(score(t), [sum(syllables(w) for w in l.split()) for l in t.split("\n")])
    else:
        main()
