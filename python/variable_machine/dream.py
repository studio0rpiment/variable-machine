"""A dream installation: four pictures (who, what, when, where), a visitor's choice, and a response.

    python python/variable_machine/dream.py make <dream folder> --book <raw folder> --who <folder> --what <folder> --when <folder> --where <folder> [--drawn 0]
    python python/variable_machine/dream.py respond <dream folder> [--model qwen3:4b]

All paths are relative to the repo root. Nothing here downloads anything.

The models:

- Kandinsky 2.2 (Sber AI, Apache 2.0) in workspace/tools/kandinsky/, loaded by
  latent.py: its picture encoder (CLIP ViT-bigG/14) puts each picture into
  1280 numbers, and its decoder draws a picture from any 1280 numbers.
- SigLIP base (Google, Apache 2.0) in workspace/tools/siglip/, loaded by
  mood.py: it puts a picture and an English phrase into the same 768 numbers,
  so it can say which words of the dream book a picture is nearest.
- A language model in Ollama (qwen3:4b, Alibaba, Apache 2.0, by default)
  glosses the dream book's lines and writes the reading. Without Ollama the
  response quotes the book's lines with no reading.

What each part does:

- make: the dream book (the Zhougong jiemeng, 周公解夢, from Wikisource, brought
  in with data raw txt) is cut into its lines, each a dream and what it
  foretells ("天門開貴人薦引": the gate of heaven opens; a noble person will
  recommend you). A glossary (GLOSSARY below: one character, one English
  word, each set under who, what, when or where) is the bridge from pictures
  to the book: SigLIP finds the glossary words nearest each picture, and the
  book's lines whose dream holds that character are that picture's lines.
  With --drawn N, Kandinsky also draws N new pictures for each category from
  the centre of that category's pictures, and they join it.
- respond: the visitor's choice (choice.json, written by `dream choose`) is
  answered. The chosen picture's lines are looked up; the language model
  glosses them and writes a short reading, in English and in Chinese, from
  those lines only. Then Kandinsky draws the response: the chosen picture's
  1280 numbers moved toward the picture, among all four categories', that
  SigLIP finds nearest to what the first line foretells. The dream image
  is drawn together with its omen, in the student's own pictures' terms.

What it is not: the dream book is a folk text of omens, not a finding, and
the language model is a reader of it, not a diviner. The page says so.
"""

from __future__ import annotations

import html
import json
import os
import random
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

CATEGORIES = ("who", "what", "when", "where")
ZH = {"who": "誰", "what": "什麼", "when": "何時", "where": "何地"}
WORKSPACE = Path("workspace")
OLLAMA = os.environ.get("OLLAMA_HOST_URL", "http://127.0.0.1:11434")
TOWARD = 0.4  # how far the response moves from the chosen picture toward the omen's picture

# The bridge from pictures to the dream book. Each character is one the book's dreams use (most in several lines);
# its English word is what SigLIP is asked to find in a picture. Who: people, gods, animals and the body. What: things
# and what happens. When: the sky and the weather, and the times of a life (Wang Fu's ten kinds of dream include
# dreams of the season, 時夢; the book itself has no section on time). Where: places. Edit it to suit the pictures.
GLOSSARY = {
    "who": [
        ("人", "a person"), ("婦", "a woman"), ("女", "a girl"), ("男", "a man"), ("子", "a child"), ("妻", "a wife"),
        ("夫", "a husband"), ("王", "a king"), ("官", "an official"), ("君", "a lord"), ("佛", "a buddha"), ("僧", "a monk"),
        ("尼", "a nun"), ("鬼", "a ghost"), ("神", "a god"), ("龍", "a dragon"), ("蛇", "a snake"), ("虎", "a tiger"),
        ("馬", "a horse"), ("牛", "an ox"), ("羊", "a sheep"), ("豬", "a pig"), ("犬", "a dog"), ("雞", "a chicken"),
        ("鳥", "a bird"), ("鶴", "a crane"), ("雀", "a sparrow"), ("鼠", "a rat"), ("魚", "a fish"), ("龜", "a turtle"),
        ("鵝", "a goose"), ("鴨", "a duck"), ("豹", "a leopard"), ("狼", "a wolf"), ("蝶", "a butterfly"), ("蜂", "a bee"),
        ("頭", "a head"), ("齒", "teeth"), ("髮", "hair"), ("手", "hands"), ("腳", "feet"), ("面", "a face"),
    ],
    "what": [
        ("刀", "a knife"), ("劍", "a sword"), ("衣", "clothes"), ("帶", "a belt"), ("冠", "a hat"), ("鞋", "shoes"),
        ("鏡", "a mirror"), ("金", "gold"), ("銀", "silver"), ("玉", "jade"), ("錢", "coins"), ("船", "a boat"),
        ("車", "a cart"), ("書", "a book"), ("筆", "a brush"), ("印", "a seal"), ("酒", "wine"), ("肉", "meat"),
        ("食", "food"), ("米", "rice"), ("花", "flowers"), ("火", "fire"), ("燈", "a lamp"), ("床", "a bed"),
        ("帳", "a curtain"), ("棺", "a coffin"), ("鼓", "a drum"), ("鐘", "a bell"), ("弓", "a bow"), ("梳", "a comb"),
        ("釵", "a hairpin"), ("果", "fruit"), ("菜", "vegetables"), ("燭", "a candle"), ("血", "blood"), ("洗", "washing"),
        ("打", "a fight"), ("殺", "killing"), ("哭", "weeping"), ("歌", "singing"), ("舞", "dancing"), ("飛", "flying"),
    ],
    "when": [
        ("日", "the sun"), ("月", "the moon"), ("星", "stars"), ("天", "the sky"), ("雲", "clouds"), ("雨", "rain"),
        ("雪", "snow"), ("雷", "thunder"), ("風", "wind"), ("露", "dew"), ("光", "light"), ("明", "daybreak"),
        ("黑", "darkness"), ("死", "a death"), ("病", "an illness"), ("孕", "a pregnancy"), ("產", "a birth"),
        ("老", "old age"), ("新", "something new"), ("初", "a beginning"), ("枯", "withering"), ("熟", "ripening"),
        ("種", "sowing"), ("禾", "a harvest"), ("麥", "wheat"), ("春", "spring"),
    ],
    "where": [
        ("山", "a mountain"), ("水", "water"), ("河", "a river"), ("江", "a wide river"), ("石", "rocks"), ("樹", "trees"),
        ("林", "a forest"), ("田", "fields"), ("園", "a garden"), ("屋", "a house"), ("宅", "a home"), ("門", "a gate"),
        ("井", "a well"), ("灶", "a stove"), ("廁", "a toilet"), ("堂", "a hall"), ("樓", "a tower"), ("宮", "a palace"),
        ("城", "a city wall"), ("橋", "a bridge"), ("路", "a road"), ("市", "a market"), ("寺", "a temple"),
        ("墓", "a grave"), ("獄", "a prison"), ("倉", "a granary"), ("牆", "a wall"), ("廚", "a kitchen"),
        ("草", "grass"), ("泥", "mud"), ("地", "the ground"), ("床", "a bed"), ("船", "a boat"),
    ],
}

# Other ways of reading the same dream, printed on the response page under the book's reading. Sources: docs/dream-reading.md.
FRAMES = [
    ("Wang Fu, Qianfu lun, “Meng lie” (2nd century)", "Ten kinds of dream, from the direct (直), which comes true as dreamt, and the symbolic (象), to dreams of the season (時) and dreams that mean their opposite (反). One image can be read many ways: the reader must ask what kind of dream it is."),
    ("Liezi, “King Mu of Zhou” (Giles, 1912)", "Six kinds of dream, and a servant who dreams every night that he is a lord, while his lord dreams every night that he is a servant. Which life is the dream?"),
    ("Zhuangzi (Giles, 1889)", "Zhuangzi dreamt he was a butterfly, and woke not knowing whether he was a man who had dreamt he was a butterfly or a butterfly dreaming he was a man."),
    ("Freud, The Interpretation of Dreams (1899)", "A dream is a wish, disguised. Most dream researchers since the 1950s reject this (Domhoff, 2022)."),
    ("Hoel, “The overfitted brain” (2021)", "Dreams are the brain's own strange pictures, which keep it from learning its days too narrowly."),
    ("Nrenzah, on Akan dreams (2025)", "A dream is not only the dreamer's: it is a meeting with others, the living and the dead."),
]


def latent_mod():
    import latent  # Kandinsky's encoder and decoder, loaded the one way (latent.py)

    return latent


def siglip():
    from mood import Siglip

    return Siglip()


def ws(p: str | Path) -> Path:
    """A workspace path as the helper writes it ("images/x/a.jpg") to a path from the repo root."""
    return WORKSPACE / p


# ---------------------------------------------------------------- the dream book


def read_book(raw: Path) -> list[dict]:
    """The Zhougong jiemeng's lines, each with its section. A line is a dream, then what it foretells, as seven characters or so."""
    text = (raw / "source.txt").read_text(encoding="utf-8")
    section, out = None, []
    for line in text.splitlines():
        m = re.match(r"\s*==\s*(.+?)\s*==\s*$", line)
        if m:
            section = m.group(1)
            continue
        if not section or line.lstrip().startswith(("{{", "[[", "<")):
            continue
        for x in re.split(r"[\s　]+", re.sub(r"\{\{.*?\}\}", "", line).strip()):
            if len(x) >= 4 and re.fullmatch(r"[㐀-鿿]+", x):
                out.append({"section": section, "zh": x})
    if not out:
        sys.exit(f"dream: no lines in {raw}/source.txt; is it the Zhougong jiemeng from Wikisource (sections between == marks)?")
    return out


def lines_for(book: list[dict], ch: str, n: int = 2) -> list[dict]:
    """The book's lines whose dream holds this character: in its first four characters, where the dream is, not the omen."""
    return [b for b in book if ch in b["zh"][:4]][:n]


def glossary(book: list[dict]) -> dict[str, list[tuple[str, str]]]:
    """The glossary words the book has dreams for."""
    return {c: [(ch, en) for ch, en in GLOSSARY[c] if lines_for(book, ch, 1)] for c in CATEGORIES}


# ---------------------------------------------------------------- make


def make(out: Path, book_dir: Path, folders: dict[str, Path], drawn: int) -> None:
    from latent import pictures

    book = read_book(book_dir)
    gl = glossary(book)
    print(f"  the dream book: {len(book)} lines in {len({b['section'] for b in book})} sections, from {book_dir}", flush=True)
    print("  glossary words with dreams in it: " + ", ".join(f"{c} {len(gl[c])}" for c in CATEGORIES), flush=True)
    out.mkdir(parents=True, exist_ok=True)
    files = {c: pictures(folders[c]) for c in CATEGORIES}
    for c in CATEGORIES:
        print(f"  {c} ({ZH[c]}): {len(files[c])} pictures from {folders[c]}", flush=True)

    L = latent_mod()
    if drawn:
        import torch
        from PIL import Image

        E, grey = L.encode([f for c in CATEGORIES for f in files[c]], [Image.new("RGB", (224, 224), (128, 128, 128))])
        pipe = L.decoder()
        (out / "drawn").mkdir(exist_ok=True)
        i = 0
        for c in CATEGORIES:
            Ec = E[i : i + len(files[c])]
            i += len(files[c])
            mean, length = Ec.mean(0), float(np.linalg.norm(Ec, axis=1).mean())
            for seed in range(drawn):
                p = out / "drawn" / f"{c}-{seed + 1}.png"
                with torch.no_grad():
                    L.draw(pipe, mean, length, grey[0], seed).save(p)
                files[c].append(p)
                print(f"  ◂ drawn/{p.name}: the centre of the {c} pictures, drawn", flush=True)
        del pipe

    allf = [f for c in CATEGORIES for f in files[c]]
    from PIL import Image

    E, grey = L.encode(allf, [Image.new("RGB", (224, 224), (128, 128, 128))])
    sg = siglip()
    S = sg.images(allf)
    words = {c: sg.sentences([f"a picture of {en}" for _, en in gl[c]]) for c in CATEGORIES}
    cats, i = {}, 0
    for c in CATEGORIES:
        rows = []
        for f in files[c]:
            sim = words[c] @ S[i]
            top = np.argsort(-sim)[:3]
            rows.append({
                "file": str(f.relative_to(WORKSPACE)) if f.is_relative_to(WORKSPACE) else str(f),
                "index": i,
                "drawn": f.parent.name == "drawn",
                "words": [{"zh": gl[c][k][0], "en": gl[c][k][1], "score": round(float(sim[k]), 3)} for k in top],
            })
            print(f"  {f.name}: " + ", ".join(f"{w['en']} {w['zh']}" for w in rows[-1]["words"]), flush=True)
            i += 1
        cats[c] = {"folder": str(folders[c].relative_to(WORKSPACE)) if folders[c].is_relative_to(WORKSPACE) else str(folders[c]), "pictures": rows}
    np.savez(out / "embeddings.npz", kandinsky=E, siglip=S, grey=grey[0], length=float(np.linalg.norm(E, axis=1).mean()))
    (out / "book.json").write_text(json.dumps({"from": str(book_dir), "lines": book, "glossary": gl}, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    (out / "dream.json").write_text(json.dumps({"categories": cats, "zh": ZH, "drawn": drawn}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  ◂ dream.json, book.json, embeddings.npz in {out}", flush=True)


# ---------------------------------------------------------------- respond


def ask(model: str, prompt: str) -> dict | None:
    """One answer from Ollama, as JSON; None when it isn't running or doesn't answer in JSON."""
    body = {"model": model, "prompt": prompt, "stream": False, "think": False, "format": "json", "options": {"temperature": 0.4, "num_ctx": 4096}}
    try:
        req = urllib.request.Request(f"{OLLAMA}/api/generate", json.dumps(body).encode(), {"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(json.loads(r.read())["response"])
    except Exception as err:  # noqa: BLE001: any failure means no reading, said on the page
        print(f"  no reading from {model}: {err}", flush=True)
        return None


PROMPT = """You read dreams with the Zhougong jiemeng (周公解夢), the Chinese folk dream book. Each line of it is a dream, then what it foretells.

A visitor to an installation chose a picture for the {category} of their dream ({zh}). The picture shows {words}.{dream}

These are the book's lines for it:
{lines}

Answer in JSON with these keys:
- "lines": for each line in order, {{"zh": the line, "dream": what is dreamt, in plain English, "omen": what it foretells, in plain English}}
- "reading": four sentences in English, to the visitor ("you"), saying what the book would say of their dream, from the lines that fit it best. Say it is what the book says, not what will happen. Don't list what the book doesn't say.
- "reading_zh": the same reading translated into Traditional Chinese (繁體中文), every word in Chinese, no English.
Gloss the classical Chinese literally; don't add omens that aren't in the lines. /no_think"""


def chinese(text: str) -> str:
    """The Chinese reading, if it is Chinese: a small model sometimes answers half of it in English, and then it is left out."""
    letters = [c for c in text if c.isalpha()]
    cjk = sum(1 for c in letters if "\u3400" <= c <= "\u9fff")
    if letters and cjk / len(letters) >= 0.8:
        return text
    print("  the Chinese reading came back partly in English, so it is left out", flush=True)
    return ""


def respond(out: Path, model: str) -> None:
    choice = json.loads((out / "choice.json").read_text(encoding="utf-8"))
    dream = json.loads((out / "dream.json").read_text(encoding="utf-8"))
    book = json.loads((out / "book.json").read_text(encoding="utf-8"))["lines"]
    z = np.load(out / "embeddings.npz")
    c = choice["category"]
    pics = [p for cat in CATEGORIES for p in dream["categories"][cat]["pictures"]]
    chosen = next((p for p in dream["categories"][c]["pictures"] if p["file"] == choice["picture"]), None)
    if not chosen:
        sys.exit(f"dream respond: {choice['picture']} isn't one of the {c} pictures in {out}/dream.json")
    lines, seen = [], set()
    for w in chosen["words"]:
        for b in lines_for(book, w["zh"]):
            if b["zh"] not in seen and len(lines) < 5:
                seen.add(b["zh"])
                lines.append({**b, "word": w["zh"], "en": w["en"]})
    print(f"  {c} ({ZH[c]}): {chosen['file']} · nearest words: " + ", ".join(f"{w['en']} {w['zh']}" for w in chosen["words"]), flush=True)
    for b in lines:
        print(f"    {b['zh']}  ({b['section']})", flush=True)

    t = time.time()
    said = ask(model, PROMPT.format(
        category=c, zh=ZH[c], words=", ".join(w["en"] for w in chosen["words"]),
        dream=f' They said of their dream: "{choice["dream"]}".' if choice.get("dream") else "",
        lines="\n".join(b["zh"] for b in lines),
    )) if lines else None
    if said:
        print(f"  the reading, by {model} in {time.time() - t:.0f}s", flush=True)
        glossed = {g.get("zh"): g for g in said.get("lines", []) if isinstance(g, dict)}
        for b in lines:
            g = glossed.get(b["zh"], {})
            b["dream"], b["omen"] = str(g.get("dream", "")), str(g.get("omen", ""))

    # the response picture: the chosen picture moved toward the picture nearest what the first line foretells
    K, S, grey, length = z["kandinsky"], z["siglip"], z["grey"], float(z["length"])
    unit = lambda v: v / np.linalg.norm(v)  # noqa: E731
    omen = next((b["omen"] for b in lines if b.get("omen")), "")
    others = [p for p in pics if p["file"] != chosen["file"]]
    if omen:
        sg = siglip()
        o = sg.sentences([f"a picture of {omen}"])[0]
        toward = max(others, key=lambda p: float(S[p["index"]] @ o))
        why = f'the picture nearest what the book foretells ("{omen}")'
        target = unit(K[toward["index"]])
    else:  # no gloss: the other three pictures on the wall, as one
        shown = [choice["shown"][k] for k in CATEGORIES if k != c and choice.get("shown", {}).get(k)]
        idx = [p["index"] for p in pics if p["file"] in shown] or [p["index"] for p in others]
        toward = None
        why = "the other pictures on the wall, together"
        target = unit(np.mean([unit(K[i]) for i in idx], 0))
    v = (1 - TOWARD) * unit(K[chosen["index"]]) + TOWARD * target
    L = latent_mod()
    import torch

    pipe = L.decoder()
    n = len(list((out / "responses").glob("*"))) + 1 if (out / "responses").exists() else 1
    rdir = out / "responses" / f"{n:03d}"
    rdir.mkdir(parents=True, exist_ok=True)
    t = time.time()
    with torch.no_grad():
        L.draw(pipe, v, length, grey, seed=random.randrange(10_000)).save(rdir / "response.png")
    print(f"  ◂ response.png: the chosen picture moved toward {why}{': ' + toward['file'] if toward else ''} ({time.time() - t:.0f}s)", flush=True)
    rel = lambda p: str(p.relative_to(WORKSPACE))  # noqa: E731
    result = {
        "at": choice.get("at"),
        "category": c,
        "chosen": chosen["file"],
        "shown": choice.get("shown", {}),
        "dream": choice.get("dream", ""),
        "words": chosen["words"],
        "lines": lines,
        "reading": str(said.get("reading", "")) if said else "",
        "reading_zh": chinese(str(said.get("reading_zh", ""))) if said else "",
        "model": model if said else None,
        "image": rel(rdir / "response.png"),
        "toward": toward["file"] if toward else None,
        "towardWhy": why,
        "weights": {"chosen": 1 - TOWARD, "toward": TOWARD},
        "frames": [{"source": s, "says": t_} for s, t_ in FRAMES],
    }
    (rdir / "response.json").write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    write_html(rdir / "response.html", result)
    (out / "latest.json").write_text(json.dumps({"response": rel(rdir / "response.json"), "at": choice.get("at")}) + "\n")
    if result["reading"]:
        print(f"  {result['reading']}", flush=True)
    print(f"  wrote {rdir}/response.html, response.json", flush=True)


def write_html(path: Path, r: dict) -> None:
    from latent import open_image, thumb

    e = html.escape
    img = lambda p, alt: f'<img src="{thumb(open_image(ws(p)), 512)}" alt="{e(alt)}">' if p and ws(p).exists() else ""  # noqa: E731
    lines = "".join(
        f"<tr><td lang=\"zh-Hant\">{e(b['zh'])}</td><td>{e(b.get('dream', ''))}</td><td>{e(b.get('omen', ''))}</td><td class=c>{e(b['section'])} · {e(b['en'])} {e(b['word'])}</td></tr>"
        for b in r["lines"]
    )
    frames = "".join(f"<li><b>{e(f['source'])}</b> {e(f['says'])}</li>" for f in r["frames"])
    who = f"written by {e(r['model'])}, a language model, from the book's lines above and nothing else" if r["model"] else "no reading: Ollama wasn't running, so the book's lines stand alone"
    path.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>dream · {e(r['category'])}</title>
<style>
body{{font:0.875rem/1.5 ui-monospace,Menlo,monospace;background:#111;color:#ddd;margin:1.5rem;max-width:64rem}}
h1,h2{{font-size:1rem;font-weight:500;color:#5CF25C;margin:1.25rem 0 .5rem}} p,li{{color:#bbb}} .c{{color:#888}}
.pair{{display:flex;flex-wrap:wrap;gap:1rem}} figure{{margin:0;width:24rem}} img{{width:100%;display:block}} figcaption{{color:#999;padding:.25rem 0}}
table{{border-collapse:collapse;width:100%}} td{{border-top:1px solid #2a2a2a;padding:.375rem .5rem;vertical-align:top}} b{{color:#ddd;font-weight:500}}
.reading{{font-size:1rem;color:#eee}}
</style></head><body>
<h1>the {e(r['category'])} of the dream ({e(ZH[r['category']])})</h1>
<div class="pair">
<figure>{img(r['chosen'], 'the chosen picture')}<figcaption>chosen: {e(r['chosen'])} · nearest words: {e(', '.join(w['en'] + ' ' + w['zh'] for w in r['words']))}</figcaption></figure>
<figure>{img(r['image'], 'the response')}<figcaption>the response: the chosen picture, moved {r['weights']['toward']:.0%} of the way toward {e(r['towardWhy'])}{' (' + e(r['toward']) + ')' if r['toward'] else ''}, drawn by Kandinsky 2.2</figcaption></figure>
</div>
{f'<p>The dream, in the visitor\'s words: {e(r["dream"])}</p>' if r['dream'] else ''}
<h2>what the book says (周公解夢)</h2>
<table><tr><td class=c>line</td><td class=c>the dream</td><td class=c>what it foretells</td><td class=c>section · word</td></tr>{lines}</table>
<p class="reading">{e(r['reading'])}</p>
<p class="reading" lang="zh-Hant">{e(r['reading_zh'])}</p>
<p class="c">{who}. The glosses are the model's and may be wrong: read the lines themselves. The book is a folk text of omens, not a finding.</p>
<h2>other ways to read it</h2>
<ul>{frames}</ul>
</body></html>
""", encoding="utf-8")


def main(argv: list[str]) -> None:
    def opt(name: str, default: str | None = None) -> str | None:
        return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default

    pos = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or not argv[i - 1].startswith("--"))]
    if len(pos) == 2 and pos[0] == "make" and opt("--book") and all(opt(f"--{c}") for c in CATEGORIES):
        make(Path(pos[1]), Path(opt("--book")), {c: Path(opt(f"--{c}")) for c in CATEGORIES}, int(opt("--drawn", "0")))
    elif len(pos) == 2 and pos[0] == "respond":
        respond(Path(pos[1]), opt("--model", "qwen3:4b"))
    else:
        sys.exit(__doc__.split("\n\n")[1])


if __name__ == "__main__":
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    main(sys.argv[1:])
