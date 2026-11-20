"""The latent image of a collection: what a set of pictures holds that no single picture shows.

    python python/variable_machine/latent.py crop <screenshot folder> <out folder> [--grid]
    python python/variable_machine/latent.py make <image folder> <out folder>
    python python/variable_machine/latent.py train <latent folder> <image folder> [--steps 800]
    python python/variable_machine/latent.py gallery <latent folder> <image folder> <out folder> [--brings 4]
    python python/variable_machine/latent.py room <latent folder> <image folder> [<raw text folder> …] [--embed nomic-embed-text]
    python python/variable_machine/latent.py respond <latent folder> --pick 3,7,12

All paths are relative to the repo root. The model is Kandinsky 2.2
(Sber AI, Apache 2.0) in workspace/tools/kandinsky/: its image encoder (CLIP
ViT-bigG/14, from the prior repo) and its decoder (a diffusion U-Net and the
MoVQ autoencoder). It runs in torch on the Mac's GPU (MPS). Nothing here
downloads anything.

What each part does:

- crop: screenshots (of Instagram posts, stories and reels, or with --grid
  of the Saved grid or a photo roll) cut down to the pictures in them, so the app's own
  header, buttons and captions don't become part of the latent image.
- make: the encoder turns each picture into 1280 numbers (an embedding):
  what the picture shows and how it looks, as a model trained on hundreds of
  millions of pictures measures them. The collection's statistics are fitted
  to those: the mean (the centre) and the main axes along which the
  pictures differ (principal components), with their spreads. The decoder
  turns the mean back into a picture: that is the latent image. Each axis is
  shown as two pictures, the mean minus and plus two spreads. Beside them,
  the pixel average is the baseline. The check: is the
  centre the same when made from either half of the collection, and do
  pictures set aside fit the axes as well as the ones they were fitted on?
- train: the decoder itself learns the collection (LoRA: small added
  weights, 1.6M beside the decoder's 1.2 billion), so the latent image is
  drawn in the collection's own look. It needs about 9 GB of memory and
  1.2–1.5 s a step; 800 steps is about 16–20 minutes.
- gallery: every picture in a folder is measured against the latent image:
  how far it is from the centre (in the collection's own spreads: 1 is
  typical), where it sits on the first five axes, and what it brings: the
  share of how it differs that the axes don't explain. The pictures that
  bring most get a picture of it: the latent image with that picture's own
  part added, decoded.
- room: the installation's page (#latent-room/<name>) made ready: each
  picture's distance and what it brings, the media-theory lines, and for
  each line the passages of the chosen texts nearest it (measured by an
  embedding model in Ollama, nomic-embed-text). Nothing is drawn.
- respond: a visitor's choice of pictures, drawn: the centre of the
  pictures chosen, decoded (by the trained decoder, if there is one) in two
  variations, and how near that centre is to the collection's, against
  random choices of as many pictures.

A mean and a few directions of spread is all the latent image is: a picture
made from copies, of no picture. The texts on the card are media theory
(Benjamin, Barthes, Baudrillard, Lacan) and frame it; they don't change it.
"""

from __future__ import annotations

import base64
import html
import io
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps

MODEL = Path("workspace/tools/kandinsky")
EXT = {".jpg", ".jpeg", ".png", ".webp"}
AXES = 5  # measured in the gallery
SHOWN = 3  # axes decoded into pictures
AXES_FROM = 30  # fewer pictures than this: no axis pictures (on 40 landscapes, axis 1 already changed with the half)
GUIDANCE = 2.5  # how hard the decoder is pushed toward the embedding, away from a plain grey picture's
STEPS = 30  # denoising steps per picture
DEV = "mps" if torch.backends.mps.is_available() else "cpu"


# What each part of the gallery page is like, in the media theory the card's texts come from. Each is a likeness:
# the statistics don't do what the theory describes; they give the student a place to argue from.
# Sources: docs/latent-image-reading.md.
PSY = {
    "pixels": "Benjamin: mechanical reproduction strips a picture of its aura, its here and now, and of a negative's prints none is the authentic one (“The Work of Art in the Age of Mechanical Reproduction”, 1935). A screenshot is a copy of a copy; the pixel average is reproduction one step further, a copy of every copy at once.",
    "latent": "Barthes: the studium is the general interest a photograph raises, coded by the viewer's culture (Camera Lucida, 1980). The latent image is the studium of the set: what all of it shares, with nothing in it that pricks. And a photograph says that-has-been: its subject was in front of the lens. No one was ever in front of this one.",
    "trained": "Drawn in the set's own look, copied from no picture in it: in Baudrillard's terms, an image with no relation to any reality, its own simulacrum.",
    "model": [
        "Baudrillard's phases of the image (Simulacra and Simulation, 1981), run through the method: the photograph reflects a reality; the screenshot, cropped, compressed and framed by the app, masks and distorts it; the pixel average masks that there is no one picture behind it; the latent image has no relation to any picture at all. It is a copy without an original, a simulacrum.",
        "Lacan's mirror stage (1949): a child recognises itself in a mirror's whole image while its body feels in pieces, and forms its self on that image of a unity it doesn't have. The saved pictures are a mirror the person recognises themselves in; the latent image is the unified self no single picture shows, and to recognise yourself in it is a misrecognition.",
        "Flusser: a camera is an apparatus with a program, and its pictures are what the program allows (Towards a Philosophy of Photography, 1983). This model learned its program from about two billion pictures from the web, so the latent image can only be a picture that program can draw.",
    ],
    "feed": "If these are saved posts, the person chose them from what the app's recommender offered (Bucher, If...Then, 2018): the set is the person's and the feed's together. The latent image is where the two meet; what a picture brings is where they part.",
    "shots": "Steyerl: a screenshot is a poor image, a copy in motion that loses resolution as it gains reach (“In Defense of the Poor Image”, 2009). The crop cuts each one out of the app's frame; the compression stays in.",
    "axes": "Holmes, on the stereograph: “Form is henceforth divorced from matter” (1859). Each end of an axis is a form with no matter: a way the collection's pictures differ, drawn without any picture.",
    "brings": "Barthes's punctum is the detail that pricks one viewer, by accident; it can't be coded, so no measure finds it. What a picture brings is what the set lacks, which makes it a place to look for one, not the punctum itself.",
}


def pictures(folder: Path) -> list[Path]:
    files = sorted(f for f in folder.iterdir() if f.suffix.lower() in EXT and not f.name.startswith("."))
    if not files:
        sys.exit(f"latent: no pictures in {folder}")
    return files


def open_image(f: Path) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(f)).convert("RGB")


def thumb(im: Image.Image, size: int = 320) -> str:
    im = im.copy()
    im.thumbnail((size, size))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- the model


def encode(files: list[Path], extra: list[Image.Image] = ()) -> tuple[np.ndarray, np.ndarray]:
    """Each picture's 1280-number embedding, and the extra pictures' (the grey one)."""
    from transformers import CLIPVisionModelWithProjection

    try:  # the Pillow one: the default asks for torchvision, which this doesn't install
        from transformers import CLIPImageProcessorPil as CLIPImageProcessor
    except ImportError:
        from transformers import CLIPImageProcessor

    enc = CLIPVisionModelWithProjection.from_pretrained(MODEL / "prior/image_encoder", dtype=torch.float16).to(DEV).eval()
    proc = CLIPImageProcessor.from_pretrained(MODEL / "prior/image_processor")
    out = []
    t = time.time()
    with torch.no_grad():
        for i in range(0, len(files), 16):
            ims = [open_image(f) for f in files[i : i + 16]]
            px = proc(images=ims, return_tensors="pt").pixel_values.to(DEV, torch.float16)
            out.append(enc(pixel_values=px).image_embeds.float().cpu().numpy())
            print(f"  encoded {min(i + 16, len(files))}/{len(files)}", flush=True)
        ex = enc(pixel_values=proc(images=list(extra), return_tensors="pt").pixel_values.to(DEV, torch.float16)).image_embeds.float().cpu().numpy() if extra else np.zeros((0, 1280))
    del enc
    if DEV == "mps":
        torch.mps.empty_cache()
    print(f"  {len(files)} pictures in {time.time() - t:.0f}s", flush=True)
    return np.concatenate(out), ex


def decoder(dtype=torch.float16, lora: Path | None = None):
    from diffusers import KandinskyV22Pipeline

    pipe = KandinskyV22Pipeline.from_pretrained(MODEL / "decoder", dtype=dtype).to(DEV)
    pipe.set_progress_bar_config(disable=True)
    if lora and lora.exists():
        from peft import LoraConfig, set_peft_model_state_dict
        from safetensors.torch import load_file

        cfg = json.loads((lora.parent / "trained.json").read_text())["lora"]
        pipe.unet.add_adapter(LoraConfig(r=cfg["rank"], lora_alpha=cfg["alpha"], target_modules=cfg["targets"]))
        set_peft_model_state_dict(pipe.unet, {k: v.to(dtype) for k, v in load_file(lora).items()})
    return pipe


def draw(pipe, v: np.ndarray, length: float, grey: np.ndarray, seed: int = 0, size: int = 512) -> Image.Image:
    """The decoder's picture of an embedding, scaled to a typical picture's length (a mean is shorter than any picture's)."""
    v = v / np.linalg.norm(v) * length
    dt = pipe.unet.dtype
    return pipe(
        image_embeds=torch.tensor(v[None], dtype=dt, device=DEV),
        negative_image_embeds=torch.tensor(grey[None], dtype=dt, device=DEV),
        height=size, width=size, num_inference_steps=STEPS, guidance_scale=GUIDANCE,
        generator=torch.Generator("cpu").manual_seed(seed),
    ).images[0]


# ---------------------------------------------------------------- statistics


def fit(E: np.ndarray, k: int = AXES):
    mean = E.mean(0)
    C = E - mean
    _, S, Vt = np.linalg.svd(C, full_matrices=False)
    sd = S / np.sqrt(max(len(E) - 1, 1))
    share = S**2 / (S**2).sum()
    return mean, Vt[:k], sd[:k], share[:k]


def explained(E: np.ndarray, mean: np.ndarray, V: np.ndarray) -> np.ndarray:
    """For each picture: the share of how it differs from the centre that the axes explain."""
    C = E - mean
    P = C @ V.T @ V
    return 1 - ((C - P) ** 2).sum(1) / np.maximum((C**2).sum(1), 1e-9)


def check(E: np.ndarray, rounds: int = 20) -> dict:
    """Stability across halves, and fit on pictures set aside."""
    rng = np.random.default_rng(0)
    U = E / np.linalg.norm(E, axis=1, keepdims=True)
    centre, axis, aside = [], [], []
    for _ in range(rounds):
        p = rng.permutation(len(U))
        a, b = U[p[: len(U) // 2]], U[p[len(U) // 2 :]]
        ma, Va, _, _ = fit(a, 1)
        mb, Vb, _, _ = fit(b, 1)
        centre.append(float(ma @ mb / np.linalg.norm(ma) / np.linalg.norm(mb)))
        axis.append(float(abs(Va[0] @ Vb[0])))
        q = rng.permutation(len(U))
        te, tr = U[q[: max(1, len(U) // 5)]], U[q[max(1, len(U) // 5) :]]
        m, V, _, _ = fit(tr)
        aside.append(float(explained(te, m, V).mean() / max(explained(tr, m, V).mean(), 1e-9)))
    c = {
        "pictures": len(E),
        "rounds": rounds,
        "centreAcrossHalves": round(float(np.mean(centre)), 3),
        "axis1AcrossHalves": round(float(np.mean(axis)), 3),
        "axis1AcrossHalvesMin": round(float(np.min(axis)), 3),
        "asideFitRatio": round(float(np.mean(aside)), 3),
    }
    c["centreStable"] = c["centreAcrossHalves"] >= 0.95
    c["axesStable"] = c["axis1AcrossHalves"] >= 0.7
    c["asideFits"] = c["asideFitRatio"] >= 0.75
    return c


def pixel_average(files: list[Path], size: int = 512) -> Image.Image:
    acc = np.zeros((size, size, 3))
    for f in files:
        acc += np.asarray(ImageOps.fit(open_image(f), (size, size)), dtype=np.float64)
    return Image.fromarray((acc / len(files)).round().astype(np.uint8))


# ---------------------------------------------------------------- screenshots


def _runs(mask: np.ndarray, min_len: int, gap: int = 0) -> list[tuple[int, int]]:
    """Runs of True at least min_len long, with gaps of up to `gap` False closed first."""
    m = mask.copy()
    if gap:
        idx = np.flatnonzero(m)
        for a, b in zip(idx[:-1], idx[1:]):
            if 1 < b - a <= gap + 1:
                m[a:b] = True
    out, start = [], None
    for i, v in enumerate(list(m) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def _content(a: np.ndarray) -> np.ndarray:
    """Per pixel: not the app's background. The background is the commonest colour in the top and bottom strips of the
    screen (the status bar and the app's bar of buttons), which the app draws in one flat colour."""
    h = a.shape[0]
    strip = np.concatenate([a[: max(2, h // 50)].reshape(-1, 3), a[-max(3, h // 33) :].reshape(-1, 3)]).astype(int)
    q = strip // 16
    vals, counts = np.unique(q, axis=0, return_counts=True)
    bg = np.median(strip[(q == vals[counts.argmax()]).all(1)], 0)
    return np.abs(a.astype(int) - bg).max(2) > 6


def crop_screen(im: Image.Image) -> tuple[list[int], str]:
    """The picture in one screenshot of a post, story or reel: (box, how it was found).

    A post shows its picture as a band of rows that are almost all picture, between the
    app's header and its buttons and caption, which are mostly background: the box runs
    from the first such row to the last. A story or
    reel fills the screen, with the app drawn over it: there the box is the middle
    square, which leaves out the name at the top and the caption and reply bar at the
    bottom."""
    W, H = im.size
    k = 360 / W
    a = np.asarray(im.resize((360, max(1, round(H * k)))))
    c = _content(a)
    h = a.shape[0]
    full = np.flatnonzero(c.mean(1) > 0.8)
    if len(full):
        y0, y1 = int(full[0]), int(full[-1]) + 1  # from the first row that is all picture to the last
        if h // 8 <= (y1 - y0) < 0.75 * h:
            cols = _runs(c[y0:y1].mean(0) > 0.5, 360 // 4, gap=6)
            x0, x1 = max(cols, key=lambda r: r[1] - r[0]) if cols else (0, 360)
            return [round(x0 / k), round(y0 / k), round(x1 / k), round(y1 / k)], "post"
    side = min(W, H)
    return [(W - side) // 2, (H - side) // 2, (W - side) // 2 + side, (H - side) // 2 + side], "full screen: the middle square"


HEADER, FOOTER = 0.115, 0.915  # a phone's Photos app draws its title and its bar of buttons over the grid: a row reaching above the first share of the height is left out, and one reaching below the second is kept only if the line under it shows (the bar hides it; Instagram draws no bar over its grid)


def _gaps(a: np.ndarray, axis: int, thin: int) -> list[tuple[int, int]]:
    """The thin lines of one even colour across a grid: along axis 0, columns; along axis 1, rows. A line is even when
    its pixels hardly vary along it (the gap between thumbnails, white or black); a plain area inside a picture can be
    even too, but it is thicker than `thin`, so it isn't taken for a gap."""
    sd = a.std(axis).mean(-1)
    return [(x0, x1) for x0, x1 in _runs(sd < 12, 1) if x1 - x0 <= thin]


def _cells(gaps: list[tuple[int, int]], n: int) -> list[tuple[int, int]]:
    edges = [0] + [x for g in gaps for x in g] + [n]
    return [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2) if edges[i + 1] > edges[i]]


def crop_grid(im: Image.Image) -> list[list[int]]:
    """The thumbnails in a screenshot of a grid (Instagram's Saved grid, or a phone's photo roll): blocks of picture
    between thin lines of one even colour. The columns are found in the middle of the screen, where nothing is drawn
    over the grid; the rows are placed by the grid's pitch, fitted to the lines that run the whole width. Kept: cells as wide as a column, about square or a little taller (Instagram's are 3:4), and
    clear of the Photos app's title and bar. The lines are 1–3 pixels, so the grid is read at the screenshot's own
    size: shrinking it blurs them into the pictures. A zoomed-out view (Years, Months, or many columns) has no lines,
    and gives nothing."""
    W, H = im.size
    k = min(1.0, 2000 / W)
    a = np.asarray(im if k == 1 else im.resize((round(W * k), max(1, round(H * k))))).astype(np.int16)
    h, w = a.shape[:2]
    cols = [c for c in _cells(_gaps(a[int(0.3 * h) : int(0.8 * h)], 0, max(2, w // 80)), w) if c[1] - c[0] >= w // 12]
    if len(cols) < 2:
        return []
    cw = float(np.median([x1 - x0 for x0, x1 in cols]))
    cols = [c for c in cols if abs(c[1] - c[0] - cw) <= 0.06 * cw]
    gap = max(1, round((w - cw * len(cols)) / max(1, len(cols) - 1)))
    # The rows, by the grid's pitch: a dark or plain picture can hide a line or make a false one, so the lines found
    # are only evidence. The pitch is the commonest spacing between them (a column's width plus a line on a phone,
    # taller on Instagram); the phase is the one most lines agree with; every row is then placed by the two.
    starts = [y0 for y0, _ in _gaps(a, 1, max(2, w // 80))]
    even = a.std(1).mean(-1) < 12  # rows of one even colour: the lines, and an app's plain header
    steps = [d - c for c, d in zip(starts, starts[1:]) if cw <= d - c <= 1.45 * cw + 2 * gap]
    if not steps:
        return []
    vals, counts = np.unique(np.round(steps), return_counts=True)
    pitch = float(vals[counts.argmax()])
    best = max(starts, key=lambda c: sum(min((d - c) % pitch, pitch - (d - c) % pitch) <= 2 for d in starts))
    on = [(round((d - best) / pitch), d) for d in starts if min((d - best) % pitch, pitch - (d - best) % pitch) <= 2]
    if len(on) >= 2:  # the pitch to a fraction of a pixel, fitted to the lines that agree
        pitch, best = np.polyfit([i for i, _ in on], [d for _, d in on], 1)
    k0 = -int(best // pitch) - 1
    rows = [(round(best + i * pitch + gap), round(best + (i + 1) * pitch)) for i in range(k0, k0 + int(h / pitch) + 3)]
    boxes = []
    for y0, y1 in rows:
        if y0 < max(0, HEADER * h) or y1 > h or (y1 > FOOTER * h and not any(abs(d - y1) <= 2 for d in starts)):
            continue
        if y0 > gap + 8 and even[y0 - gap - 8 : y0].all():  # its top is under a plain header, not a dark picture's sky: start below the header
            while y0 < y1 and even[y0]:
                y0 += 1
        if not (0.94 <= (y1 - y0) / cw <= 1.4):
            continue
        for x0, x1 in cols:
            boxes.append([round(x0 / k), round(y0 / k), round(x1 / k), round(y1 / k)])
    return boxes


def crop(folder: Path, out: Path, grid: bool) -> None:
    files = pictures(folder)
    out.mkdir(parents=True, exist_ok=True)
    made = []
    for f in files:
        im = open_image(f)
        if grid:
            boxes = crop_grid(im)
            for j, b in enumerate(boxes):
                name = f"{f.stem}-{j + 1:02d}.png"
                im.crop(b).save(out / name)
                made.append({"file": name, "from": f.name, "box": b, "found": "grid"})
            why = "" if boxes else ": no lines between thumbnails found. A zoomed-out view (Years, Months, or many small columns) has none: zoom in to 3 or 5 columns"
            print(f"  {f.name}: {len(boxes)} thumbnails{why}", flush=True)
        else:
            b, how = crop_screen(im)
            name = f"{f.stem}.png"
            im.crop(b).save(out / name)
            made.append({"file": name, "from": f.name, "box": b, "found": how})
            print(f"  {f.name}: {how} {b[2] - b[0]}×{b[3] - b[1]}", flush=True)
    (out / "crops.json").write_text(json.dumps({"from": str(folder), "grid": grid, "crops": made}, indent=1) + "\n")
    print(f"  ◂ {len(made)} pictures into {out}; check them: a picture with large plain areas can be cut short", flush=True)



# ---------------------------------------------------------------- commands


def make(folder: Path, out: Path) -> None:
    files = pictures(folder)
    if len(files) < 12:
        sys.exit(f"latent make: {len(files)} pictures; a latent image needs 12 at the least, 30 before it draws its axes, and about 100 for them to hold still")
    out.mkdir(parents=True, exist_ok=True)
    print(f"  {len(files)} pictures from {folder}; encoder: CLIP ViT-bigG/14 (Kandinsky 2.2's), on {DEV}", flush=True)
    E, grey = encode(files, [Image.new("RGB", (224, 224), (128, 128, 128))])
    mean, V, sd, share = fit(E)
    length = float(np.linalg.norm(E, axis=1).mean())
    np.savez(out / "stats.npz", embeddings=E, mean=mean, axes=V, spreads=sd, share=share, length=length, grey=grey[0])
    (out / "files.json").write_text(json.dumps([f.name for f in files], indent=0) + "\n")
    c = check(E)
    c["axisShares"] = [round(float(s), 3) for s in share]
    (out / "check.json").write_text(json.dumps(c, indent=1) + "\n")
    print(f"  centre across halves {c['centreAcrossHalves']:.3f} (stable at 0.95) · axis 1 across halves {c['axis1AcrossHalves']:.2f} (stable at 0.7) · set-aside fit {c['asideFitRatio']:.2f} of training (fits at 0.75)", flush=True)
    print(f"  the first {AXES} axes hold " + ", ".join(f"{s:.0%}" for s in share) + " of the spread", flush=True)

    pixel_average(files).save(out / "pixel-average.png")
    print("  ◂ pixel-average.png", flush=True)
    pipe = decoder()
    t = time.time()
    for seed in range(3):
        draw(pipe, mean, length, grey[0], seed).save(out / ("latent.png" if seed == 0 else f"latent-{seed + 1}.png"))
        print(f"  ◂ {'latent.png' if seed == 0 else f'latent-{seed + 1}.png'} ({time.time() - t:.0f}s)", flush=True)
    for a in range(SHOWN if len(files) >= AXES_FROM else 0):
        for sign, tag in ((-2, "minus"), (2, "plus")):
            draw(pipe, mean + sign * sd[a] * V[a], length, grey[0]).save(out / f"axis-{a + 1}-{tag}.png")
        print(f"  ◂ axis-{a + 1}-minus.png, axis-{a + 1}-plus.png", flush=True)
    if len(files) < AXES_FROM:
        print(f"  no axis pictures: {len(files)} pictures is too few for the ways they differ to mean anything ({AXES_FROM} or more draws them)", flush=True)
    C = E - mean
    d = np.linalg.norm(C, axis=1)
    near = [files[i].name for i in np.argsort(d)[:5]]
    ends = {f"axis{a + 1}": {"minus": [files[i].name for i in np.argsort(C @ V[a])[:3]], "plus": [files[i].name for i in np.argsort(C @ V[a])[-3:][::-1]]} for a in range(SHOWN)}
    (out / "latent.json").write_text(json.dumps({"pictures": len(files), "nearest": near, "axisEnds": ends, "check": c}, indent=1) + "\n")
    print(f"  nearest the centre: {', '.join(near[:3])}")


def train(latent: Path, folder: Path, steps: int) -> None:
    from diffusers import DDPMScheduler
    from peft import LoraConfig, get_peft_model_state_dict
    from safetensors.torch import save_file

    z = np.load(latent / "stats.npz")
    names = json.loads((latent / "files.json").read_text())
    files = [folder / n for n in names if (folder / n).exists()]
    if len(files) != len(names):
        sys.exit(f"latent train: {latent} was made from {len(names)} pictures; {len(files)} of them are in {folder}")
    E = z["embeddings"]
    pipe = decoder(torch.float32)
    unet, movq = pipe.unet, pipe.movq
    t = time.time()
    lats = []
    with torch.no_grad():
        for f in files:
            x = torch.tensor(np.asarray(ImageOps.fit(open_image(f), (512, 512))), dtype=torch.float32, device=DEV).permute(2, 0, 1)[None] / 127.5 - 1
            lats.append(movq.encode(x).latents.cpu())
    L = torch.cat(lats)
    print(f"  {len(files)} pictures into the decoder's own codes in {time.time() - t:.0f}s", flush=True)
    cfg = {"rank": 8, "alpha": 8, "targets": ["to_k", "to_q", "to_v", "to_out.0"], "lr": 1e-4, "batch": 2}
    unet.requires_grad_(False)
    movq.requires_grad_(False)
    unet.add_adapter(LoraConfig(r=cfg["rank"], lora_alpha=cfg["alpha"], init_lora_weights="gaussian", target_modules=cfg["targets"]))
    params = [p for p in unet.parameters() if p.requires_grad]
    print(f"  training {sum(p.numel() for p in params):,} added weights (LoRA rank {cfg['rank']}) for {steps} steps of {cfg['batch']} pictures", flush=True)
    opt = torch.optim.AdamW(params, lr=cfg["lr"])
    sched = DDPMScheduler.from_pretrained(MODEL / "decoder", subfolder="scheduler")
    Et = torch.tensor(E, dtype=torch.float32)
    rng = np.random.default_rng(0)
    unet.train()
    t = time.time()
    losses, run = [], []
    for s in range(steps):
        idx = rng.choice(len(L), cfg["batch"], replace=False)
        x0, e = L[idx].to(DEV), Et[idx].to(DEV)
        noise = torch.randn_like(x0)
        ts = torch.randint(0, sched.config.num_train_timesteps, (cfg["batch"],), device=DEV)
        pred = unet(sched.add_noise(x0, noise, ts), ts, None, added_cond_kwargs={"image_embeds": e}).sample[:, :4]
        loss = torch.nn.functional.mse_loss(pred, noise)
        loss.backward()
        opt.step()
        opt.zero_grad()
        run.append(loss.item())
        if (s + 1) % 50 == 0 or s + 1 == steps:
            losses.append({"step": s + 1, "loss": round(float(np.mean(run)), 4)})
            run = []
            left = (time.time() - t) / (s + 1) * (steps - s - 1)
            print(f"  step {s + 1}/{steps} · loss {losses[-1]['loss']:.4f} (the last 50) · about {left / 60:.0f} min left", flush=True)
    minutes = (time.time() - t) / 60
    unet.eval()
    save_file({k: v.detach().cpu().contiguous() for k, v in get_peft_model_state_dict(unet).items()}, latent / "lora.safetensors")
    (latent / "trained.json").write_text(json.dumps({"steps": steps, "minutes": round(minutes, 1), "pictures": len(files), "lora": cfg, "losses": losses}, indent=1) + "\n")
    print(f"  ◂ lora.safetensors ({minutes:.0f} min)", flush=True)
    mean, V, sd, length, grey = z["mean"], z["axes"], z["spreads"], float(z["length"]), z["grey"]
    with torch.no_grad():
        draw(pipe, mean, length, grey).save(latent / "latent-trained.png")
        print("  ◂ latent-trained.png: the latent image, drawn by the trained decoder", flush=True)
        if len(files) >= AXES_FROM:
            for a in range(SHOWN):
                for sign, tag in ((-2, "minus"), (2, "plus")):
                    draw(pipe, mean + sign * sd[a] * V[a], length, grey).save(latent / f"axis-{a + 1}-{tag}-trained.png")
            print(f"  ◂ axis-1 … axis-{SHOWN} -trained.png", flush=True)


def gallery(latent: Path, folder: Path, out: Path, brings: int) -> None:
    z = np.load(latent / "stats.npz")
    mean, V, sd, length, grey = z["mean"], z["axes"], z["spreads"], float(z["length"]), z["grey"]
    typical = float(np.linalg.norm(z["embeddings"] - mean, axis=1).mean())
    check_ = json.loads((latent / "check.json").read_text())
    files = pictures(folder)
    out.mkdir(parents=True, exist_ok=True)
    credits = {}
    m = folder / "manifest.json"
    if m.exists():
        credits = {c["file"]: c for c in json.loads(m.read_text()).get("credits", [])}
    E, _ = encode(files)
    C = E - mean
    coords = C @ V.T / sd
    dist = np.linalg.norm(C, axis=1) / typical
    share = 1 - explained(E, mean, V)
    subject = (E @ mean) / (np.linalg.norm(E, axis=1) * np.linalg.norm(mean))
    items = []
    for i, f in enumerate(files):
        c = credits.get(f.name, {})
        items.append({
            "file": f.name,
            "distance": round(float(dist[i]), 2),
            "axes": [round(float(x), 2) for x in coords[i]],
            "brings": round(float(share[i]), 3),
            "nearInSubject": round(float(subject[i]), 3),
            **{k: c[k] for k in ("title", "author", "license", "url") if c.get(k)},
        })
    # what the pictures that bring most bring: the latent image plus each one's own part (what the axes don't explain)
    trained = latent / "lora.safetensors"
    top = list(np.argsort(-share)[:brings]) if brings else []
    if top:
        pipe = decoder(torch.float32 if trained.exists() else torch.float16, trained if trained.exists() else None)
        for i in top:
            resid = C[i] - C[i] @ V.T @ V
            name = f"brings-{Path(files[i].name).stem}.png"
            with torch.no_grad():
                draw(pipe, mean + resid, length, grey).save(out / name)
            items[i]["bringsPicture"] = name
            print(f"  ◂ {name}: what {files[i].name} brings", flush=True)
    for name in ["latent.png", "latent-trained.png", "pixel-average.png"] + [f"axis-{a + 1}-{s}{t}.png" for a in range(SHOWN) for s in ("minus", "plus") for t in ("", "-trained")]:
        if (latent / name).exists():
            (out / name).write_bytes((latent / name).read_bytes())
    (out / "latent.json").write_text(json.dumps({"latent": latent.name, "folder": folder.name, "axes": AXES, "check": check_, "pictures": sorted(items, key=lambda x: x["distance"])}, indent=1) + "\n")
    write_html(out / "gallery.html", items, files, latent, out, folder, check_)
    print(f"  {len(items)} pictures: nearest {min(dist):.2f}, furthest {max(dist):.2f} spreads from the centre (1 is typical of {latent.name})")
    print(f"  wrote {out}/gallery.html, latent.json")


def write_html(path: Path, items: list[dict], files: list[Path], latent: Path, out: Path, folder: Path, check_: dict) -> None:
    e = html.escape

    def img(name: str, alt: str) -> str:
        p = out / name
        return f'<img src="{thumb(Image.open(p), 384)}" alt="{e(alt)}">' if p.exists() else ""

    trained = (out / "latent-trained.png").exists()
    head = [f'<figure>{img("latent.png", "the latent image")}<figcaption><b>the latent image</b> the centre of {e(latent.name)}, decoded. {PSY["latent"]}</figcaption></figure>']
    if trained:
        head.append(f'<figure>{img("latent-trained.png", "the latent image, trained decoder")}<figcaption><b>drawn by the trained decoder</b> the same centre, by a decoder that learned the collection. {PSY["trained"]}</figcaption></figure>')
    head.append(f'<figure>{img("pixel-average.png", "pixel average")}<figcaption><b>pixel average</b> every pixel averaged: the baseline. {PSY["pixels"]}</figcaption></figure>')
    t = "-trained" if trained else ""
    axes = "".join(
        f'<div class="ax"><span>axis {a + 1} · {check_["axisShares"][a]:.0%} of the spread</span>{img(f"axis-{a + 1}-minus{t}.png", f"axis {a + 1}, minus")}{img(f"axis-{a + 1}-plus{t}.png", f"axis {a + 1}, plus")}<span>− 2 spreads · + 2 spreads</span></div>'
        for a in range(SHOWN)
    )
    has_axes = (out / "axis-1-minus.png").exists()
    axes_part = (
        f'<h2>the axes: the main ways the collection\'s pictures differ, each decoded at two spreads either side of the centre</h2><p>{PSY["axes"]}</p><div class="axes">{axes}</div>'
        if has_axes
        else f'<h2>no axes</h2><p>{check_["pictures"]} pictures is too few for the ways they differ to mean anything: the axes are drawn from {AXES_FROM} pictures. The bars below are a sketch.</p>'
    )
    shots = (folder / "crops.json").exists()
    psy = "".join(f"<li>{x}</li>" for x in PSY["model"] + ([PSY["shots"], PSY["feed"]] if shots else []))
    by = {f.name: f for f in files}
    cards = []
    for i in sorted(items, key=lambda x: x["distance"]):
        bars = "".join(f'<i title="axis {k + 1}: {v:+.1f}"><u style="left:{50 + max(-50, min(50, v * 16.7)):.0f}%"></u></i>' for k, v in enumerate(i["axes"]))
        credit = " · ".join(x for x in [i.get("title", ""), i.get("author", ""), i.get("license", "")] if x)
        bring = f'<span class="r">what it brings:</span>{img(i["bringsPicture"], "what it brings")}' if i.get("bringsPicture") else ""
        cards.append(
            f'<figure><img src="{thumb(open_image(by[i["file"]]))}" alt="{e(i.get("title", i["file"]))}"><figcaption>'
            f'<b>{i["distance"]:.2f}</b><span class="c">spreads from the centre</span>'
            f'<span class="c">brings {i["brings"]:.0%} · near in subject {i["nearInSubject"]:.2f}</span>'
            f'<span class="bars">{bars}</span><span class="c">axes 1–{AXES}: {" ".join(f"{v:+.1f}" for v in i["axes"])}</span>{bring}'
            f'<span class="f">{e(i["file"])}{" · " + e(credit) if credit else ""}</span></figcaption></figure>'
        )
    stable = "stable" if check_["centreStable"] else "not stable: too few pictures, or too mixed"
    axes_ok = "" if check_["axesStable"] or check_["pictures"] < AXES_FROM else f' Axis 1 changes with the half ({check_["axis1AcrossHalves"]:.2f}; stable at 0.7): read the axes as a sketch until the collection has about 100 pictures.'
    path.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>latent image · {e(folder.name)}</title>
<style>
body{{font:0.875rem/1.45 ui-monospace,Menlo,monospace;background:#111;color:#ddd;margin:1.5rem}}
ul{{color:#999;max-width:60rem;padding-left:1.25rem;margin:.25rem 0}} li{{margin:.25rem 0}}
h1,h2{{font-size:1rem;font-weight:500;color:#5CF25C;margin:1.25rem 0 .5rem}} p{{margin:.25rem 0;color:#999;max-width:60rem}}
.top{{display:flex;flex-wrap:wrap;gap:1rem}} .top figure{{width:20rem}} .axes{{display:flex;flex-wrap:wrap;gap:1.5rem}}
.ax{{display:grid;grid-template-columns:10rem 10rem;gap:.25rem}} .ax span{{grid-column:1/3;color:#999}} .ax img{{width:10rem}}
main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem;margin-top:1rem}}
figure{{margin:0;background:#1a1a1a;border:1px solid #2a2a2a}} img{{width:100%;aspect-ratio:1;object-fit:cover;display:block}}
figcaption{{padding:.5rem .625rem;display:flex;flex-wrap:wrap;gap:.25rem .5rem}} b{{color:#5CF25C;font-weight:500}}
.c{{color:#999}} .r{{flex-basis:100%;color:#ccc}} .f{{flex-basis:100%;color:#777;font-size:.75rem}}
.bars{{flex-basis:100%;display:grid;grid-template-columns:repeat({AXES},1fr);gap:.25rem}} .bars i{{position:relative;height:.5rem;background:#2a2a2a}}
.bars u{{position:absolute;top:0;width:.25rem;height:.5rem;background:#5CF25C;margin-left:-.125rem}}
</style></head><body>
<h1>the latent image of {e(latent.name)} · {len(items)} pictures from {e(folder.name)} measured against it</h1>
<p>The latent image is the centre of the collection's pictures as a large picture encoder measures them (CLIP ViT-bigG/14), decoded into a picture by Kandinsky 2.2. It is a mean of copies: no single picture shows it. The centre is {stable} across halves of the collection ({check_["centreAcrossHalves"]:.3f}; stable at 0.95).{axes_ok}</p>
<div class="top">{"".join(head)}</div>
<h2>what media theory says it is like</h2>
<ul>{psy}</ul>
{axes_part}
<h2>the pictures, nearest the centre first</h2>
<p>Distance is in the collection's own spreads: 1 is a typical picture of it. The bars are each picture's place on axes 1–{AXES} (centre line 0, ends ±3). "Brings" is the share of how a picture differs from the centre that the axes don't explain: high means it brings something the collection mostly lacks. "Near in subject" is the cosine between the picture and the centre (1 is the same direction). {PSY["brings"]}</p>
<main>{"".join(cards)}</main></body></html>
""")


# ---------------------------------------------------------------- the room


OLLAMA = os.environ.get("OLLAMA_HOST_URL", "http://127.0.0.1:11434").rstrip("/")
# The lines the room sets beside a visitor's latent image; for each, the passages of the chosen texts nearest it.
ROOM_LINES = {
    "mirror": PSY["model"][1],
    "studium": PSY["latent"],
    "punctum": PSY["brings"],
    "simulacrum": PSY["model"][0],
    "trained": PSY["trained"],
}
# a wiki page's markup, left out of the passages
MARKUP = re.compile(r"\{\{.*?\}\}|\[\[|\]\]|'{2,3}|</?\w+[^>]*>|^=+.*?=+\s*$", re.S | re.M)


def rel(p: Path) -> str:
    """A path as the app's workspace file API takes it: without workspace/."""
    s = str(p)
    return s[len("workspace/") :] if s.startswith("workspace/") else s


def embed(texts: list[str], model: str) -> np.ndarray:
    out = []
    for i in range(0, len(texts), 32):
        req = urllib.request.Request(f"{OLLAMA}/api/embed", json.dumps({"model": model, "input": texts[i : i + 32]}).encode(), {"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=600) as r:
            out += json.loads(r.read())["embeddings"]
    a = np.array(out, dtype=np.float32)
    return a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-9)


def passages_of(raw: Path) -> list[str]:
    """A raw text's passages: its chunks, cut at sentences into pieces a visitor can read standing (about 450 characters)."""
    out = []
    for line in (raw / "chunks.jsonl").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        cur = ""
        for sent in re.split(r"(?<=[.!?])\s+", " ".join(MARKUP.sub("", json.loads(line)["text"]).split())):
            if len(cur) + len(sent) > 450 and cur:
                out.append(cur.strip())
                cur = ""
            cur += sent + " "
        if cur.strip():
            out.append(cur.strip())
    return [p for p in out if len(p) >= 120]


def room(latent: Path, folder: Path, texts: list[Path], model: str) -> None:
    z = np.load(latent / "stats.npz")
    E, mean, V = z["embeddings"], z["mean"], z["axes"]
    names = json.loads((latent / "files.json").read_text())
    C = E - mean
    typical = float(np.linalg.norm(C, axis=1).mean())
    dist = np.linalg.norm(C, axis=1) / typical
    brings = 1 - explained(E, mean, V)
    pics = [{"n": i + 1, "file": rel(folder / f), "distance": round(float(dist[i]), 2), "brings": round(float(brings[i]), 3)} for i, f in enumerate(names)]
    rows, about = [], []
    for t in texts:
        if not (t / "chunks.jsonl").exists():
            sys.exit(f"latent room: no text in {t}; bring it in first with data raw")
        m = json.loads((t / "manifest.json").read_text()) if (t / "manifest.json").exists() else {}
        ps = passages_of(t)
        rows += [{"from": t.name, "text": p} for p in ps]
        about.append({"name": t.name, "about": m.get("about", t.name), "license": m.get("license", ""), "private": bool(m.get("private")), "passages": len(ps)})
        print(f"  {t.name}: {len(ps)} passages", flush=True)
    passages: dict[str, list[dict]] = {}
    if rows:
        t0 = time.time()
        try:
            P = embed([f"search_document: {r['text']}" for r in rows], model)
            Q = embed([f"search_query: {ROOM_LINES[k]}" for k in ROOM_LINES], model)
        except Exception as err:  # noqa: BLE001
            sys.exit(f"latent room: {model} in Ollama didn't answer ({err}); is Ollama running, and has it {model}? ollama pull {model}")
        print(f"  {len(rows)} passages measured by {model} in {time.time() - t0:.0f}s", flush=True)
        for k, q in zip(ROOM_LINES, Q):
            order = np.argsort(-(P @ q))
            # the nearest passage, then the nearest from another text, so one text doesn't speak for all of them
            first = rows[order[0]]
            other = next((rows[i] for i in order[1:] if rows[i]["from"] != first["from"]), None)
            passages[k] = [first] + ([other] if other else [])
    trained = (latent / "latent-trained.png").exists()
    out = latent / "room"
    out.mkdir(exist_ok=True)
    (out / "room.json").write_text(json.dumps({
        "latent": latent.name,
        "set": folder.name,
        "image": rel(latent / ("latent-trained.png" if trained else "latent.png")),
        "trained": trained,
        "check": json.loads((latent / "check.json").read_text()),
        "pictures": pics,
        "lines": ROOM_LINES,
        "texts": about,
        "embed": model if rows else None,
        "passages": passages,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  ◂ {out}/room.json: {len(pics)} pictures, {len(about)} texts, {len(rows)} passages", flush=True)


def respond(latent: Path, picks: list[int]) -> None:
    out = latent / "room"
    key = "-".join(str(n) for n in sorted(set(picks)))
    resp = out / "responses"
    resp.mkdir(parents=True, exist_ok=True)
    if (resp / f"{key}.json").exists():
        (out / "latest.json").write_text(json.dumps({"response": rel(resp / f"{key}.json")}) + "\n")
        print(f"  pictures {key.replace('-', ', ')}: drawn before; shown at once", flush=True)
        return
    z = np.load(latent / "stats.npz")
    E, mean, length, grey = z["embeddings"], z["mean"], float(z["length"]), z["grey"]
    idx = [n - 1 for n in sorted(set(picks))]
    if not idx or min(idx) < 0 or max(idx) >= len(E):
        sys.exit(f"latent respond: the pictures are numbered 1 to {len(E)}")
    m = E[idx].mean(0)
    typical = float(np.linalg.norm(E - mean, axis=1).mean())
    d = float(np.linalg.norm(m - mean)) / typical
    # how near, against 500 random choices of as many pictures: a mean of a few pictures is near the centre by chance alone
    rng = np.random.default_rng(0)
    rand = np.array([np.linalg.norm(E[rng.choice(len(E), len(idx), replace=False)].mean(0) - mean) / typical for _ in range(500)])
    nearer = float((rand > d).mean())
    lora = latent / "lora.safetensors"
    t = time.time()
    pipe = decoder(torch.float32 if lora.exists() else torch.float16, lora if lora.exists() else None)
    print(f"  the decoder loaded in {time.time() - t:.0f}s{', trained on the set' if lora.exists() else ''}", flush=True)
    made = []
    with torch.no_grad():
        for seed in range(2):
            name = f"{key}-{seed + 1}.png"
            draw(pipe, m, length, grey, seed).save(resp / name)
            made.append(rel(resp / name))
            print(f"  ◂ {name} ({time.time() - t:.0f}s)", flush=True)
    lines = ["mirror", "studium" if nearer >= 0.5 else "punctum"] + (["trained"] if lora.exists() else ["simulacrum"])
    (resp / f"{key}.json").write_text(json.dumps({
        "pictures": [n + 1 for n in idx],
        "distance": round(d, 2),
        "nearer": round(nearer, 2),
        "drawn": made,
        "trained": lora.exists(),
        "lines": lines,
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }, indent=1) + "\n")
    (out / "latest.json").write_text(json.dumps({"response": rel(resp / f"{key}.json")}) + "\n")
    print(f"  their centre is {d:.2f} spreads from the set's: nearer than {nearer:.0%} of random choices of {len(idx)}", flush=True)


def main(argv: list[str]) -> None:
    def opt(name: str, default: int) -> int:
        return int(argv[argv.index(name) + 1]) if name in argv else default

    pos = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or not argv[i - 1].startswith("--"))]
    if len(pos) == 3 and pos[0] == "make":
        make(Path(pos[1]), Path(pos[2]))
    elif len(pos) == 3 and pos[0] == "train":
        train(Path(pos[1]), Path(pos[2]), opt("--steps", 800))
    elif len(pos) == 3 and pos[0] == "crop":
        crop(Path(pos[1]), Path(pos[2]), "--grid" in argv)
    elif len(pos) == 4 and pos[0] == "gallery":
        gallery(Path(pos[1]), Path(pos[2]), Path(pos[3]), opt("--brings", 4))
    elif len(pos) >= 3 and pos[0] == "room":
        room(Path(pos[1]), Path(pos[2]), [Path(p) for p in pos[3:]], argv[argv.index("--embed") + 1] if "--embed" in argv else "nomic-embed-text")
    elif len(pos) == 2 and pos[0] == "respond" and "--pick" in argv:
        respond(Path(pos[1]), [int(x) for x in argv[argv.index("--pick") + 1].split(",")])
    else:
        sys.exit(__doc__.split("\n\n")[1])


if __name__ == "__main__":
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    main(sys.argv[1:])
