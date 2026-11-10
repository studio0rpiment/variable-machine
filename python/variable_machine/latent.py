"""The latent image of a collection: what a set of pictures holds that no single picture shows.

    python python/variable_machine/latent.py crop <screenshot folder> <out folder> [--grid]
    python python/variable_machine/latent.py make <image folder> <out folder>
    python python/variable_machine/latent.py train <latent folder> <image folder> [--steps 800]
    python python/variable_machine/latent.py gallery <latent folder> <image folder> <out folder> [--brings 4]

All paths are relative to the repo root. The model is Kandinsky 2.2
(Sber AI, Apache 2.0) in workspace/tools/kandinsky/: its image encoder (CLIP
ViT-bigG/14, from the prior repo) and its decoder (a diffusion U-Net and the
MoVQ autoencoder). It runs in torch on the Mac's GPU (MPS). Nothing here
downloads anything.

What each part does:

- crop: screenshots (of Instagram posts, stories and reels, or of the Saved
  grid with --grid) cut down to the pictures in them, so the app's own
  header, buttons and captions don't become part of the latent image.
- make: the encoder turns each picture into 1280 numbers (an embedding):
  what the picture shows and how it looks, as a model trained on hundreds of
  millions of pictures measures them. The collection's statistics are fitted
  to those: the mean (the centre) and the main axes along which the
  pictures differ (principal components), with their spreads. The decoder
  turns the mean back into a picture: that is the latent image. Each axis is
  shown as two pictures, the mean minus and plus two spreads. Beside them,
  the pixel average (Galton's composite) is the baseline. The check: is the
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

A mean and a few directions of spread is all the latent image is. It is not
a memory or an unconscious in any literal sense: "subconscious" is the
project's frame, and the texts on the card give that frame its history.
"""

from __future__ import annotations

import base64
import html
import io
import json
import os
import sys
import time
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


# What each picture on the gallery page is like, in the psychology the card's texts come from. Each is a likeness:
# the statistics do what the experiment found people do, not what a mind is. Sources: docs/latent-image-reading.md.
PSY = {
    "pixels": "Freud compares a dream face that is two people at once to “a composite photograph of Galton” (The Interpretation of Dreams, 1899): what the pictures share comes forward, what they don't cancels out. He calls it condensation.",
    "latent": "Like a prototype: people who learned a pattern only from distortions of it sort the pattern itself, which they never saw, as well as the distortions they did, and forget it more slowly (Posner and Keele, 1968 and 1970). Memory keeps the centre of a set.",
    "trained": "Drawn in the collection's own look, not the web's: the same centre, with the schema it is retold in changed.",
    "model": [
        "People take in the average of a set at a glance, without keeping its members (ensemble perception: Ariely, 2001). The latent image is that average, in a model's measure.",
        "The model learned from about two billion pictures from the web, and it draws the centre in their terms. Bartlett (Remembering, 1932) found people retell a strange story in their own culture's terms. Jung would call the model's store a collective unconscious; Fanon's answer is that such a store is one culture's, not humanity's, and so is this one.",
    ],
    "feed": "These are saved posts: the person chose them, but from what the app's recommender offered. The latent image is where the two meet; what a picture brings is where they part.",
    "axes": "What the collection's pictures disagree about: the tensions inside it, not one picture's place.",
    "brings": "What a picture brings is the part of it the collection doesn't hold: Hoel (2021) proposes that dreams are the brain's own off-pattern pictures, which keep it from learning its days too narrowly. That is an analogy, not a finding about this page.",
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


def crop_grid(im: Image.Image) -> list[list[int]]:
    """The thumbnails in a screenshot of the Saved grid: blocks of picture separated by thin lines of background."""
    W, H = im.size
    k = 720 / W
    a = np.asarray(im.resize((720, max(1, round(H * k)))))
    c = _content(a)
    boxes = []
    for y0, y1 in _runs(c.mean(1) > 0.6, 720 // 6):
        for x0, x1 in _runs(c[y0:y1].mean(0) > 0.6, 720 // 6):
            if 0.5 <= (y1 - y0) / (x1 - x0) <= 2:
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
            print(f"  {f.name}: {len(boxes)} thumbnails", flush=True)
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
    psy = "".join(f"<li>{x}</li>" for x in PSY["model"]) + (f"<li>{PSY['feed']}</li>" if shots else "")
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
<p>The latent image is the centre of the collection's pictures as a large picture encoder measures them (CLIP ViT-bigG/14), decoded into a picture by Kandinsky 2.2. It is a mean, not a memory: no single picture shows it. The centre is {stable} across halves of the collection ({check_["centreAcrossHalves"]:.3f}; stable at 0.95).{axes_ok}</p>
<div class="top">{"".join(head)}</div>
<h2>what the psychology says it is like</h2>
<ul>{psy}</ul>
{axes_part}
<h2>the pictures, nearest the centre first</h2>
<p>Distance is in the collection's own spreads: 1 is a typical picture of it. The bars are each picture's place on axes 1–{AXES} (centre line 0, ends ±3). "Brings" is the share of how a picture differs from the centre that the axes don't explain: high means it brings something the collection mostly lacks. "Near in subject" is the cosine between the picture and the centre (1 is the same direction). {PSY["brings"]}</p>
<main>{"".join(cards)}</main></body></html>
""")


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
    else:
        sys.exit(__doc__.split("\n\n")[1])


if __name__ == "__main__":
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    main(sys.argv[1:])
