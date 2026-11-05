"""The latent image of a collection: what a set of pictures holds that no single picture shows.

    python python/variable_machine/latent.py make <image folder> <out folder>
    python python/variable_machine/latent.py train <latent folder> <image folder> [--steps 800]
    python python/variable_machine/latent.py gallery <latent folder> <image folder> <out folder> [--brings 4]

All paths are relative to the repo root. The model is Kandinsky 2.2
(Sber AI, Apache 2.0) in workspace/tools/kandinsky/: its image encoder (CLIP
ViT-bigG/14, from the prior repo) and its decoder (a diffusion U-Net and the
MoVQ autoencoder). It runs in torch on the Mac's GPU (MPS). Nothing here
downloads anything.

What each part does:

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
GUIDANCE = 2.5  # how hard the decoder is pushed toward the embedding, away from a plain grey picture's
STEPS = 30  # denoising steps per picture
DEV = "mps" if torch.backends.mps.is_available() else "cpu"


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


# ---------------------------------------------------------------- commands


def make(folder: Path, out: Path) -> None:
    files = pictures(folder)
    if len(files) < 20:
        sys.exit(f"latent make: {len(files)} pictures; a latent image needs 20 at the least, and about 100 for its axes to mean much")
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
    for a in range(SHOWN):
        for sign, tag in ((-2, "minus"), (2, "plus")):
            draw(pipe, mean + sign * sd[a] * V[a], length, grey[0]).save(out / f"axis-{a + 1}-{tag}.png")
        print(f"  ◂ axis-{a + 1}-minus.png, axis-{a + 1}-plus.png", flush=True)
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
    head = [f'<figure>{img("latent.png", "the latent image")}<figcaption><b>the latent image</b> the centre of {e(latent.name)}, decoded</figcaption></figure>']
    if trained:
        head.append(f'<figure>{img("latent-trained.png", "the latent image, trained decoder")}<figcaption><b>drawn by the trained decoder</b> the same centre, by a decoder that learned the collection</figcaption></figure>')
    head.append(f'<figure>{img("pixel-average.png", "pixel average")}<figcaption><b>pixel average</b> every pixel averaged: the baseline</figcaption></figure>')
    t = "-trained" if trained else ""
    axes = "".join(
        f'<div class="ax"><span>axis {a + 1} · {check_["axisShares"][a]:.0%} of the spread</span>{img(f"axis-{a + 1}-minus{t}.png", f"axis {a + 1}, minus")}{img(f"axis-{a + 1}-plus{t}.png", f"axis {a + 1}, plus")}<span>− 2 spreads · + 2 spreads</span></div>'
        for a in range(SHOWN)
    )
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
    axes_ok = "" if check_["axesStable"] else f' Axis 1 changes with the half ({check_["axis1AcrossHalves"]:.2f}; stable at 0.7): read the axes as a sketch until the collection has about 100 pictures.'
    path.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>latent image · {e(folder.name)}</title>
<style>
body{{font:0.875rem/1.45 ui-monospace,Menlo,monospace;background:#111;color:#ddd;margin:1.5rem}}
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
<h2>the axes: the main ways the collection's pictures differ, each decoded at two spreads either side of the centre</h2>
<div class="axes">{axes}</div>
<h2>the pictures, nearest the centre first</h2>
<p>Distance is in the collection's own spreads: 1 is a typical picture of it. The bars are each picture's place on axes 1–{AXES} (centre line 0, ends ±3). "Brings" is the share of how a picture differs from the centre that the axes don't explain: high means it brings something the collection mostly lacks. "Near in subject" is the cosine between the picture and the centre (1 is the same direction).</p>
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
    elif len(pos) == 4 and pos[0] == "gallery":
        gallery(Path(pos[1]), Path(pos[2]), Path(pos[3]), opt("--brings", 4))
    else:
        sys.exit(__doc__.split("\n\n")[1])


if __name__ == "__main__":
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    main(sys.argv[1:])
