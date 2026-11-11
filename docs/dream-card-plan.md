# Dream reading: plan

A Projects card for a student's installation, written and built 2026-11-11. The student is Taiwanese; she uses she/her. Kevin's words for the project: "people choose images that resemble some aspect of the user's dream and then interpreting it in an immersive installation... she has four images of who/what/when/where and they choose one, and then it generates a response."

**Card name:** *dream reading · who, what, when, where*.

The sources are in [`dream-reading.md`](dream-reading.md). The card reuses the latent image card's model (Kandinsky 2.2) and its loading code (`python/variable_machine/latent.py`); see [`latent-image-plan.md`](latent-image-plan.md).

## 1. The interaction

1. **The visitor thinks of a dream.** They can type a few words of it, or not.
2. **The room shows four pictures**, side by side, each labelled with its category in Chinese and English:
   - **who** (誰): a person, a god, an animal, a body;
   - **what** (什麼): a thing, or something that happens;
   - **when** (何時): the sky, the weather, a time of life;
   - **where** (何地): a place.

   Each category is a set of pictures. The room deals one from each set at random, so each visitor sees a different four.
3. **The visitor touches the one most like their dream.** That is the **choice**: one category and one picture.
4. **The room answers** after about a minute, with the **response**:
   - **the reading:** the lines the dream book has for that picture, in Chinese, then a short reading in Traditional Chinese and in English;
   - **the response picture:** a new picture, drawn from the chosen one and from what the book says it foretells.
5. **"Another dream"** deals four new pictures for the next visitor.

Each response is kept: `workspace/dreams/<name>/responses/<n>/` holds `response.png`, `response.json` and `response.html`. The HTML is a fuller page than the room shows: the chosen picture and the response, the book's lines with their glosses, the reading, and other traditions' ways of reading the same dream.

## 2. Where the four pictures come from

| | The student's own pictures | Generated with Kandinsky |
|---|---|---|
| How | She uploads four image sets on the image segmentation tab, one per category | `dream make … --drawn N`: Kandinsky 2.2 draws N pictures for each category from the centre of that category's pictures (the latent image card's method, run on each set) |
| What the visitor sees | Her work: photographs, drawings, found images | New pictures, in the manner of her sets: what each set has in common, not any one picture |
| Needs | A few pictures a category; 8 or more so visitors see different ones | Her sets as well (at least 4 a category): the drawing starts from them |
| Cost | Nothing more | About 16 s a picture, on top of `make` |
| Licence | Hers | Hers, through Kandinsky (Apache 2.0) |

**Kandinsky can't draw from prompts in this build.** It draws from 1280 numbers (an embedding), and the tool has only its picture encoder. Drawing from a written prompt needs Kandinsky's prior, a second model that turns text into those numbers: 6.9 GB more (`kandinsky-community/kandinsky-2-2-prior`, its text encoder and diffusion prior; Apache 2.0). That isn't built, so `--drawn` draws from the pictures, not from words.

**Recommendation: her own pictures, with `--drawn` as an option.** The installation is her work, and her pictures are what make it hers; the drawn pictures sit beside them as the set's own "dream" of itself. Generated-from-prompts is worth adding only if she has no pictures for a category; that needs the prior (6.9 GB) and is Kevin's call.

To try the card before she has pictures, four public-domain sets come from the Art Institute of Chicago (CC0): `look museum portrait dream-who --limit 8`, and `still life`, `moon` and `landscape` for the other three.

## 3. "Trained on dream interpretation", honestly, on a laptop

"Train a model on dream interpretation" can mean four things. Each was weighed for a Mac with 16 GB of memory:

### (a) Retrieval: a dream book searched by the chosen picture (built)

- **The dream book:** the *Zhougong jiemeng* (周公解夢), from Chinese Wikisource (public domain). It has 27 sections and 988 lines; each line is a dream and what it foretells: 天門開貴人薦引, "the gate of heaven opens: a noble person will recommend you".
- **The bridge from a picture to the book.** A **glossary** (`GLOSSARY` in `python/variable_machine/dream.py`) of about 140 characters, each with one English word, set under who, what, when or where: 蛇 *a snake*, 門 *a gate*, 月 *the moon*. Every character is one the book's dreams use.
  - SigLIP (Google, Apache 2.0, 214 MB, already in the tool for image moods) puts a picture and an English phrase into the same 768 numbers. For each picture, `dream make` keeps the three glossary words of its category nearest it ("a picture of a snake").
  - The book's lines whose dream (the first four characters) holds that character are the picture's lines.
- **Why not the picture model alone:** Kandinsky's encoder reads pictures only, and the tool has no text half of it.
- **Why a glossary, not the whole book in English:** glossing 988 lines with a small local model took 5 minutes for 30 lines when it was tested (it reasoned at length first), so the book is glossed a few lines at a time, at response time. The glossary is also something the student can read, check and change: she reads the Chinese, and what the book can "see" in a picture is exactly the glossary's words.
- **Cost:** seconds; no training.
- **Limit:** a picture is only ever read through the glossary's 140 words. SigLIP was trained on English captions of web photos; it finds snakes and moons well, and abstract things ("a beginning") badly.

### (b) A language model writes the reading (built)

- **Which:** `qwen3:4b` in Ollama (Alibaba, **Apache 2.0**, 2.5 GB). It is already one of the two models `doctor` suggests, and the stand-in `reader check` compares against; it writes Traditional Chinese.
- **Claude through the API:** the tool has no path for it (no Anthropic key or client anywhere in the helper), and a gallery visitor's words would leave the laptop. Not built.
- **What it is given:** the category, the picture's glossary words, the visitor's own words if they gave any, and the book's lines (up to five). It answers in JSON: each line glossed (the dream, and what it foretells), then a four-sentence reading in English and the same in Traditional Chinese, from those lines only.
- **What it is not:** a model trained on dream interpretation. It is a general model reading the book's lines. The page says so, and prints the lines beside its glosses so a reader of Chinese can check them.
- **Cost:** measured: 21 s a response on an M1 Pro (32 GB). Qwen3 reasons at length first unless the prompt ends with `/no_think`; Ollama's `think: false` was ignored here, and one test took 5 minutes.
- **Limit:** it can gloss wrongly, and the visitor's words are context, not something the book was looked up by.

### (c) Kandinsky draws the response picture (built)

- **How:** the chosen picture's 1280 numbers, moved 40% of the way toward the picture (among all four categories' pictures) that SigLIP finds nearest to what the first line foretells. Kandinsky's decoder draws the result (30 steps, 512 px, about 20 s).
  - Choose a snake picture; the book says 蛇入門主得財, "a snake comes in at the gate: you will gain wealth"; the response is the snake drawn toward the picture of hers that looks most like "wealth".
- **Without a gloss** (Ollama not running), the chosen picture is moved toward the other three pictures on the wall, together: the whole dream condensed into one picture, as Freud would put it.
- **Conditioned on the reading itself,** as text, it would need Kandinsky's prior (section 2); with it, the reading's sentence could be turned into numbers and mixed in directly. Not built.
- **Limit:** the omen enters the picture only through her own pictures. If none of them looks like "a noble person", the nearest is a loose fit, and the response says which picture it was.

### (d) A LoRA trained on the student's own pictures (not built in this card; built in the latent card)

- `latent train <name>` already trains Kandinsky's decoder on a set (LoRA: 1.6M added weights, about 1.5 s a step, 9 GB of memory). Trained on all her pictures, the response would be drawn in her look, not the web's.
- **Not built here** because a trained decoder takes 10–20 minutes per set, and the card works without it. Adding `--lora latents/<name>` to `dream respond` is a few lines (the `decoder()` function already takes a LoRA). Worth it once her pictures are final.

### Recommendation (built)

**(a) + (b) + (c):** retrieval from the *Zhougong jiemeng* by the chosen picture, a reading written by `qwen3:4b` from the lines found, and a response picture drawn by Kandinsky toward the omen. It is honest about what it is (a folk book, looked up and paraphrased) and runs on the laptop with no training. **(d)** is the next step, when the student's sets are final.

| | Download | Memory | Time per response |
|---|---|---|---|
| Kandinsky 2.2 (draws) | 9 GB | about 8 GB at peak | 20 s, plus about 25 s to load |
| SigLIP (matches) | 214 MB | under 1 GB | about 1 s |
| qwen3:4b (reads) | 2.5 GB | about 3 GB | 21 s |

A whole response took about 70 s in the test. A Mac with 16 GB runs it; 32 GB is comfortable. Loading Kandinsky each time takes about 25 s of that; a long-running server process would cut that and is the obvious next improvement for a show.

## 4. The other traditions on the page

The reading is the *Zhougong jiemeng*'s. Under it, each response page prints, in one line each, how other traditions would read a dream (`FRAMES` in `dream.py`):

- **Wang Fu** (*Qianfu lun*, "Meng lie", 2nd century): ten kinds of dream, including dreams of the season (時) and dreams that mean their opposite (反). This is where "when" comes from: the book itself has no section on time.
- **The *Liezi*** ("King Mu of Zhou"): six kinds of dream, and the servant who dreams he is a lord.
- **Zhuangzi:** the butterfly dream.
- **Freud,** with the note that most dream researchers since the 1950s reject him (Domhoff).
- **Hoel:** dreams as the brain's own strange pictures, against overfitting.
- **The Akan** (Nrenzah, 2025): a dream as a meeting with others.

These are framing, not part of the reading. The student can edit them, and should add the Korean and Taiwanese material she chooses from the reading list.

## 5. How the installation runs

- **The room page:** `http://localhost:4843/#room/<name>` (port 4817 on Kevin's own copy). It is a page of the app, but shows nothing else: black, full screen (press the browser's full-screen key), four pictures, a box for a few words, and the response.
  - It runs the card's own commands, `dream choose` and `dream respond`, so every response is in the terminal's history and the workspace.
  - It is separate from the card: the card is for making and testing; the room is for the visitor.
- **Hardware:** the laptop runs Variable Machine; a second screen or a projector shows the room. A touch screen works as it is (each picture is a button); a mouse works too.
- **One visitor at a time.** A second touch while a response is drawn is ignored.
- **Privacy:** a visitor's words are kept in `choice.json` and the response, on the laptop only. Nothing leaves it: all three models run locally. The student should say so on a card in the room, and clear `workspace/dreams/<name>/responses/` (move it to the Trash) after the show if she doesn't want to keep them.

## 6. The build (done 2026-11-11)

| Step on the card | Tab | Command |
|---|---|---|
| get the models | Models | `model get kandinsky`, `model get siglip`, `ollama pull qwen3:4b` |
| the student's pictures | Image segmentation | upload four sets |
| or: public-domain sets | Image segmentation | `look museum portrait dream-who --limit 8` (and `still life`, `moon`, `landscape`) |
| the texts | Data | `data raw txt <Wikisource address> zhougong-jiemeng …`, the *Liezi* in Chinese and in Giles's English, Wang Fu's "Meng lie", Zhuangzi (Gutenberg 59709), Freud (66048), *Kuunmong*, Wikipedia's "Dream incubation" |
| make it | Image segmentation | `dream make <name> --book raw/zhougong-jiemeng --who images/<set> --what … --when … --where … [--drawn 0]` |
| choose | Image segmentation | `dream choose <name> <who\|what\|when\|where> <picture> [--dream "<a few words>"]` |
| respond | Image segmentation | `dream respond <name> [--model qwen3:4b]` |
| the room | — | open `#room/<name>` |

**New:**

- `python/variable_machine/dream.py`: `make` and `respond`. It imports Kandinsky's encoder, decoder and `draw` from `latent.py`, and SigLIP from `mood.py`; it loads no model of its own.
- `helper/src/dream.ts`: `dream make`, `dream choose`, `dream respond`; `UV_DREAM` (the `latent` and `mood` extras together) in `helper/src/shared/recipes.ts`.
- `workspace/dreams/<name>/`, which `trash` knows. `zip` doesn't: a dream folder holds visitors' words.
- The card at the top of Projects (`ProjectsPanel.tsx`, `projects.md`), and the room page (`DreamRoom.tsx`, opened by `#room/<name>` in `main.tsx`).
- Section 2 of `docs/projects-test-guide.md`.

**Tested** on port 4843 with four public-domain sets (8 pictures each, plus one drawn): one response by hand and two from the room page. The glosses were mostly right; one ran two omens together (刀落水中妻妾亡). Once the model wrote half its Chinese reading in English; the response now leaves such a reading out and says so.

**Not built:** prompts for Kandinsky (needs the prior, 6.9 GB); the LoRA for responses; a server process that keeps Kandinsky loaded between visitors; sound.
