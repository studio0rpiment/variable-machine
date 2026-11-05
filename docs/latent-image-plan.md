# The latent image of a collection: plan and sources

A Projects card for a student's thesis: train on the images a person keeps, make the collection's latent image from what the model learned, then measure a gallery against it. Written 2026-11-04. Licences were checked that day against the sources themselves.

**The latent image** of a collection is the picture the collection holds without any one image in it showing it. Kevin's words for it are the collection's "subconscious" or "pre-cognitive" picture. Here it is made statistically: it is the centre of what a model learned from all the images, made back into a picture.

**Card name, proposed:** *latent image*. On the card: **latent image · what a collection holds that no single image shows**.

This replaces the image-mood plan. That card, its commands and its result are on this branch in commit c58301a, not merged. Section 7 says what carries over.

## 1. What the latent image is not

- It is not a memory or an unconscious in any literal sense. It is a mean and a few directions of spread, measured in a model's numbers. "Subconscious" and "pre-cognitive" are the thesis's frame, and the texts in section 4 give that frame its history. The card states this in its **what it can't do** line.
- It is not a portrait of the person. A collection of family photos gives a latent image with faces in it. Averaging faces is not reading what anyone feels, so the EU AI Act line from the mood plan doesn't apply. Galton made composites like this to argue for eugenics; the card's sources say so.

## 2. Images

The thesis's images are **the person's own**: a folder of phone photos or a body of work, brought in on the image segmentation tab (upload, or `look example`). Nothing is downloaded for them, and their licence is the person's.

To test without anyone's private photos, use a collection that is one person's work or one subject:

| Collection | Licence | Size | How |
|---|---|---|---|
| Art Institute of Chicago, public-domain works | CC0 (the API's own `license_text`; descriptions, not used, are CC BY) | 40–100 images by search, about 200 KB each at 843 px | `look museum "<artist or subject>" <set> --limit 100` (built in c58301a) |
| Cleveland Museum of Art open access | CC0 per record (`share_license_status`) | by search | `openaccess-api.clevelandart.org/api/artworks/?q=…&cc0=1&has_image=1` (not built) |
| The Met open access | CC0 (`isPublicDomain`) | by search | `collectionapi.metmuseum.org/public/collection/v1.1/search` (the v1 search was retired 2026-10-01); not built |

The test so far used 40 AIC landscapes (CC0) and, for contrast, 513 mixed OASIS photos. OASIS is research-only, so it is not for the final test; see the mood plan's notes.

## 3. Four ways to make it, from plain statistics to training

Each was weighed for an 8 GB Mac. The first two were prototyped on this Mac (M1 Pro) today. The picture below shows them for the 40 landscapes:

![Pixel average, VAE-code average and median, and the first two axes of the codes decoded at ±2 spreads, for 40 public-domain landscapes](images/latent-image-prototype-aic-landscapes.png)

### (1) Pixel average: the baseline

- **How:** crop each image to a square, resize it, and average every pixel. This is Galton's composite, or Jason Salavon's averages.
- **Alignment:** with faces, Galton lined up the eyes. A general collection has nothing to line up, so the only alignment is the square crop.
- **What its latent image looks like:**
  - For the landscapes, a grey-green fog with a faint horizon.
  - For mixed OASIS photos, flat grey-brown.
- **What it means:** the collection's average light and colour, place by place in the frame. It knows nothing about what the images show.
- **Cost:** none. It is numpy, takes seconds and needs no download.

### (2) Average of a VAE's codes, decoded

A **VAE** (variational autoencoder) is a model that squeezes an image into a short code and back.

- **How:** encode each image, take the mean (or median) of the codes, and decode it. Also decode the main axes: the principal components of the codes, at the mean minus and plus two spreads.
- **Which VAE:**

  | VAE | Licence | Size |
  |---|---|---|
  | `stabilityai/sd-vae-ft-mse` | MIT | 335 MB |
  | `madebyollin/sdxl-vae-fp16-fix` | MIT | 335 MB |
  | `madebyollin/taesd` (Tiny AutoEncoder, same code space as Stable Diffusion's VAE) | MIT | **10 MB** |

  TAESD has two files of 4.9 MB each and is about 60 lines of MLX here. The prototype used it.
- **Measured:**
  - 513 pictures at 256 px encoded in 10 s; 1.0 GB peak.
  - 40 pictures in under a second.
  - The code is 32 × 32 × 4.
- **What its latent image looks like:**
  - For the landscapes: a warm, soft scene with light sky over dark ground.
  - For mixed OASIS photos: warm brown fog.
- **The axes** read as the collection's main tensions:
  - Landscapes, first axis: pale, open views against dark, heavy ones.
  - Landscapes, second axis: a framed dark mass against a luminous sky.
  - OASIS, first axis: light against dark. Second axis: orange warmth against blue sky.
  - The first axis holds 15–17% of the spread; the next ones 4–7% each.
- **What it means:** the centre of the collection in a space a model learned from millions of images. It is still an average, so it blurs. The more varied the collection, the more it blurs.
- **Cost:** 10 MB, seconds, any Mac.

### (3) Embedding statistics (SigLIP, Apache 2.0, already in the tool)

- **How:** take the mean and principal components of the collection's SigLIP embeddings. SigLIP's numbers are about what an image shows (a harbour, a portrait, snow), not where its light falls.
- **What its latent image looks like:** there is no picture. No small, permissively licensed generator turns a SigLIP embedding back into an image:
  - Kandinsky 2.2 (Apache 2.0) decodes image embeddings from a different, larger CLIP encoder (ViT-G/14). Its files come to about 16 GB.
  - Stable unCLIP is under OpenRAIL-M, not a permissive licence.

  So this latent image can only be *shown* as the images nearest it, the most typical of the collection, and each axis as the images at its two ends.
- **What it means:** the collection's centre of subject matter. It is a useful second measure beside (2): an image can be near the latent image in look and far from it in subject.
- **Cost:** the 214 MB encoder already built; seconds.

### (4) A small model of your own, trained on the person's images

This is the "based on the training" version.

- **Small VAE on pixels**, in MLX:
  - Measured: 2.2M parameters, 17 ms a step of 32 images at 64 × 64, well under 1 GB.
  - 500 images for 300 passes is about 4,700 steps, about **80 seconds**; at 128 × 128, about 5 minutes.
  - Its latent image is its decoder's output at the centre of its code space: the origin, where its prior is densest.
  - With a few hundred images it is blurrier than (2), because it has learned from far fewer images than TAESD.
- **Small diffusion or flow model:**
  - Not measured; this estimate is from typical small models: a U-Net of about 30M parameters at 64 × 64 needs 50,000–200,000 steps, about 1.5–5 hours here.
  - It needs **thousands** of images. With a few hundred it memorises them and its "centre" is one of them.
  - Its latent image would be a sample drawn with the noise turned down, towards the most likely image.
  - Too slow and too data-hungry for a class session; possible for a thesis with time and a large archive.
- **Small VAE on the TAESD codes**, which combines (2) and (4):
  - The person's model learns their collection in TAESD's code space: 4,096 numbers an image instead of 196,608.
  - Its centre decodes through its own decoder, then TAESD's, at 256 px.
  - Training is as quick as the pixel VAE, and the picture is as sharp as (2).
  - It needs **50 images at the least, 200–1,000 to mean much**. Below that, the plain mean of the codes is as good.
  - A caution: if the model were linear, its centre would simply be the mean of the codes, which is (2). A small nonlinear model's centre differs from that mean, but that difference is not evidence of anything "deeper". The card compares the two and lets the student see.

### Recommendation

**Main path: (4) a small VAE trained on the TAESD codes of the person's images.**

- It is the trained version the thesis asks for.
- It trains in a minute or two on any 8 GB Mac.
- Its latent image is a 256 px picture, not a 64 px blur.
- **Comparisons beside it:**
  - (1), the pixel average, as the baseline;
  - (2), the plain code average, which the training adds nothing to if the two look alike, and that is worth seeing.
- **(3), SigLIP,** adds "near in subject" to the gallery.

If the trained centre proves no different from (2) on real collections, (2) becomes the main path and the card says why. That is the first thing the build checks.

## 4. The texts

These texts are on the subconscious, memory and perception, and all are public domain in the US (Project Gutenberg). The table also notes their status outside the US.

| Text | Where | Notes |
|---|---|---|
| Freud, *The Interpretation of Dreams* (Brill translation, 1913) | Gutenberg **66048** | Freud died in 1939 and Brill in 1948, so it is also public domain where the term is life + 70. Freud compares dream "condensation" to **Galton's composite photographs**, three times. That is the thesis's own precedent. |
| Freud, *Psychopathology of Everyday Life* (Brill) | Gutenberg **67332** | as above |
| Freud, *Dream Psychology* (Eder translation) | Gutenberg **15489** | as above |
| Not these: Freud in the Strachey or Riviere translations, e.g. *Group Psychology* (Gutenberg **35877**) | | In copyright outside the US: Strachey died in 1967, so until 2038; Riviere died in 1962, so until 2033 |
| Galton, *Inquiries into Human Faculty* (1883) | Gutenberg **11562** | The source of the composite portrait, written for eugenics. Use it as history, not method. |
| Bergson, *Matter and Memory* (Paul & Palmer translation, 1911) | Not on Gutenberg; Internet Archive `mattermemory01berg` (1919 printing) | Public domain in the US (published before 1931); Bergson died in 1941 |
| Bergson, *Dreams* (Slosson, 1914) and *Creative Evolution* (Mitchell, 1911) | Gutenberg **20842**, **26163** | |
| William James, *The Principles of Psychology*, vol. 1 and 2 | Gutenberg **57628**, **57634** | The chapters on the stream of thought, memory and attention |
| William James, *Psychology: Briefer Course* | Gutenberg **55262** | |
| Goethe, *Theory of Colours* | Gutenberg **50572** | |
| Wikipedia: "Unconscious mind", "Preconscious", "Composite portrait", "Gestalt psychology" | `data raw wikipedia <title> <name>` (built) | CC BY-SA 4.0: credit the article, share alike |

**How they enter: they don't change the model, and the card says so.** None of the four ways reads text: a VAE learns pixels, and the trained model learns the person's images. So the texts stay as **framing**:

- a reading list on the card, with the Galton–Freud passage quoted;
- passages the student chooses, printed with the latent image on the gallery page, each with its source.

There is one place they could touch the numbers. SigLIP can embed a sentence, so the sentences nearest each SigLIP axis could be listed as that axis's "name". In the mood test, SigLIP matched sentences about colour and light and missed abstract ones. James on memory, or Freud on condensation, would be matched almost at random. I'd leave that out rather than make the claim bigger than it is.

## 5. The gallery step

Point it at a folder: the collection itself, or another one ("how close are these museum pictures to my latent image?"). For each image it gives:

- **Distance from the latent image:** in the trained model's code space, in units of the collection's own spread, so 1 is typical and 3 is far. It also gives the SigLIP distance ("near in subject") beside it.
- **The axes it pulls toward:** its position on the first five axes, with sign. Each axis is shown once at the top of the page as its two decoded ends, so "+2 on axis 1" can be seen, not just read.
- **What it brings:** the part of the image that the latent image and its first five axes don't explain. That is the difference between the image and its rebuilding from those. It is shown as a small heat map, and its size is a number: high means the image brings something the collection mostly lacks.

**Output:** `workspace/outputs/<set>-<model>/`:

- `gallery.html`, the contact sheet: the latent image, its axes, and every image with its distances, axes and heat map, sorted from nearest to furthest. It is one file, sandboxed, as in c58301a.
- `latent.json`, with every number above.
- `latent.png` and `axis-<n>-<sign>.png`.

## 6. The check

There is no right answer to score against, so the check is whether the model holds up:

- **Held-out fit:** set 20% of the collection aside. Those images should rebuild about as well as the training images. If they rebuild far worse, the model memorised the collection rather than learning it, and the card says "too few images for training; use the code average".
- **Stability:** train twice on two random halves of the collection. The two latent images should look alike, and the first axes should point the same way. That is measured as the correlation between the halves' axes, with 0.7 or more counting as stable. A latent image that changes with the half is noise, not the collection's.
- **Against the baselines:** distance between the trained centre and the code mean, and between the trained centre and the pixel average. These are reported, not judged.

**Good enough** means set-aside rebuild error within 25% of training error and the first axis stable (0.7 or more) across halves. Below that, the card falls back to (2).

## 7. The build, after your OK

| Step on the card | Tab | Command |
|---|---|---|
| get the image autoencoder (TAESD, MIT, 10 MB) | Models | `model get taesd` |
| bring in the person's images | Image segmentation | upload, or `look museum "<artist>" <set> --limit 100` |
| bring in texts, as framing | Data | `data raw gutenberg 66048 freud-dreams`, `data raw gutenberg 20842 bergson-dreams` |
| the pixel average and the code average | Image segmentation | `latent average images/<set>` |
| train the collection's model, with 20% set aside, and check it on two halves | Train | `latent train <name> images/<set>` |
| measure a gallery against it | Image segmentation | `latent gallery <name> images/<gallery>` |
| package it | Share | `package <name>`, `zip packages/<name>` |

**Carried over from c58301a:**

- `look museum`;
- `data raw wikipedia`;
- the sandboxed HTML gallery and its served type;
- the python extra pattern and the package's runs-without-Variable-Machine script;
- the SigLIP encoder, for (3);
- the Projects card format and step links.

**To take out:** the image-moods card, `mood` commands, the OASIS import and the `sorts` kind. They answer the old brief. I'd remove them from this branch rather than merge them, unless you want image moods kept as a second card.

**New:**

- `model get taesd`;
- `python/variable_machine/latent.py` (MLX: TAESD, the small VAE, statistics);
- `helper/src/latent.ts`;
- the card in `ProjectsPanel.tsx` and `projects.md`;
- a guide section.

**Test:** end to end on 100 AIC works by one artist and on 40 landscapes, on a spare port. Report the held-out and stability numbers, and whether the trained centre differs from the code average.
