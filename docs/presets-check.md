# Modelfile presets: what each model actually did

The "follows well" line on each preset card in the Modelfile tab comes from this run. Each preset's instructions, example and temperature were sent to smollm2:360m, llama3.2:3b and qwen3:4b (via Ollama's chat API, which is what a variant does), with the preset's sample question. Run on 2026-10-19 on an M1 Pro, Ollama 0.40.6.

| Preset | smollm2:360m | llama3.2:3b | qwen3:4b |
|---|---|---|---|
| One sentence | one sentence | one sentence | one sentence |
| The long version | long, but skips the background / example / "In short:" structure | follows the structure | follows the structure |
| Haiku only | three lines, no syllable shape | haiku | haiku |
| Only questions | two questions | two questions | two questions |
| Numbered list | numbered list (long points) | numbered list | numbered list |
| Museum label | title + sentences, but nonsense content | museum label | museum label |
| Sports commentator | ignores it | commentator | commentator |
| Say "I don't know" | "I don't know." | "I don't know." | explains that there is no 2031 World Cup instead |
| Always French | French, but it breaks down | French | French (declines to pick a colour) |

What helped small models most: an example exchange (MESSAGE lines). The presets that include one (one sentence, haiku, only questions, museum label) are the ones smollm2:360m follows at least in shape.

## Temperature

With Ollama's default limits on word choice (top_k 40, top_p 0.9), temperature 0.1 and 1.6 gave nearly identical paragraphs on all three models: the limits hide the effect. With every word allowed (top_k 0, top_p 1), on llama3.2:3b and smollm2:360m:

| Temperature | What came out |
|---|---|
| 0.1 | plain, conventional description |
| 1.0 | still conventional |
| 1.3 | surprising: "a phenomenon of haunting elegance, with its uses and limits bound between possibilities"; "Beethoven's sonatas ringing sluggishly across its surface" |
| 1.5 | falls apart: fragments of code, other alphabets |
| 2.0 | nonsense throughout |

So the three adventure presets (careful 0.1, surprising 1.3, falling apart 1.8) switch on "let it pick from any word" (PARAMETER top_k 0 and top_p 1), and the temperature field explains why.

In the app, a llama3.2:3b variant made with the Surprising preset (1.3) started vivid ("a surreal tapestry of soft blues and purples, as if the darkness has catalyzed an innate glow in the water") and drifted into nonsense partway through a long answer: each unlikely word makes the next one stranger. The preset card says so.
