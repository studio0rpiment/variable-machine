# The Variable Machine exercise: five stages, one model of your own

You will take one small model and change it three ways:

- **with words** (a Modelfile: instructions placed in front of it);
- **with examples** (Train: it imitates rows you give it);
- **with taste** (Prefer: it leans toward the answers you mark better).

Then you will **combine** them and hand in a model of your own, with a card that shows what each change did.

The point is not a good model. The point is to hear what each kind of change does, where it fails, and what happens when you stack them.

**Time:** about three class sessions, or one long workshop. Each stage says roughly how long it takes.
**Model:** `smollm2:360m` for everything you train (it trains in about three minutes). Use `qwen3:4b` or `llama3.2:3b` where a stage asks for a bigger model to compare with.
**Disk:** keep 6GB free. Remove what you don't need on Adapters as you go.

Before you start: Start → Models, pull `smollm2:360m` and `qwen3:4b`.

---

## Stage 1 · Pick a concept and listen to the original (30 min)

**Choose a concept:** a model with one clear character or job that a small model doesn't already have. It should be something you can hear in a single answer. Ideas:

- a guide to the trees on your street (the DC street-trees example is ready to use);
- a sports commentator for chamber music;
- a museum label writer for everyday objects;
- a model that answers only in questions, like a Socratic tutor;
- a weather report for feelings;
- a recipe writer that only knows what grows in your city;
- your own.

**Write five probe questions:** five questions you will ask every version of your model, from now to the end. Make them different:

- one the concept is made for;
- one a little off to the side;
- one about something it can't know;
- one that invites a long answer;
- one strange one.

Write them down. They are the same five every time, so the versions can be compared fairly.

**Listen to the original:** in **Chat**, put `smollm2:360m` and `qwen3:4b` side by side and ask both your five questions. Everything you ask is saved in the chat log, which you will use in stage 4.

**Note:** in one sentence each, how the small model answers and how the bigger one does.

---

## Stage 2 · Change it with words (30 min)

**Modelfile** tab.

1. Start from a preset close to your concept, or choose *write your own*.
2. In *3 · change what the preset adds*, write the **instructions** (the SYSTEM line) for your concept. Set the **temperature**, and give one **example** question and answer (the MESSAGE lines) in the voice you want.
3. Make the variant from `smollm2:360m`. Ask both the original and the variant your first probe question.
4. Make the same variant from `qwen3:4b` (change "start from") and ask again.
5. Press **keep it** on the version you want to bring forward, or it is cleared when the app stops.

**Note:**
- What did words alone change?
- What did they not change?
- Did the small model follow your instructions as well as the big one? (Usually not: that is the reason for the next stages.)

**Try one extreme:** the same variant at temperature 0.1 and at 1.5, with *let it pick from any word* on. Keep one surprising answer for your card.

---

## Stage 3 · Change it with examples (45 min)

**Data** tab, then **Train**.

**Make a dataset of 40 to 150 rows** that sound like your concept. Pick one way:

- **From a table:** *make a new one* → *public data*. Search DC Open Data or data.gov, bring a table in, and write a template ("What kind of tree stands at {VICINITY}?" → "{CMMN_NM}, in {CONDITION} condition.").
- **Written by a model, chosen by you:** start an empty dataset, open it, and under *write more rows* put `qwen3:4b` as the writer. In the *task* box, describe your concept, for example "Write questions a visitor might ask about a city tree, answered in the voice of a slightly vain tree." Or choose a book you brought in as material. **Keep only the rows that sound right**: your choices are what the model learns. Once you have kept a few, it writes more in their style.
- **From a collection:** import from Hugging Face by name, or use Dolly with one category, and keep the rows that fit.
- **Your own:** a spreadsheet with a question column and an answer column, uploaded as .csv.

Then:

1. **Get it ready:** check it, count it, and split it with 10–20% set aside.
2. **Open Train with it.** Base: SmolLM2-360M-Instruct. Keep the defaults (LoRA, rank 8, 200 iterations). Train. It takes about three minutes.
3. **Read the chart:** the sentence under the loss chart says whether it learned, memorised, or hardly moved. If it memorised, train again with fewer iterations (the run gets a new name; both stay).
4. **Next step → export, import, chat.** Ask your trained model the five probe questions.
5. **On Adapters, *try it*:** read three set-aside questions next to the answer in the data.

**Note:**
- What did it learn: the form of the answers, the facts, or both?
- Find one answer that has the right shape and the wrong fact.
- What does the loss reading say, and does it match what you hear?

---

## Stage 4 · Change it with taste (40 min)

**Chat**, then **Data**, then **Prefer**.

1. **In Chat**, put two different versions side by side: your trained model and your words variant, or the original and the trained one. Ask them 20 or more questions in the spirit of your concept (your probes count). Every pair of answers is now in the chat log.
2. **Data → make a new one → start an empty dataset**, format *preference*. Open it, and under *add pairs from the chat log*, mark the better answer *chosen* and the worse *rejected* for each prompt. You can also set a rule ("prefer model A over model B") for every prompt both answered. **Aim for 20+ pairs.** Your taste is the data here, so be consistent about what "better" means for your concept: shorter, warmer, stranger, more exact…
3. **Split it**, then **open the Prefer tab with it**. Base: SmolLM2-360M-Instruct. Train with the defaults (about 1½ minutes).
4. **Read the chart:** it starts near 0.69 (no preference). Lower means it leans toward your chosen answers.
5. **Next step → export, import, chat.** Ask the five probes.

**Note:**
- What is different from the trained model?
- Did it pick up your taste, or something you didn't mean, like always being short because your chosen answers happened to be short?

---

## Stage 5 · Combine, and hand it in (45 min)

Now make combinations and keep the most interesting one.

**Blend (Merge):** your examples adapter (stage 3) and your taste adapter (stage 4) were both trained on SmolLM2-360M, so they can be blended.

1. Make three blends: t = 0.25, 0.5, 0.75.
2. Export each.
3. Put them side by side in Chat (up to four columns) and ask one probe. Where does the character of one turn into the other?

**Stack (words on training):** on Modelfile, set *start from* to one of your exported models (trained, preferred or blended), and add your stage 2 instructions on top. Words and training combine.

**Combinations worth trying:**
- your trained model with a preset that fights it (Always French on a tree guide; Haiku only on a commentator);
- the blend at t = 0.5 at temperature 1.3 with open choice;
- someone else's adapter: unzip it on Share, and blend it with yours if it is on the same base;
- a taste trained on the opposite of what you want, blended in at t = 0.25.

**Choose your final model:** the one you would want someone else to hear.

### The deliverable

Hand in three things:

1. **A model card**, filled in from [`model-card-template.md`](model-card-template.md): your concept, the recipe for each stage (copied from the terminal), your five probes answered by every version, the loss readings, and the combination you chose and why.
2. **Your work as zips** from **Share**:
   - your dataset (`zip data/<name>`);
   - your adapters (`zip adapters/<name>`);
   - your final blend, if you made one (`zip merges/<name>`).

   Anyone can unzip them into their own Variable Machine and hear your model. Each zip carries its record of where its data came from and its license.
3. **A one-minute demo:** one question, asked live in Chat, to the original and your final model side by side. Say what you changed and what you hear.

---

## What to look for (for the class discussion, or grading)

- **Each approach was used and compared on the same probes:** words, examples and taste, plus at least one combination.
- **Honest notes:** where a change failed, memorised, or did something unintended. A clear account of a failure is worth as much as a success.
- **Data handled with care:** the source and license of every dataset are on the card, and no private information was used.
- **The final model has a character you can hear,** and the card explains which stage put it there.

## Notes for the teacher

- Stages 3 and 4 need Python (`uv sync --project python` from the README). Check every Mac with `npm run doctor` before class.
- On a 16GB Mac, Chat and training don't run at the same time: training stops the Ollama models to free memory, and Chat loads them again after.
- Exporting a 360M model takes a minute and about 1GB: a full-size copy in `workspace/fused`, plus Ollama's own smaller one. Remove old exports on Adapters between stages if disks are tight.
- The DC street-trees example (*import a public collection → example → dc-street-trees*) lets a student skip straight to stage 3 if stage 1 runs long.
