"""Image moods: a classifier on SigLIP's picture embeddings, informed by texts.

    python python/variable_machine/mood.py describe <dataset> <out labels.md> --texts raw/<a> [raw/<b> …]
    python python/variable_machine/mood.py train <dataset> <labels.md> <out folder>
    python python/variable_machine/mood.py gallery <classifier folder> <image folder> <out folder>

All paths are relative to the repo root. The encoder is SigLIP base (Google,
Apache 2.0) as ONNX files in workspace/tools/siglip/, run by onnxruntime on
the CPU. Nothing here downloads anything.

What each part does:

- SigLIP turns a picture into 768 numbers (an embedding), and a sentence into
  768 numbers in the same space, so a picture and a sentence about what it
  shows land near each other. It was trained by Google on picture–caption
  pairs; it is not trained further here.
- describe: the texts (Goethe, James, Wikipedia …) are cut into sentences.
  For each mood, the sentences nearest the mood's own training pictures, and
  furthest from the other moods' pictures, are written into labels.md with
  their source. You edit that file: keep, cut or add sentences.
- train: each mood's description (its prompt plus its sentences) becomes a
  starting point for that mood (the texts alone can already sort pictures:
  "zero-shot"). Then a small classifier (one weight per mood per number, a
  softmax) learns from the labelled pictures, starting from the texts and
  held near them by as much as cross-checking on the training rows says
  helps (with 400 labelled pictures: not at all; with 3 a mood: a little). It is checked on the rows set aside (valid.jsonl), against three
  others: always the commonest mood, the texts alone, and the labels alone.
- gallery: every picture in a folder gets a mood, how sure the classifier is,
  and a one-line reason: what was measured in its colours (light or dark,
  warm or cool, strong or muted) and the sentence from that mood's sentences
  nearest it, compared with the other pictures (so one general sentence isn't
  every picture's reason). The sentence is found, not written: it is the
  nearest passage, not the classifier's reasoning.
"""

from __future__ import annotations

import base64
import csv
import html
import io
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps
from tokenizers import Tokenizer

ENCODER = Path("workspace/tools/siglip")
PROMPT = "a picture that feels {}"
# The four quarters of Russell's circumplex (valence across, arousal up), each
# said in a few everyday words, so the prompt means more than one word does.
# Any other mood is prompted by its own name; edit the prompt in labels.md.
MOOD_WORDS = {
    "calm": "calm, peaceful, quiet, gentle and serene",
    "lively": "lively, joyful, bright, cheerful and energetic",
    "sombre": "sombre, sad, gloomy, dull and melancholy",
    "tense": "tense, frightening, dangerous, violent and alarming",
}


def prompt_of(label: str) -> str:
    return PROMPT.format(MOOD_WORDS.get(label, label))
QUESTION = "What mood does this picture convey?"


# ---------- the encoder ----------


class Siglip:
    def __init__(self) -> None:
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.vision = ort.InferenceSession(str(ENCODER / "onnx/vision_model_quantized.onnx"), opts)
        self.text = ort.InferenceSession(str(ENCODER / "onnx/text_model_quantized.onnx"), opts)
        self.tok = Tokenizer.from_file(str(ENCODER / "tokenizer.json"))
        # SigLIP was trained on lowercase text padded to 64 tokens: anything else moves the embeddings
        self.tok.enable_padding(pad_id=1, pad_token="</s>", length=64)
        self.tok.enable_truncation(64)

    @staticmethod
    def pixels(im: Image.Image) -> np.ndarray:
        im = im.convert("RGB").resize((224, 224), Image.BICUBIC)
        return ((np.asarray(im, np.float32) / 255 - 0.5) / 0.5).transpose(2, 0, 1)

    def images(self, files: list[Path], what: str = "pictures") -> np.ndarray:
        out = []
        t0 = time.time()
        for i in range(0, len(files), 16):
            batch = np.stack([self.pixels(open_image(f)) for f in files[i : i + 16]])
            out.append(self.vision.run(["pooler_output"], {"pixel_values": batch})[0])
            done = min(i + 16, len(files))
            print(f"  embedded {done}/{len(files)} {what} · {time.time() - t0:.0f}s", flush=True)
        return unit(np.concatenate(out)) if out else np.zeros((0, 768), np.float32)

    def sentences(self, texts: list[str]) -> np.ndarray:
        out = []
        for i in range(0, len(texts), 32):
            ids = np.array([e.ids for e in self.tok.encode_batch([t.lower() for t in texts[i : i + 32]])], np.int64)
            out.append(self.text.run(["pooler_output"], {"input_ids": ids})[0])
        return unit(np.concatenate(out)) if out else np.zeros((0, 768), np.float32)


def unit(x: np.ndarray) -> np.ndarray:
    return (x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-9)).astype(np.float32)


def open_image(f: Path) -> Image.Image:
    im = Image.open(f)
    return ImageOps.exif_transpose(im).convert("RGB")


# ---------- a picture dataset's rows ----------


def label_of(row: dict) -> str:
    """The mood a row gives: its answer, up to a colon (so "calm: because …" is calm)."""
    answer = next(m["content"] for m in row["messages"] if m["role"] == "assistant")
    return answer.split(":")[0].strip().lower()


def read_rows(dataset: Path, part: str) -> list[tuple[Path, str]]:
    f = dataset / f"{part}.jsonl"
    if not f.exists():
        return []
    rows = [json.loads(l) for l in f.read_text().splitlines() if l.strip()]
    return [(dataset / r["images"][0], label_of(r)) for r in rows]


def embeddings(enc: Siglip, dataset: Path, files: list[Path]) -> np.ndarray:
    """Picture embeddings, kept in the dataset folder so a second run doesn't redo them."""
    cache = dataset / "embeddings-siglip.npz"
    have: dict[str, np.ndarray] = {}
    if cache.exists():
        z = np.load(cache)
        have = dict(zip(z["files"].tolist(), z["x"]))
    todo = [f for f in files if f.name not in have]
    if todo:
        for f, x in zip(todo, enc.images(todo)):
            have[f.name] = x
        np.savez(cache, files=np.array(list(have)), x=np.stack(list(have.values())))
    else:
        print(f"  {len(files)} pictures already embedded ({cache})")
    return np.stack([have[f.name] for f in files])


# ---------- texts → sentences ----------


def sentences_of(raw: Path) -> list[str]:
    """A raw text's passages, cut into sentences short enough for SigLIP (it reads 64 tokens)."""
    out: list[str] = []
    for line in (raw / "chunks.jsonl").read_text().splitlines():
        if not line.strip():
            continue
        text = re.sub(r"\s+", " ", json.loads(line)["text"]).strip()
        for s in re.split(r"(?<=[.!?;])\s+(?=[A-Z\"'(])", text):
            s = s.strip().strip("\"'")
            # drop numbered headings, footnote marks, tables of contents: a sentence has words
            n = len(s.split())
            # and no markup: Gutenberg's _italics_ and =headings= are a book's layout, not its words
            if 8 <= n <= 40 and re.search(r"[a-z]{3}", s) and not re.search(r"\[\d+\]|[_=]|\.{4,}|\bCHAPTER\b", s):
                out.append(s)
    return list(dict.fromkeys(out))


def source_name(raw: Path) -> str:
    m = json.loads((raw / "manifest.json").read_text())
    return m.get("title") or m.get("about") or raw.name


# ---------- labels.md: each mood's prompt and sentences ----------


def write_labels(path: Path, labels: list[str], picked: dict[str, list[tuple[str, str, float]]], texts: list[str]) -> None:
    lines = [
        "# What each mood means",
        "",
        "Each mood has a prompt, then sentences from the texts, each with where it came from. Training reads this file:",
        "each mood starts from what its prompt and sentences say, then learns from the labelled pictures. The gallery",
        "quotes the sentence nearest each picture. Keep, cut or rewrite sentences; add your own as `- \"…\" (yours)`.",
        "",
        f"Picked by `mood describe` from {', '.join(texts)}: for each mood, the sentences nearest its prompt and nearer",
        "its own training pictures than the other moods' pictures. Nearness here is SigLIP's, which was trained on",
        "captions, so a sentence about colour or light scores higher than one about a feeling. Check every one.",
        "",
    ]
    for label in labels:
        lines += [f"## {label}", "", f"prompt: {prompt_of(label)}", ""]
        lines += [f'- "{s}" ({src})' for s, src, _ in picked.get(label, [])]
        lines.append("")
    path.write_text("\n".join(lines))


def read_labels(path: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    cur = None
    for line in path.read_text().splitlines():
        if line.startswith("## "):
            cur = line[3:].strip().lower()
            out[cur] = {"prompt": prompt_of(cur), "sentences": []}
        elif cur and line.startswith("prompt:"):
            out[cur]["prompt"] = line[7:].strip()
        elif cur and line.startswith("- "):
            m = re.match(r'-\s*"(.+)"\s*\((.+)\)\s*$', line)
            if m:
                out[cur]["sentences"].append({"text": m.group(1), "source": m.group(2)})
    return out


# ---------- describe ----------


def describe(dataset: Path, out: Path, raws: list[Path], per: int = 8) -> None:
    rows = read_rows(dataset, "train")
    if not rows:
        sys.exit(f"mood describe: {dataset}/train.jsonl has no rows")
    labels = sorted({l for _, l in rows})
    enc = Siglip()
    x = embeddings(enc, dataset, [f for f, _ in rows])
    y = np.array([labels.index(l) for _, l in rows])
    centres = unit(np.stack([x[y == k].mean(0) for k in range(len(labels))]))

    sents: list[tuple[str, str]] = []
    for raw in raws:
        ss = sentences_of(raw)
        print(f"  {raw}: {len(ss)} sentences ({source_name(raw)})")
        sents += [(s, raw.name) for s in ss]
    if not sents:
        sys.exit("mood describe: the texts have no sentences of 8 to 40 words")
    print(f"  embedding {len(sents)} sentences …", flush=True)
    t0 = time.time()
    e = enc.sentences([s for s, _ in sents])
    print(f"  done in {time.time() - t0:.0f}s")
    # two nearnesses, each measured against the other moods so a sentence near everything scores nothing:
    # to the mood's words (its prompt), and, counted half, to the mood's own training pictures
    z = lambda a: (a - a.mean(0)) / (a.std(0) + 1e-9)
    by_words = e @ enc.sentences([prompt_of(l) for l in labels]).T
    by_pictures = e @ centres.T
    sim = z(by_words - by_words.mean(1, keepdims=True)) + 0.5 * z(by_pictures - by_pictures.mean(1, keepdims=True))
    picked: dict[str, list[tuple[str, str, float]]] = {}
    for k, label in enumerate(labels):
        score = sim[:, k]
        best = np.argsort(-score)[:per]
        picked[label] = [(sents[i][0], sents[i][1], float(score[i])) for i in best]
        print(f"  {label}: {len(best)} sentences, e.g. \"{sents[best[0]][0][:90]}\"")
    write_labels(out, labels, picked, [str(r) for r in raws])
    print(f"  wrote {out}: {len(labels)} moods. Read it, cut what doesn't fit, then train")


# ---------- train ----------


def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def fit(x: np.ndarray, y: np.ndarray, k: int, prior: np.ndarray, lam: float, steps: int = 400) -> tuple[np.ndarray, np.ndarray]:
    """Softmax regression by gradient descent, held near `prior` (each mood's text) by lam·|W − prior|²."""
    w = prior.copy()
    b = np.zeros(k, np.float32)
    onehot = np.eye(k, dtype=np.float32)[y]
    # classes weighted equally, so a common mood doesn't win by being common
    cw = (len(y) / (k * np.bincount(y, minlength=k).clip(1)))[y][:, None]
    lr = 2.0
    for _ in range(steps):
        p = softmax(x @ w.T + b)
        g = (p - onehot) * cw / len(y)
        w -= lr * (g.T @ x + lam * (w - prior))
        b -= lr * g.sum(0)
    return w, b


def scores(pred: np.ndarray, y: np.ndarray, k: int) -> dict:
    acc = float((pred == y).mean()) if len(y) else 0.0
    per = []
    for c in range(k):
        tp = int(((pred == c) & (y == c)).sum())
        fp = int(((pred == c) & (y != c)).sum())
        fn = int(((pred != c) & (y == c)).sum())
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        per.append({"precision": round(p, 3), "recall": round(r, 3), "f1": round(2 * p * r / (p + r), 3) if p + r else 0.0, "n": int((y == c).sum())})
    return {"accuracy": round(acc, 3), "macroF1": round(float(np.mean([c["f1"] for c in per])), 3), "per": per}


SCALE = 10.0  # how sharp the texts' starting point is: SigLIP's similarities are small numbers


def train(dataset: Path, labels_md: Path, out: Path) -> None:
    rows, held = read_rows(dataset, "train"), read_rows(dataset, "valid")
    if not held:
        sys.exit(f"mood train: no rows set aside in {dataset}/valid.jsonl. Split the dataset first (data split <name> --valid 0.2)")
    desc = read_labels(labels_md)
    labels = sorted({l for _, l in rows})
    missing = [l for l in labels if l not in desc]
    if missing:
        sys.exit(f"mood train: {labels_md} has no section for {', '.join(missing)}")
    k = len(labels)
    enc = Siglip()
    x = embeddings(enc, dataset, [f for f, _ in rows])
    xv = embeddings(enc, dataset, [f for f, _ in held])
    y = np.array([labels.index(l) for _, l in rows])
    keep = [i for i, (_, l) in enumerate(held) if l in labels]
    xv, yv = xv[keep], np.array([labels.index(held[i][1]) for i in keep])

    # each mood's text: its prompt and its sentences, averaged into one direction
    passages: list[dict] = []
    proto = []
    for label in labels:
        d = desc[label]
        texts = [d["prompt"]] + [s["text"] for s in d["sentences"]]
        e = enc.sentences(texts)
        proto.append(unit(e.mean(0)))
        passages += [{"label": label, "text": s["text"], "source": s["source"], "e": e[i + 1]} for i, s in enumerate(d["sentences"])]
        print(f"  {label}: its prompt and {len(d['sentences'])} sentences")
    prior = SCALE * np.stack(proto)

    # always the commonest mood; the texts alone; the labels alone; labels and texts
    common = np.bincount(y, minlength=k).argmax()
    zero = (xv @ prior.T).argmax(1)
    print("  choosing how close to keep to the texts, by cross-checking on the training rows …", flush=True)
    folds = np.arange(len(y)) % 5
    rng = np.random.default_rng(0)
    rng.shuffle(folds)
    best = None
    for lam in [0.0, 0.003, 0.01, 0.03, 0.1]:
        right = 0
        for f in range(5):
            tr, te = folds != f, folds == f
            w, b = fit(x[tr], y[tr], k, prior, lam)
            right += int(((x[te] @ w.T + b).argmax(1) == y[te]).sum())
        print(f"    held near the texts by {lam:<6} {right / len(y):.0%} right on the training rows, each held out in turn")
        if best is None or right > best[1]:
            best = (lam, right)
    lam = best[0]
    w, b = fit(x, y, k, prior, lam)
    wl, bl = fit(x, y, k, np.zeros_like(prior), max(lam, 0.003))
    result = {
        "rows": {"train": len(y), "setAside": len(yv)},
        "labels": labels,
        "heldNear": lam,
        "commonest": {"label": labels[common], **scores(np.full(len(yv), common), yv, k)},
        "textsAlone": scores(zero, yv, k),
        "labelsAlone": scores((xv @ wl.T + bl).argmax(1), yv, k),
        "labelsAndTexts": scores((xv @ w.T + b).argmax(1), yv, k),
    }
    pred = (xv @ w.T + b).argmax(1)
    result["confusion"] = [[int(((yv == a) & (pred == c)).sum()) for c in range(k)] for a in range(k)]

    out.mkdir(parents=True, exist_ok=True)
    np.savez(out / "classifier.npz", w=w, b=b, labels=np.array(labels))
    np.savez(out / "passages.npz", e=np.stack([p["e"] for p in passages]) if passages else np.zeros((0, 768), np.float32))
    (out / "passages.json").write_text(json.dumps([{k_: v for k_, v in p.items() if k_ != "e"} for p in passages], indent=1) + "\n")
    (out / "check.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"\n  on {len(yv)} rows set aside, never trained on:")
    for name, key in [("always the commonest mood", "commonest"), ("the texts alone", "textsAlone"), ("the labels alone", "labelsAlone"), ("labels and texts", "labelsAndTexts")]:
        r = result[key]
        print(f"    {name:<26} {r['accuracy']:.0%} right · balanced F1 {r['macroF1']:.2f}")
    print("  per mood (labels and texts):")
    for label, r in zip(labels, result["labelsAndTexts"]["per"]):
        print(f"    {label:<12} found {r['recall']:.0%} of {r['n']} · right {r['precision']:.0%} of the time it says so")
    print("  rows are what it was; columns what it said:")
    print("    " + " ".join(f"{l[:8]:>8}" for l in labels))
    for label, row in zip(labels, result["confusion"]):
        print(f"    {' '.join(f'{n:>8}' for n in row)}  {label}")


# ---------- gallery ----------


def colour_words(im: Image.Image) -> tuple[str, dict]:
    """What can be measured in a picture's colours, in words: light, warmth, strength, contrast."""
    a = np.asarray(im.convert("RGB").resize((96, 96)), np.float32) / 255
    hsv = np.asarray(im.convert("RGB").resize((96, 96)).convert("HSV"), np.float32) / 255
    light = float(a.mean())
    sat = float(hsv[..., 1].mean())
    warm = float((a[..., 0] - a[..., 2]).mean())  # red over blue
    contrast = float(a.mean(-1).std())
    words = [
        "dark" if light < 0.33 else "bright" if light > 0.62 else "mid-toned",
        "warm" if warm > 0.06 else "cool" if warm < -0.04 else "neutral in temperature",
        "strong colour" if sat > 0.45 else "muted colour" if sat < 0.2 else "moderate colour",
        "high contrast" if contrast > 0.26 else "low contrast" if contrast < 0.14 else "",
    ]
    return ", ".join(w for w in words if w), {"light": round(light, 3), "saturation": round(sat, 3), "warmth": round(warm, 3), "contrast": round(contrast, 3)}


def thumb(im: Image.Image) -> str:
    t = im.copy()
    t.thumbnail((360, 360))
    buf = io.BytesIO()
    t.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def gallery(classifier: Path, folder: Path, out: Path) -> None:
    z = np.load(classifier / "classifier.npz")
    w, b, labels = z["w"], z["b"], z["labels"].tolist()
    passages = json.loads((classifier / "passages.json").read_text())
    pe = np.load(classifier / "passages.npz")["e"]
    check = json.loads((classifier / "check.json").read_text())
    files = sorted(f for f in folder.iterdir() if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    if not files:
        sys.exit(f"mood gallery: no pictures in {folder}")
    credits = {}
    m = folder / "manifest.json"
    if m.exists():
        credits = {c["file"]: c for c in json.loads(m.read_text()).get("credits", [])}
    enc = Siglip()
    x = enc.images(files)
    p = softmax(x @ w.T + b)
    out.mkdir(parents=True, exist_ok=True)
    # how near each passage is to each picture, less how near it is to every picture here: a passage
    # near everything (a general one about light) would otherwise be every picture's reason
    near = pe @ x.T if len(pe) else np.zeros((0, len(x)))
    near = near - near.mean(1, keepdims=True)
    items = []
    for n, (f, xi, pi) in enumerate(zip(files, x, p)):
        k = int(pi.argmax())
        im = open_image(f)
        words, measured = colour_words(im)
        mine = [i for i, q in enumerate(passages) if q["label"] == labels[k]]
        quote = None
        if mine:
            j = mine[int(np.argmax(near[mine, n]))]
            quote = passages[j]
        reason = words + (f'; nearest passage: "{quote["text"]}" ({quote["source"]})' if quote else "")
        c = credits.get(f.name, {})
        items.append({
            "file": f.name, "mood": labels[k], "confidence": round(float(pi[k]), 3),
            "all": {l: round(float(v), 3) for l, v in zip(labels, pi)},
            "reason": reason, "measured": measured,
            **({"title": c["title"]} if c.get("title") else {}),
            **({"author": c["author"]} if c.get("author") else {}),
            **({"license": c["license"]} if c.get("license") else {}),
            **({"url": c["url"]} if c.get("url") else {}),
            "_thumb": thumb(im),
        })
    (out / "moods.json").write_text(json.dumps([{k_: v for k_, v in i.items() if k_ != "_thumb"} for i in items], indent=1) + "\n")
    with open(out / "moods.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["file", "mood", "confidence", "reason", "title", "author", "license", "url"])
        for i in items:
            wr.writerow([i["file"], i["mood"], i["confidence"], i["reason"], i.get("title", ""), i.get("author", ""), i.get("license", ""), i.get("url", "")])
    write_html(out / "gallery.html", items, labels, check, classifier, folder)
    counts = {l: sum(1 for i in items if i["mood"] == l) for l in labels}
    print(f"  {len(items)} pictures: " + " · ".join(f"{l} {n}" for l, n in counts.items()))
    print(f"  wrote {out}/gallery.html, moods.csv, moods.json")


def write_html(path: Path, items: list[dict], labels: list[str], check: dict, classifier: Path, folder: Path) -> None:
    e = html.escape
    best = check["labelsAndTexts"]
    cards = []
    for i in sorted(items, key=lambda i: (labels.index(i["mood"]), -i["confidence"])):
        credit = " · ".join(x for x in [i.get("title", ""), i.get("author", ""), i.get("license", "")] if x)
        cards.append(
            f'<figure><img src="{i["_thumb"]}" alt="{e(i.get("title", i["file"]))}"><figcaption>'
            f'<b>{e(i["mood"])}</b> <span class="c">{i["confidence"]:.0%}</span>'
            f'<span class="r">{e(i["reason"])}</span>'
            f'<span class="f">{e(i["file"])}{" · " + e(credit) if credit else ""}</span></figcaption></figure>'
        )
    path.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>moods · {e(folder.name)}</title>
<style>
body{{font:0.875rem/1.45 ui-monospace,Menlo,monospace;background:#111;color:#ddd;margin:1.5rem}}
h1{{font-size:1rem;font-weight:500;color:#5CF25C;margin:0 0 .5rem}} p{{margin:.25rem 0;color:#999;max-width:60rem}}
main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem;margin-top:1.25rem}}
figure{{margin:0;background:#1a1a1a;border:1px solid #2a2a2a}} img{{width:100%;aspect-ratio:1;object-fit:cover;display:block}}
figcaption{{padding:.5rem .625rem;display:flex;flex-wrap:wrap;gap:.25rem .5rem}} b{{color:#5CF25C;font-weight:500}}
.c{{color:#999}} .r{{flex-basis:100%;color:#ccc}} .f{{flex-basis:100%;color:#777;font-size:.75rem}}
</style></head><body>
<h1>{e(folder.name)} · {len(items)} pictures · moods by {e(classifier.name)}</h1>
<p>Each picture's mood, how sure the classifier is (its share of 100% across {e(", ".join(labels))}), and a reason: what was measured in its colours, then the passage from the texts nearest the picture among that mood's passages. The passage is found, not written, and is not the classifier's reasoning.</p>
<p>On {check["rows"]["setAside"]} pictures set aside, it was right {best["accuracy"]:.0%} of the time (balanced F1 {best["macroF1"]:.2f}); always guessing the commonest mood is right {check["commonest"]["accuracy"]:.0%}. It judges what a picture conveys by its look; it can't tell what anyone in it feels.</p>
<main>{"".join(cards)}</main></body></html>
""")


def main(argv: list[str]) -> None:
    if len(argv) >= 3 and argv[0] == "describe" and "--texts" in argv:
        i = argv.index("--texts")
        describe(Path(argv[1]), Path(argv[2]), [Path(a) for a in argv[i + 1 :]])
    elif len(argv) == 4 and argv[0] == "train":
        train(Path(argv[1]), Path(argv[2]), Path(argv[3]))
    elif len(argv) == 4 and argv[0] == "gallery":
        gallery(Path(argv[1]), Path(argv[2]), Path(argv[3]))
    else:
        sys.exit(__doc__.split("\n\n")[1])


if __name__ == "__main__":
    main(sys.argv[1:])
