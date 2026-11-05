# Image moods: plan, sources and results

A Projects card: train a model on pictures for what a picture conveys, its mood, informed by texts on colour and perception. Then have it sort the pictures in a gallery. Written 2026-11-04. Licences were checked on that date against the sources themselves.

## What "mood" means here, and what it doesn't

**Mood** is what a *picture* conveys: its affect, as people rate it. The project uses two ratings from affect research.

- **Valence** is how pleasant a picture is.
- **Arousal** is how calm or stirred up it makes you.

Crossing them gives four named moods, the four quarters of Russell's circumplex (valence across, arousal up):

| | low arousal | high arousal |
|---|---|---|
| **pleasant** | calm | lively |
| **unpleasant** | sombre | tense |

The classifier judges a picture by its look: colour, light, what is in it. Colour psychology, perception and Gestalt give the words for that.

It does **not** judge the people in a picture. It reads no personality, mental state or emotion from faces or bodies, for two reasons:

- Reading emotion from faces is unreliable.
- The EU AI Act (Article 5(1)(f)) bans emotion recognition in workplaces and education.

So the training pictures contain no people, no face-based dataset is used, and the card says so in its **what it can't do** line.

## 1. Image datasets with mood labels

I found no mood-labelled image set under Apache 2.0, CC0 or CC BY with traceable images. Every one is research-only or has no licence, so **every option here is "student project only"**: fine for class work and a student's own project, not for anything sold or published as a dataset.

| Dataset | Licence (as the source states it) | Size | Download address | Labels | People |
|---|---|---|---|---|---|
| **OASIS** (Kurdi, Lozano & Banaji 2017), **used here** | No licence on the OSF project. The paper says the images "can be downloaded, used, and modified free of charge for research purposes". The photos come from Pixabay (646), Wikipedia (174) and Flickr (72) under reuse licences, each named in OASIS.csv. **Student project only.** | 900 photos, 500×400, **92 MB zip** | `https://osf.io/download/uxvpb/` (project https://osf.io/6pnd7/) | Valence and arousal, 1–7, about 100 raters a photo | Person category (346) dropped; 20 more themes of people dropped by name |
| Machajdik & Hanbury 2010, "Abstract" | "may be under copyright… provided here solely for scientific use". **Student project only.** | 280 abstract paintings, 12.4 MB | `https://www.imageemotion.org/testImages_abstract.zip` | Vote counts over 8 emotions | None (abstract art). Best fit for colour and Gestalt, but small and noisy |
| Emotion6 (Peng et al. 2015) | "academic research only. Image copyright remains with the original owners". **Student project only.** | 1,980 Flickr photos, 190 MB | `http://chenlab.ece.cornell.edu/people/kuanchuan/publications/Emotion6.zip` | Valence and arousal (1–9) and 7 emotions | Yes, no flag to drop them |
| EmoSet-118K (Yang et al. 2023) | "publicly accessible for non-commercial uses only"; no redistribution. **Student project only.** The Hugging Face mirror `zhang-ge-hao/EmoSet-118K-hf` says Apache 2.0, which contradicts the original: don't rely on it. | 118,102 photos, about 11 GB | https://vcc.tech/EmoSet | 8 emotions, plus brightness, colourfulness, scene, `facial_expression`, `human_action` | Yes; the last two fields can be used to drop them. The best large set, too big for this Mac's disk |
| ArtEmis (Achlioptas et al. 2021) + WikiArt | "non-commercial research and educational purposes", behind a form. WikiArt images: licence unknown. **Student project only.** | 455K annotations on 80K artworks; images 33.7 GB | https://www.artemisdataset.org/ | 9 emotions, each with a written explanation | Yes, many portraits |
| WikiArt Emotions (Mohammad & Kiritchenko 2018) | No licence; "Do not redistribute". **Student project only.** | 4,105 artworks, 1.9 MB of labels (images fetched separately) | `http://saifmohammad.com/WebDocs/WikiArt-Emotions.zip` | 20 emotion options | Yes |
| FI (You et al. 2016), GAPED (2011) | No licence found; GAPED's page wouldn't load. **Student project only**, not checked | 23K / 730 | FI only through the Web Archive | 8 emotions / valence and arousal | Yes |

Left out on purpose: FER, AffectNet, EMOTIC and every other facial-expression set, including `FastJobs/Visual_Emotional_Analysis` on Hugging Face.

**Why OASIS:**

- It is small: one 92 MB file, where EmoSet is 11 GB.
- Its ratings come from about 100 people a photo, so they are steady.
- Its Category column makes leaving people out a rule rather than a guess.
- Its photos have the clearest sources of any set here.

**How OASIS becomes moods** (`data import oasis <name>`, in `helper/src/oasis.ts`):

1. Leave out the Person category: 346 photos.
2. Leave out 20 themes in the other categories whose photos are mostly of people, such as War, Wedding, Funeral, Soldiers, Skydiving and the "pose" photos: 41 photos. That leaves 513.
3. A photo is **pleasant** above 4, the middle of the 1–7 scale.
4. Its arousal is **high** above 3.64, the median of the photos kept. OASIS's photos are mostly rated calm: with the scale's middle, three in four would be "low".
5. The result is calm 201 · lively 138 · tense 118 · sombre 56.

Each photo's mean ratings go into `ratings.csv` beside the rows. Each photo's source goes in the manifest.

OASIS includes unpleasant photos (a carcass, a crash, a bloody knife). The unpleasant moods are learned from them; tell students before they open the set.

## 2. Texts for the psychology

| Text | Where | Licence |
|---|---|---|
| Goethe, *Theory of Colours* (Eastlake translation, 1840) | Gutenberg **50572**: `data raw gutenberg 50572 goethe-colours` | Public domain (US); Gutenberg |
| William James, *Psychology: Briefer Course* (1892) | Gutenberg **55262** | Public domain |
| William James, *The Principles of Psychology*, vol. 1 and 2 | Gutenberg **57628**, **57634** | Public domain (large: 4,000+ sentences a volume) |
| Chevreul, *The Laws of Contrast of Colour* (Spanton translation, 1861) | Gutenberg **76939**. The Martel translation, *Principles of Harmony and Contrast of Colours*, is on the Internet Archive (`principlesharmo00martgoog`) | Public domain |
| Kandinsky, *Concerning the Spiritual in Art* (Sadleir) | Gutenberg **5321** | Public domain in the US; the translator died in 1957, so not yet in life+70 countries |
| Köhler, *Gestalt Psychology* (1929) | Gutenberg **79014** | Public domain in the US only |
| Rood, *Modern Chromatics* (1879) | Internet Archive `modernchromatics00rood` (not on Gutenberg) | Public domain |
| Wikipedia: "Color psychology", "Gestalt psychology", "Emotion classification" (which covers the circumplex), "Valence (psychology)", "Principles of grouping", "Color symbolism" | `data raw wikipedia Color_psychology colour-psychology` (new here) | **CC BY-SA 4.0**: credit the article (title and link) and its contributors, and share what is made from its text alike. The manifest records the article's address |
| Jonauskaite & Mohr 2025, "Do we feel colours? A systematic review of 128 years of psychological research linking colours and emotions", *Psychonomic Bulletin & Review*, doi:10.3758/s13423-024-02615-z | PMC12325498 | **CC BY 4.0**: the best openly licensed paper on colour and emotion |
| Jonauskaite et al. 2020, "Universal patterns in color-emotion associations", *Psychological Science* | Accepted manuscript at serval.unil.ch | CC BY-NC-ND: **student project only** |
| Valdez & Mehrabian 1994; Ou et al. 2004; Machajdik & Hanbury 2010 | | Closed: cite them, don't bring them in |

Wertheimer's 1923 Gestalt paper is public domain in German. Its English translations (Ellis 1938) may still be in copyright, so they aren't brought in.

The test used Goethe, James's *Briefer Course*, and Wikipedia's "Color psychology" and "Gestalt psychology": 6,802 sentences.

## 3. The approach, measured against an 8 GB Mac

**(a) SigLIP encoder plus a small classifier.**

- SigLIP base (google/siglip-base-patch16-224, Apache 2.0) turns a picture, or a sentence, into 768 numbers in one shared space.
- It runs as 8-bit ONNX files (Xenova's conversion, 214 MB) with onnxruntime on the CPU, a 21 MB download (75 MB installed) in the python project's `mood` extra.
- On top sits a softmax classifier: 4 × 768 weights, in plain numpy.
- Measured on an M1 Pro:
  - Training from nothing, including embedding all 513 pictures: **30 s, 0.78 GB peak**.
  - Once the embeddings are kept: 8 s.
  - Sorting a 40-picture gallery: 4 s, 0.80 GB.
- This fits any 8 GB Mac with room to spare.

**(b) LoRA on SmolVLM-256M** (Apache 2.0) on the same picture rows: each row a photo, the question, and the answer "calm", or "calm: <a reason from the texts>".

- Measured in the Sees session on SmolVLM-256M: **4.4 GB peak at batch 1, 2.4 s a step** on an M1 Pro.
- 410 rows for three passes is about 1,200 steps, about 50 minutes, and on an 8 GB Mac it would compete with everything else for memory.
- Its answer is generated text, so a label has to be parsed out of it.
- It gives no confidence. The share of 100% each mood gets in (a) has no equivalent here.
- It can write a reason, which the texts could teach. But that reason is the model's own writing, and can sound right while being wrong.

**Recommendation: (a).** It is about a hundred times quicker to train and uses a fifth of the memory. It gives a real confidence, and its held-out score is easy to read. The rows are a Data picture dataset, so (b) remains open on the Train tab with the same rows, for a student who wants the model to talk. The Train tab points from one to the other.

### How the texts enter the training, and what each way does

1. **As descriptions of each label** (built). `mood describe` cuts the texts into sentences of 8–40 words and embeds each with SigLIP. For each mood it keeps the 8 sentences that score highest on two counts. Each count is measured against the other moods, so a sentence near everything scores nothing:
   - nearness to the mood's prompt ("a picture that feels calm, peaceful, quiet, gentle and serene");
   - nearness to the mood's own training pictures, counted half.

   They go into `labels.md` with their source, for the student to read and edit. Training averages each mood's prompt and sentences into one direction. That direction is the classifier's starting point (**the texts alone**, a zero-shot classifier) and a pull it can be held to while it learns from the labels.

   *What it does, measured on the 103 set-aside pictures:*
   - The texts alone are right 36% of the time, no better than always saying "calm" (35%), though their balanced F1 is higher (0.33 against 0.13).
   - With all 410 labels, the texts add nothing to accuracy. Cross-checking on the training rows chooses not to hold the classifier near them, and labels alone and labels with texts both score 71%.
   - They help only when labels are scarce. With 3 labelled pictures a mood (10 draws), balanced F1 rises from 0.40 to 0.47. From 10 a mood on they add nothing, and holding them too tightly costs 5–13 points.
2. **As retrieval at answer time** (built). For each gallery picture, the reason quotes the sentence among its mood's sentences that is nearest the picture, compared with the other pictures. Without that comparison, one general sentence about light was every picture's reason.

   *What it does:* it puts the psychology in front of the reader, one cited sentence per picture. It doesn't change the mood. It is found, not written, and **it is not why the classifier chose**. The gallery and the card both say so. The first half of the reason, what was measured in the colours (light, warmth, strength, contrast), is the measured part.
3. **As rows for the reasons** (approach (b) only, not built). Each training row's answer gets a reason drawn from the texts ("sombre: dark, cool and low in contrast; Goethe: …"), and SmolVLM learns to write one.

   *What it would do:* the model writes reasons in that style, true or not. It is worth trying only with reasons a person has checked, row by row.

What the sentence picking gets wrong: SigLIP was trained on captions, so sentences about colour and light score higher than sentences about feelings. Picks for calm are mostly Goethe on coloured glass. Picks for tense include James on fear, and also his physiology. Hence the step "read labels.md, and cut what doesn't fit".

## 4. The gallery step

`look museum "<search>" <set> --limit 40` brings in public-domain artworks from the **Art Institute of Chicago**.

- No API key is needed.
- The API marks `is_public_domain`, and its data is CC0, except descriptions, which aren't used.
- Images come at 843 px from the museum's IIIF server.
- The set's manifest credits each work: title, artist, date and page.

Any image set works, including the student's own photos uploaded on the image segmentation tab. Other CC0 collections, for a later command:

- **Cleveland Museum of Art:** one call, `openaccess-api.clevelandart.org/api/artworks/?q=…&cc0=1&has_image=1`.
- **The Met:** `collectionapi.metmuseum.org/public/collection/v1.1/search`. The old v1 search was retired on 2026-10-01.
- **Rijksmuseum:** Linked Art search, with no key.

`mood gallery <classifier> images/<set>` writes `workspace/outputs/<set>-<classifier>/`:

- `gallery.html`, a contact sheet. Each picture shows its mood, its confidence and the one-line reason. Thumbnails are inside the file, so it is one file to share. It is served sandboxed, with no scripts.
- `moods.csv` and `moods.json`, which give each picture's mood, confidence, every mood's share, the reason, the colour measurements and its credit.

## 5. The held-out check

`data split <set> --valid 0.2` sets 103 pictures aside. They are never trained on, and `mood train` is scored on them against three others:

| on 103 pictures set aside | right | balanced F1 |
|---|---|---|
| always the commonest mood (calm) | 35% | 0.13 |
| the texts alone | 36% | 0.33 |
| the labels alone | 71% | 0.67 |
| **labels and texts (the classifier)** | **71%** | **0.68** |

Per mood:

| mood | found | right when it says so | pictures set aside |
|---|---|---|---|
| calm | 78% | 74% | 36 |
| lively | 67% | 77% | 30 |
| tense | 86% | 72% | 21 |
| sombre | 44% | 50% | 16 |

Sombre has the fewest pictures (56 in all) and is mostly confused with tense and calm.

**Good enough** means all three of these hold on the pictures set aside:

- 60% right or better;
- balanced F1 (each mood counted equally, so a common mood can't carry it) of 0.55 or more;
- at least 20 points above always guessing the commonest mood.

This classifier passes all three: 71%, 0.68, and 36 points above. For a sense of the ceiling: people agree with OASIS's average rating only to a degree (each photo's ratings have a spread of about 1 to 1.6 points on the 7-point scale), so a photo near the middle of either scale has no single right mood.

Pictures unlike the training photos do worse, and the gallery is unlike them: paintings, not photos. Its scores can't be checked without ratings of its own. A student who rates 30 gallery pictures by hand gets that check.

## 6. What was built

| Step on the card | Tab | Command |
|---|---|---|
| get the picture encoder | Models | `model get siglip` |
| bring in pictures rated for their mood | Data | `data import oasis oasis-moods` |
| bring in texts | Data | `data raw gutenberg 50572 goethe-colours`, `data raw wikipedia Color_psychology colour-psychology` |
| set pictures aside | Data | `data split oasis-moods --valid 0.2`, `data validate oasis-moods` |
| pick each mood's sentences | Data | `mood describe oasis-moods --texts raw/…`, then `cat data/oasis-moods/labels.md` |
| train and check | Train | `mood train oasis-moods-siglip --data oasis-moods` |
| bring in a gallery | Image segmentation | `look museum landscape aic-landscapes --limit 40` |
| sort it | Image segmentation | `mood gallery oasis-moods-siglip images/aic-landscapes` |
| package it | Share | `package oasis-moods-siglip`, `zip packages/oasis-moods-siglip` |

**Code:**

- `python/variable_machine/mood.py` (describe, train, gallery);
- `helper/src/mood.ts` (the `mood` commands);
- `helper/src/oasis.ts` (the OASIS import);
- `helper/src/museum.ts` (`look museum`);
- the `wikipedia` source in `helper/src/rawsources.ts`;
- `ENCODER_MODELS` and the new kind **sorts** (image classification) in `helper/src/shared/kinds.ts`;
- the classifier package in `helper/src/package/index.ts`;
- the card in `ui/src/components/ProjectsPanel.tsx` and `ui/src/text/projects.md`;
- an encoder card on the Models tab, and a pointer on the Train tab for a picture dataset of moods.

**The package** is a 120 KB zip. It holds the classifier, labels.md, mood.py, classify.py, and `get-encoder.sh`, which fetches SigLIP (214 MB) once. It runs outside Variable Machine with `uv run --with onnxruntime --with pillow --with tokenizers --with numpy python classify.py <folder>`; this was tested from the unzipped package.

**Disk used by the test:**

- encoder: 204 MB;
- OASIS zip: 88 MB, kept in `raw/oasis`;
- dataset: 51 MB;
- gallery set: 8 MB;
- python `mood` extra: onnxruntime, 75 MB installed.

**Not done:**

- EmoSet or ArtEmis importers (too large here);
- approach (b) trained on these rows;
- a rated gallery check;
- Cleveland, Met and Rijksmuseum fetchers;
- the start map, site and README not regenerated.
