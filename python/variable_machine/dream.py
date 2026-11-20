"""A dream installation: four cards for each of who, what, when and where; a visitor chooses one of each.

    python python/variable_machine/dream.py cards <image folder prefix>
    python python/variable_machine/dream.py deck <dream folder> --who <folder> --what <folder> --when <folder> --where <folder>
    python python/variable_machine/dream.py guide <dream folder> <text> [<text> …] [--embed nomic-embed-text]
    python python/variable_machine/dream.py interpret <dream folder> (--combination 1-2-3-4 | --all) [--model qwen3:4b]
    python python/variable_machine/dream.py draw <dream folder> (--combination 1-2-3-4 | --all) [--variations 2] [--with cards|prior]
    python python/variable_machine/dream.py respond <dream folder> [--model qwen3:4b] [--with cards|prior] [--variations 2] [--read-words]

All paths are relative to the repo root. Nothing here downloads anything.

The words, as the card uses them:

- A **quality** is one of who (誰), what (什麼), when (何時) and where (何地).
- A **card** is one picture standing for a quality: the student's own, or one
  drawn for a demo. Four cards a quality make the **deck** (16 cards).
- A **combination** is one card of each quality: 4 × 4 × 4 × 4 = 256 of them,
  named by their cards' numbers in the order who-what-when-where ("1-3-2-4").
- The **guide texts** are what the combinations are interpreted with: the
  dream books and other texts brought in with data raw, and the student's own
  writing, uploaded.
- The **interpretation** of a combination is written by a language model from
  the passages of the guide texts nearest its four cards.
- Its **variations** are pictures a diffusion model draws for it.

The models, each a choice:

- **Kandinsky 2.2** (Sber AI, Apache 2.0), loaded by latent.py: its picture
  encoder puts each card into 1280 numbers, and its decoder draws a picture
  from any 1280 numbers. With **--with cards**, a variation is the four cards'
  numbers mixed, each variation led by a different quality.
- **Kandinsky 2.2's prior** (model get kandinsky-prior, Apache 2.0): a text
  encoder and a diffusion prior that turn a sentence into the same 1280
  numbers. With **--with prior**, the interpretation's own picture sentence is
  mixed in with the four cards, so the reading shapes the picture. The prior
  also draws the demo cards (cards) from written prompts.
- **SigLIP** (Google, Apache 2.0), loaded by mood.py: finds the words of a
  glossary nearest each card, which look up the Zhougong jiemeng's lines.
- **An embedding model in Ollama** (nomic-embed-text, Apache 2.0, by default):
  finds the passages of the other guide texts nearest a combination.
- **A language model in Ollama** (qwen3:4b, Apache 2.0, by default; --model
  none for no reading) writes the interpretation, in English and Chinese.

What it is not: the guide texts are what the student chose, and the language
model is a reader of them, not a diviner. The pages say so.
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
from itertools import product
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

QUALITIES = ("who", "what", "when", "where")
ZH = {"who": "誰", "what": "什麼", "when": "何時", "where": "何地"}
WORKSPACE = Path("workspace")
PRIOR = WORKSPACE / "tools/kandinsky-prior/prior"
OLLAMA = os.environ.get("OLLAMA_HOST_URL", "http://127.0.0.1:11434")
EMBED = "nomic-embed-text"
LEAD = 0.4  # with --with cards: the share of the quality that leads a variation; the other three share the rest
SENTENCE = 0.4  # with --with prior: the share of the interpretation's picture sentence; the cards share the rest
PASSAGES = 2  # passages from each guide text besides the dream book, up to MAX_PASSAGES in all
MAX_PASSAGES = 10  # the dream book's lines (one a card) and the other texts' passages together

# The demo deck, drawn by `cards` from these prompts, for trying the card before the student's own pictures are in.
# One style for all sixteen, so they read as one deck. Each names something the dream book's glossary has.
STYLE = "ink and watercolour on paper, soft light, quiet, a single subject, dreamlike"
DEMO = {
    "who": ["an old woman in a dark blue robe", "a child holding a paper lantern", "a white snake coiled on a stone", "a monk seen from behind"],
    "what": ["a small wooden boat on still water", "a round bronze mirror", "a lit red candle", "a wooden comb lying on silk"],
    "when": ["a full moon behind clouds at night", "snow falling at dusk", "heavy summer rain", "the sun rising at daybreak"],
    "where": ["a river between mountains", "a temple courtyard with incense smoke", "a mountain path in mist", "an old kitchen with a clay stove"],
}

# The bridge from cards to the Zhougong jiemeng (周公解夢), when it is a guide text. Each character is one the book's
# dreams use; its English word is what SigLIP is asked to find in a card. Who: people, gods, animals and the body. What:
# things and what happens. When: the sky and the weather, and the times of a life (Wang Fu's ten kinds of dream include
# dreams of the season, 時夢; the book itself has no section on time). Where: places. Edit it to suit the cards.
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

def ws(p: str | Path) -> Path:
    """A workspace path as the helper writes it ("images/x/a.jpg") to a path from the repo root."""
    return WORKSPACE / p


def rel(p: Path) -> str:
    return str(p.relative_to(WORKSPACE)) if p.is_relative_to(WORKSPACE) else str(p)


def key_of(c: dict[str, int]) -> str:
    return "-".join(str(c[q]) for q in QUALITIES)


def parse_key(k: str) -> dict[str, int]:
    parts = k.split("-")
    if len(parts) != 4 or not all(p.isdigit() for p in parts):
        sys.exit(f"dream: a combination is four card numbers, who-what-when-where, like 1-3-2-4; not {k}")
    return dict(zip(QUALITIES, map(int, parts)))


def say(*a) -> None:
    print(*a, flush=True)


def latent_mod():
    import latent  # Kandinsky's encoder and decoder, loaded the one way (latent.py)

    return latent


def unit(v: np.ndarray) -> np.ndarray:
    return v / max(float(np.linalg.norm(v)), 1e-9)


# ---------------------------------------------------------------- Ollama


def ollama(path: str, body: dict, timeout: int = 600) -> dict:
    req = urllib.request.Request(f"{OLLAMA}{path}", json.dumps(body).encode(), {"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def embed(texts: list[str], model: str) -> np.ndarray:
    out = []
    for i in range(0, len(texts), 32):
        out += ollama("/api/embed", {"model": model, "input": texts[i : i + 32]})["embeddings"]
    a = np.array(out, dtype=np.float32)
    return a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-9)


def ask(model: str, prompt: str) -> dict | None:
    """One answer as JSON; None when Ollama isn't running or the answer isn't JSON. Qwen3 reasons at length first
    unless the prompt ends with /no_think (Ollama's think: false was ignored when tested)."""
    body = {"model": model, "prompt": prompt + " /no_think", "stream": False, "think": False, "format": "json", "options": {"temperature": 0.6, "repeat_penalty": 1.15, "num_ctx": 8192}}
    try:
        return json.loads(ollama("/api/generate", body)["response"])
    except Exception as err:  # noqa: BLE001: any failure means no reading, said on the page
        say(f"  no reading from {model}: {err}")
        return None


def text_of(v, sep: str = " ") -> str:
    """A model's answer as text: it sometimes gives a list of sentences where one paragraph was asked for."""
    return sep.join(str(x) for x in v) if isinstance(v, list) else str(v or "")


def chinese(text: str) -> str:
    """The Chinese reading, sentence by sentence: a small model sometimes leaves English words in it. A sentence with
    English in it is left out; if most of it was English, all of it is."""
    sentences = [x for x in re.split(r"(?<=[。！？])", text) if x.strip()]
    kept = [x for x in sentences if not re.search(r"[A-Za-z]{3,}", x)]
    if len(kept) < len(sentences):
        say(f"  {len(sentences) - len(kept)} of the Chinese reading's sentences had English in them, so they are left out")
    return "".join(kept) if len(kept) * 2 >= len(sentences) else ""


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
    return out


def is_book(raw: Path) -> bool:
    """A dream book in the Zhougong jiemeng's form: sections between == marks, lines of Chinese."""
    return (raw / "source.txt").exists() and len(read_book(raw)) >= 100


def lines_for(book: list[dict], ch: str, n: int = 2) -> list[dict]:
    """The book's lines whose dream holds this character: in its first four characters, where the dream is, not the omen."""
    return [b for b in book if ch in b["zh"][:4]][:n]


# ---------------------------------------------------------------- cards: a demo deck from prompts


def prior_pipe(dtype=None):
    import torch
    from diffusers import KandinskyV22PriorPipeline

    if not (PRIOR / "prior/diffusion_pytorch_model.safetensors").exists():
        sys.exit("dream: drawing from words needs Kandinsky's prior: model get kandinsky-prior (6.9 GB, Apache 2.0)")
    from transformers import CLIPVisionModelWithProjection

    try:
        from transformers import CLIPImageProcessorPil as CLIPImageProcessor
    except ImportError:
        from transformers import CLIPImageProcessor
    L = latent_mod()
    dtype = dtype or torch.float16
    enc = CLIPVisionModelWithProjection.from_pretrained(L.MODEL / "prior/image_encoder", dtype=dtype)
    proc = CLIPImageProcessor.from_pretrained(L.MODEL / "prior/image_processor")
    pipe = KandinskyV22PriorPipeline.from_pretrained(PRIOR, image_encoder=enc, image_processor=proc, dtype=dtype).to(L.DEV)
    pipe.set_progress_bar_config(disable=True)
    return pipe


def cards(prefix: str) -> None:
    """The demo deck: Kandinsky's prior turns each prompt into 1280 numbers, its decoder draws them. images/<prefix>-<quality>/."""
    import torch

    L = latent_mod()
    t = time.time()
    pipe = prior_pipe()
    embeds = {}
    with torch.no_grad():
        for q in QUALITIES:
            for i, p in enumerate(DEMO[q]):
                o = pipe(f"{p}, {STYLE}", guidance_scale=4.0, num_inference_steps=25, generator=torch.Generator("cpu").manual_seed(i))
                embeds[(q, i)] = (o.image_embeds.float().cpu(), o.negative_image_embeds.float().cpu())
    del pipe
    if L.DEV == "mps":
        torch.mps.empty_cache()
    say(f"  16 prompts into Kandinsky's numbers by the prior in {time.time() - t:.0f}s")
    dec = L.decoder()
    for q in QUALITIES:
        out = WORKSPACE / "images" / f"{prefix}-{q}"
        out.mkdir(parents=True, exist_ok=True)
        credits = []
        for i, p in enumerate(DEMO[q]):
            e, n = embeds[(q, i)]
            dt = dec.unet.dtype
            t = time.time()
            with torch.no_grad():
                im = dec(image_embeds=e.to(L.DEV, dt), negative_image_embeds=n.to(L.DEV, dt), height=512, width=512, num_inference_steps=L.STEPS, guidance_scale=4.0, generator=torch.Generator("cpu").manual_seed(i)).images[0]
            name = f"{q}-{i + 1}.png"
            im.save(out / name)
            credits.append({"file": name, "title": p, "prompt": f"{p}, {STYLE}"})
            say(f"  ◂ images/{prefix}-{q}/{name}: {p} ({time.time() - t:.0f}s)")
        (out / "cards.json").write_text(json.dumps({"quality": q, "style": STYLE, "credits": credits}, indent=1) + "\n")


# ---------------------------------------------------------------- deck


def deck(out: Path, folders: dict[str, Path]) -> None:
    from latent import pictures
    from mood import Siglip
    from PIL import Image

    files, titles = {}, {}
    for q in QUALITIES:
        fs = pictures(folders[q])
        if len(fs) < 2:
            sys.exit(f"dream deck: {folders[q]} has {len(fs)} pictures; a quality needs 2 cards at the least (4 is the deck)")
        files[q] = fs[:4]
        for name in ("manifest.json", "cards.json"):
            m = folders[q] / name
            if m.exists():
                for c in json.loads(m.read_text()).get("credits", []):
                    titles[(q, c["file"])] = c.get("title", "")
        say(f"  {q} ({ZH[q]}): {len(files[q])} cards from {folders[q]}" + (f" (the first 4 of {len(fs)})" if len(fs) > 4 else ""))
    out.mkdir(parents=True, exist_ok=True)
    allf = [f for q in QUALITIES for f in files[q]]
    L = latent_mod()
    E, grey = L.encode(allf, [Image.new("RGB", (224, 224), (128, 128, 128))])
    sg = Siglip()
    S = sg.images(allf)
    words = {q: sg.sentences([f"a picture of {en}" for _, en in GLOSSARY[q]]) for q in QUALITIES}
    qs, i = {}, 0
    for q in QUALITIES:
        cs = []
        for n, f in enumerate(files[q], 1):
            sim = words[q] @ S[i]
            top = np.argsort(-sim)[:3]
            cs.append({"n": n, "file": rel(f), "index": i, "title": titles.get((q, f.name), ""), "words": [{"zh": GLOSSARY[q][k][0], "en": GLOSSARY[q][k][1], "score": round(float(sim[k]), 3)} for k in top]})
            say(f"  {q} {n}: {f.name}" + (f" ({cs[-1]['title']})" if cs[-1]["title"] else "") + " · " + ", ".join(f"{w['en']} {w['zh']}" for w in cs[-1]["words"]))
            i += 1
        qs[q] = {"folder": rel(folders[q]), "cards": cs}
    np.savez(out / "embeddings.npz", kandinsky=E, siglip=S, grey=grey[0], length=float(np.linalg.norm(E, axis=1).mean()))
    n = 1
    for q in QUALITIES:
        n *= len(qs[q]["cards"])
    (out / "deck.json").write_text(json.dumps({"qualities": qs, "zh": ZH, "combinations": n}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    say(f"  ◂ deck.json: {sum(len(qs[q]['cards']) for q in QUALITIES)} cards, {n} combinations")


def describe(card: dict) -> str:
    """A card in words: its title, if it has one; else its nearest glossary words (SigLIP's second and third guesses
    can be wrong, as an ox for a snake, so a title is better when there is one)."""
    return card["title"] if card.get("title") else ", ".join(w["en"] for w in card["words"])


# ---------------------------------------------------------------- guide texts


def passages_of(src: str) -> tuple[list[str], dict]:
    """A guide text's passages: raw/<name> is cut already (chunks.jsonl); uploads/<file> is cut here, by paragraphs."""
    p = ws(src)
    if src.startswith("raw/"):
        m = json.loads((p / "manifest.json").read_text()) if (p / "manifest.json").exists() else {}
        chunks = [json.loads(l)["text"] for l in (p / "chunks.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
        about = {"name": p.name, "license": m.get("license", ""), "about": m.get("about", "")}
    else:
        text = p.read_text(encoding="utf-8", errors="replace")
        chunks, cur = [], ""
        for para in re.split(r"\n\s*\n", text):
            if len(cur) + len(para) > 900 and cur:
                chunks.append(cur.strip())
                cur = ""
            cur += para + "\n\n"
        if cur.strip():
            chunks.append(cur.strip())
        about = {"name": p.name, "license": "the student's own", "about": "uploaded"}
    # leave out a wiki page's markup lines and a book's front matter, which say nothing about dreams
    chunks = [re.sub(r"\{\{.*?\}\}|\[\[|\]\]|'''|''|</?\w+[^>]*>|^=+.*?=+\s*$", "", c, flags=re.S | re.M).strip() for c in chunks]
    return [c for c in chunks if len(c) >= 80], about


def guide(out: Path, texts: list[str], model: str) -> None:
    if not (out / "deck.json").exists():
        sys.exit(f"dream guide: no deck in {out}; make it first with dream deck")
    rows, about, book = [], [], None
    for src in texts:
        p = ws(src)
        if not p.exists():
            sys.exit(f"dream guide: no {p}")
        if src.startswith("raw/") and is_book(p):
            book = src
            n = len(read_book(p))
            about.append({"from": src, "name": p.name, "kind": "dream book", "passages": n})
            say(f"  {src}: a dream book, {n} lines; looked up by the cards' glossary words")
            continue
        ps, a = passages_of(src)
        rows += [{"from": src, "text": t[:900]} for t in ps]
        about.append({"from": src, **a, "kind": "text", "passages": len(ps)})
        say(f"  {src}: {len(ps)} passages")
    V = np.zeros((0, 768), np.float32)
    if rows:
        t = time.time()
        try:
            V = embed([f"search_document: {r['text']}" for r in rows], model)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"dream guide: {model} in Ollama didn't answer ({err}); is Ollama running, and has it {model}? ollama pull {model}")
        say(f"  {len(rows)} passages measured by {model} in {time.time() - t:.0f}s")
    np.save(out / "guide.npy", V)
    with (out / "guide-passages.jsonl").open("w", encoding="utf-8") as f:
        for i, r in enumerate(rows):
            f.write(json.dumps({"i": i, **r}, ensure_ascii=False) + "\n")
    (out / "guide.json").write_text(json.dumps({"texts": about, "book": book, "embed": model}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    say(f"  ◂ guide.json: {len(about)} guide texts" + (f", the dream book {book}" if book else ""))


# ---------------------------------------------------------------- interpret


# How each library text is named to the language model and on the pages.
TITLES = {
    "zhougong-jiemeng": "the Zhougong jiemeng",
    "wangfu-menglie": "Wang Fu",
    "liezi-zh": "the Liezi",
    "liezi-dreams": "the Liezi",
    "zhuangzi": "the Zhuangzi",
    "freud-dreams": "Freud",
    "jung-unconscious": "Jung",
    "kuunmong": "the Kuunmong",
    "dream-incubation": "Wikipedia on dream incubation",
}


def title_of(src: str) -> str:
    return TITLES.get(ws(src).name, ws(src).stem.replace("-", " "))


PROMPT = """You interpret dreams for an art installation, using only the guide texts below; they are what the artist chose.

A visitor chose four cards for their dream:
{cards}{dream}

Passages from the guide texts, numbered, with the text each is from:
{passages}

Answer in JSON with these keys:
- "by_text": one entry for each of these texts: {texts}. Each is {{"text": its name, "sentence": one sentence to the visitor ("you") on what that text's passages say about this dream as a whole}}. Begin each sentence with the text's name ("The Zhougong jiemeng says …", "Wang Fu writes …", "In the Liezi …").
- "together": one sentence joining them: what the four cards mean together, as these texts read them. Say it is what the texts say, not what will happen.
- "reading_zh": all of those sentences, in order, translated into Traditional Chinese (繁體中文): every word in Chinese, no English.
- "picture": one sentence, under 35 words, describing a single dream picture that holds the four cards and the reading, for a painter. No names of texts.
- "used": the numbers of the passages you used.
Use only the passages; don't add omens or ideas that aren't in them."""


def interpret_one(out: Path, d: dict, g: dict, c: dict[str, int], model: str, words: str = "") -> dict:
    cards_ = {q: d["qualities"][q]["cards"][c[q] - 1] for q in QUALITIES}
    found = []
    if g.get("book"):
        book = read_book(ws(g["book"]))
        # one line a card: the first of its words that the book has a line for
        for q in QUALITIES:
            for w in cards_[q]["words"]:
                b = next((b for b in lines_for(book, w["zh"], 3) if not any(f["text"] == b["zh"] for f in found)), None)
                if b:
                    found.append({"from": g["book"], "text": b["zh"], "about": f"{b['section']} · {w['en']} {w['zh']} ({q})"})
                    break
    V = np.load(out / "guide.npy")
    if len(V):
        rows = [json.loads(l) for l in (out / "guide-passages.jsonl").read_text(encoding="utf-8").splitlines()]
        query = "; ".join(f"{q}: {describe(cards_[q])}" for q in QUALITIES) + (f"; the dream: {words}" if words else "")
        qv = embed([f"search_query: a dream of {query}"], g["embed"])[0]
        sim = V @ qv
        per: dict[str, int] = {}
        for i in np.argsort(-sim):
            r = rows[i]
            if per.get(r["from"], 0) >= PASSAGES or len(found) >= MAX_PASSAGES:
                continue
            per[r["from"]] = per.get(r["from"], 0) + 1
            found.append({"from": r["from"], "text": r["text"], "about": f"nearness {sim[i]:.2f}"})
    said = None
    if model != "none" and found:
        named = list(dict.fromkeys(title_of(f["from"]) for f in found))
        said = ask(model, PROMPT.format(
            cards="\n".join(f"- {q} ({ZH[q]}): {describe(cards_[q])}" for q in QUALITIES),
            dream=f'\nThey said of their dream: "{words}"' if words else "",
            passages="\n".join(f"[{i + 1}] ({title_of(f['from'])}) {f['text']}" for i, f in enumerate(found)),
            texts=", ".join(named),
        ))
    if said:
        parts = [text_of(x.get("sentence", "")) for x in said.get("by_text", []) if isinstance(x, dict)] + [text_of(said.get("together", ""))]
        said["reading"] = " ".join(dict.fromkeys(p.strip() for p in parts if p.strip()))
    return {
        "combination": key_of(c),
        "cards": {q: {"n": c[q], "file": cards_[q]["file"], "title": cards_[q].get("title", ""), "words": cards_[q]["words"]} for q in QUALITIES},
        "dream": words,
        "passages": found,
        "reading": text_of(said.get("reading", "")) if said else "",
        "reading_zh": chinese(text_of(said.get("reading_zh", ""), "")) if said else "",
        "picture": text_of(said.get("picture", "")) if said else "a dream of " + ", ".join(describe(cards_[q]) for q in QUALITIES),
        "used": said.get("used", []) if said else [],
        "model": model if said else None,
        "guide": [t["from"] for t in g["texts"]],
        "made": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


def all_combinations(d: dict) -> list[dict[str, int]]:
    return [dict(zip(QUALITIES, ns)) for ns in product(*[range(1, len(d["qualities"][q]["cards"]) + 1) for q in QUALITIES])]


def chosen(d: dict, key: str | None, every: bool) -> list[dict[str, int]]:
    if every:
        return all_combinations(d)
    c = parse_key(key or "")
    for q in QUALITIES:
        if not 1 <= c[q] <= len(d["qualities"][q]["cards"]):
            sys.exit(f"dream: {q} has cards 1 to {len(d['qualities'][q]['cards'])}; not {c[q]}")
    return [c]


def interpret(out: Path, key: str | None, every: bool, model: str) -> None:
    d, g = read(out)
    combos = chosen(d, key, every)
    made = [c for c in combos if every and (out / "combinations" / key_of(c) / "interpretation.json").exists()]
    combos = [c for c in combos if c not in made]
    if made:
        say(f"  {len(made)} interpreted already, kept; {len(combos)} to go")
    t0 = time.time()
    for k, c in enumerate(combos, 1):
        cdir = out / "combinations" / key_of(c)
        t = time.time()
        r = interpret_one(out, d, g, c, model)
        cdir.mkdir(parents=True, exist_ok=True)
        (cdir / "interpretation.json").write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        write_page(out, cdir)
        left = (time.time() - t0) / k * (len(combos) - k)
        say(f"  ◂ {key_of(c)}: {len(r['passages'])} passages, {'a reading' if r['reading'] else 'no reading'} ({time.time() - t:.0f}s{f'; about {left / 60:.0f} min left' if len(combos) > 1 else ''})")
        if len(combos) == 1 and r["reading"]:
            say(f"  {r['reading']}")


def read(out: Path) -> tuple[dict, dict]:
    if not (out / "deck.json").exists():
        sys.exit(f"dream: no deck in {out}; dream deck first")
    if not (out / "guide.json").exists():
        sys.exit(f"dream: no guide texts for {out}; dream guide first")
    return json.loads((out / "deck.json").read_text(encoding="utf-8")), json.loads((out / "guide.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------- draw


def weights_for(v: int) -> dict[str, float]:
    """Variation v is led by quality v (who, what, when, where, then round again): it takes LEAD; the rest share."""
    lead = QUALITIES[v % 4]
    return {q: LEAD if q == lead else (1 - LEAD) / 3 for q in QUALITIES}


def draw(out: Path, key: str | None, every: bool, variations: int, way: str) -> None:
    import torch

    d, _ = read(out)
    combos = [c for c in chosen(d, key, every) if not (every and (out / "combinations" / key_of(c) / f"v{variations}.png").exists())]
    if not combos:
        return say("  every combination has its variations already")
    z = np.load(out / "embeddings.npz")
    K, grey, length = z["kandinsky"], z["grey"], float(z["length"])
    L = latent_mod()
    idx = lambda c, q: d["qualities"][q]["cards"][c[q] - 1]["index"]  # noqa: E731
    jobs = []  # (combination, variation, embeds, negative or None, sentence)
    if way == "prior":
        t = time.time()
        pipe = prior_pipe()
        with torch.no_grad():
            for c in combos:
                ip = out / "combinations" / key_of(c) / "interpretation.json"
                sentence = json.loads(ip.read_text(encoding="utf-8"))["picture"] if ip.exists() else "a dream of " + ", ".join(describe(d["qualities"][q]["cards"][c[q] - 1]) for q in QUALITIES)
                # the sentence into Kandinsky's numbers by the prior, once a combination; then mixed with the cards here
                # (diffusers' interpolate takes a tensor as a picture's pixels, not as these numbers)
                o = pipe(sentence, guidance_scale=4.0, num_inference_steps=25, generator=torch.Generator("cpu").manual_seed(0))
                text_e, neg = o.image_embeds.float().cpu()[0].numpy(), o.negative_image_embeds.float().cpu()
                for v in range(variations):
                    w = weights_for(v)
                    e = sum(w[q] * (1 - SENTENCE) * K[idx(c, q)] for q in QUALITIES) + SENTENCE * text_e
                    jobs.append((c, v, torch.tensor(e, dtype=torch.float32)[None], neg, sentence, w))
        del pipe
        if L.DEV == "mps":
            torch.mps.empty_cache()
        say(f"  {len(jobs)} variations mixed with their picture sentences by the prior in {time.time() - t:.0f}s")
    else:
        for c in combos:
            for v in range(variations):
                w = weights_for(v)
                jobs.append((c, v, sum(w[q] * unit(K[idx(c, q)]) for q in QUALITIES), None, "", w))
    dec = L.decoder()
    t0 = time.time()
    for k, (c, v, e, neg, sentence, w) in enumerate(jobs, 1):
        cdir = out / "combinations" / key_of(c)
        cdir.mkdir(parents=True, exist_ok=True)
        t = time.time()
        with torch.no_grad():
            if neg is None:
                im = L.draw(dec, e, length, grey, seed=v)
            else:
                dt = dec.unet.dtype
                im = dec(image_embeds=e.to(L.DEV, dt), negative_image_embeds=neg.to(L.DEV, dt), height=512, width=512, num_inference_steps=L.STEPS, guidance_scale=4.0, generator=torch.Generator("cpu").manual_seed(v)).images[0]
        im.save(cdir / f"v{v + 1}.png")
        meta_p = cdir / "variations.json"
        meta = json.loads(meta_p.read_text()) if meta_p.exists() else {"variations": []}
        meta["variations"] = [x for x in meta["variations"] if x["file"] != f"v{v + 1}.png"] + [{"file": f"v{v + 1}.png", "with": way, "leads": QUALITIES[v % 4], "weights": {q: round(x, 3) for q, x in w.items()}, **({"sentence": sentence, "sentenceWeight": SENTENCE} if way == "prior" else {})}]
        meta["variations"].sort(key=lambda x: x["file"])
        meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        left = (time.time() - t0) / k * (len(jobs) - k)
        say(f"  ◂ {key_of(c)}/v{v + 1}.png, led by {QUALITIES[v % 4]} ({time.time() - t:.0f}s{f'; about {left / 60:.0f} min left' if len(jobs) > 1 else ''})")
        if (cdir / "interpretation.json").exists():
            write_page(out, cdir)


# ---------------------------------------------------------------- respond


def respond(out: Path, model: str, way: str, variations: int, read_words: bool) -> None:
    choice = json.loads((out / "choice.json").read_text(encoding="utf-8"))
    d, g = read(out)
    c = {q: int(choice[q]) for q in QUALITIES}
    key = key_of(c)
    cdir = out / "combinations" / key
    words = choice.get("dream", "")
    live_reading = read_words and bool(words)
    ip = cdir / "interpretation.json"
    if ip.exists() and not live_reading:
        say(f"  {key}: interpreted ahead of time")
        r = json.loads(ip.read_text(encoding="utf-8"))
    else:
        say(f"  {key}: interpreting now" + (" (with the visitor's words)" if live_reading else ""))
        r = interpret_one(out, d, g, c, model, words if live_reading else "")
        if not live_reading:
            cdir.mkdir(parents=True, exist_ok=True)
            ip.write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if not (cdir / "v1.png").exists():
        say(f"  {key}: drawing now")
        draw(out, key, False, variations, way)
    else:
        say(f"  {key}: drawn ahead of time")
    n = len(list((out / "responses").glob("*"))) + 1 if (out / "responses").exists() else 1
    rdir = out / "responses" / f"{n:03d}"
    rdir.mkdir(parents=True, exist_ok=True)
    pics = sorted(p.name for p in cdir.glob("v*.png"))
    result = {**r, "dream": words, "at": choice.get("at"), "variations": [f"dreams/{out.name}/combinations/{key}/{p}" for p in pics], "page": f"dreams/{out.name}/combinations/{key}/page.html"}
    (rdir / "response.json").write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "latest.json").write_text(json.dumps({"response": rel(rdir / "response.json"), "at": choice.get("at")}) + "\n")
    write_page(out, cdir)
    if r.get("reading"):
        say(f"  {r['reading']}")
    say(f"  wrote {rdir}/response.json")


# ---------------------------------------------------------------- the page


def write_page(out: Path, cdir: Path) -> None:
    """One combination's page: its four cards, its variations, its interpretation and the passages it was written from."""
    from latent import open_image, thumb

    r = json.loads((cdir / "interpretation.json").read_text(encoding="utf-8"))
    meta = json.loads((cdir / "variations.json").read_text()) if (cdir / "variations.json").exists() else {"variations": []}
    e = html.escape
    img = lambda p, size=320: f'<img src="{thumb(open_image(p), size)}" alt="">' if p.exists() else ""  # noqa: E731
    cards_ = "".join(f'<figure>{img(ws(r["cards"][q]["file"]))}<figcaption><b>{q} {ZH[q]} · {r["cards"][q]["n"]}</b> {e(r["cards"][q].get("title") or "")} <span class=c>{e(", ".join(w["en"] + " " + w["zh"] for w in r["cards"][q]["words"]))}</span></figcaption></figure>' for q in QUALITIES)
    vars_ = "".join(f'<figure>{img(cdir / v["file"], 512)}<figcaption>{e(v["file"])} · led by {e(v["leads"])} · {e(v["with"])}{" · with the sentence (" + str(int(v["sentenceWeight"] * 100)) + "%)" if v.get("sentence") else ""}</figcaption></figure>' for v in meta["variations"])
    used = set(r.get("used") or [])
    ps = "".join(f'<li class="{"u" if (i + 1) in used else ""}"><b>[{i + 1}] {e(ws(p["from"]).name)}</b> <span class=c>{e(p["about"])}</span><br>{e(p["text"][:600])}</li>' for i, p in enumerate(r["passages"]))
    who = f"Written by {e(r['model'])}, a language model, from the passages below and nothing else; the passages it used are marked." if r.get("model") else "No reading: no language model was chosen, or it didn't answer. The passages stand alone."
    (cdir / "page.html").write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>dream · {e(r['combination'])}</title>
<style>
body{{font:0.875rem/1.5 ui-monospace,Menlo,monospace;background:#111;color:#ddd;margin:1.5rem;max-width:72rem}}
h1,h2{{font-size:1rem;font-weight:500;color:#5CF25C;margin:1.25rem 0 .5rem}} p,li{{color:#bbb}} .c{{color:#888}} b{{color:#ddd;font-weight:500}}
.row{{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem}} figure{{margin:0}} img{{width:100%;display:block}} figcaption{{padding:.25rem 0;color:#999}}
.reading{{font-size:1rem;color:#eee;max-width:56rem}} ol{{padding-left:0;list-style:none}} li{{margin:.75rem 0;max-width:60rem}} li.u b{{color:#5CF25C}}
</style></head><body>
<h1>combination {e(r['combination'])} · who-what-when-where</h1>
<div class="row">{cards_}</div>
<h2>the variations</h2>
<div class="row">{vars_ or '<p class=c>not drawn yet: dream draw</p>'}</div>
{f'<p class=c>picture sentence: {e(r["picture"])}</p>' if r.get("picture") else ''}
<h2>the interpretation</h2>
{f'<p>The dream, in the visitor\'s words: {e(r["dream"])}</p>' if r.get('dream') else ''}
<p class="reading">{e(r.get('reading', ''))}</p>
<p class="reading" lang="zh-Hant">{e(r.get('reading_zh', ''))}</p>
<p class="c">{who} The guide texts are the artist's choice: {e(', '.join(r.get('guide', [])))}. It is what they say, not what will happen.</p>
<h2>the passages</h2>
<ol>{ps}</ol>
</body></html>
""", encoding="utf-8")


def main(argv: list[str]) -> None:
    def opt(name: str, default: str | None = None) -> str | None:
        return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default

    flags_with_values = {"--who", "--what", "--when", "--where", "--embed", "--combination", "--model", "--variations", "--with"}
    pos = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] not in flags_with_values)]
    cmd = pos[0] if pos else ""
    way = opt("--with", "cards")
    if way not in ("cards", "prior"):
        sys.exit("dream: --with is cards or prior")
    if cmd == "cards" and len(pos) == 2:
        cards(pos[1])
    elif cmd == "deck" and len(pos) == 2 and all(opt(f"--{q}") for q in QUALITIES):
        deck(Path(pos[1]), {q: Path(opt(f"--{q}")) for q in QUALITIES})
    elif cmd == "guide" and len(pos) >= 3:
        guide(Path(pos[1]), pos[2:], opt("--embed", EMBED))
    elif cmd == "interpret" and len(pos) == 2:
        interpret(Path(pos[1]), opt("--combination"), "--all" in argv, opt("--model", "qwen3:4b"))
    elif cmd == "draw" and len(pos) == 2:
        draw(Path(pos[1]), opt("--combination"), "--all" in argv, int(opt("--variations", "2")), way)
    elif cmd == "respond" and len(pos) == 2:
        respond(Path(pos[1]), opt("--model", "qwen3:4b"), way, int(opt("--variations", "2")), "--read-words" in argv)
    else:
        sys.exit(__doc__.split("\n\n")[1])


if __name__ == "__main__":
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    main(sys.argv[1:])
