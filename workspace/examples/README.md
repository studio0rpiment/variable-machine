# examples

Small datasets written for Variable Machine, released under CC0 (public domain), so anything trained on them keeps a clean license chain.

- `data/curious-guide`: 24 chat rows about art and design in a museum guide's voice (three short sentences, the last a question back). Train it for 100–200 iterations on SmolLM2-360M and chat with the result next to the base.
- `data/concise-mini`: 12 preference pairs, a plain answer chosen over a padded one. A seed for the Prefer panel; build bigger sets from your own chat logs in the Data panel.

- `data/haiku-575`: 44 haiku preference pairs. The chosen haiku keeps 5-7-5 (written by qwen3:4b and checked by a syllable rule); the rejected one is what smollm2:360m wrote. Prefer it with `--sft 1` so the model keeps writing whole haiku (see docs/examples).

- `data/classic-cv-labels`: 16 picture rows for a model that sees: the four classic-cv photos, four questions each, and the same museum wall label for every question about a photo (title and date, material, one sentence of why it matters). The words are CC0; each photo keeps its own license (CC BY 2.0, CC BY-SA 3.0, public domain), listed in the manifest's `photos`. Train SmolVLM-256M on it and ask it about a photo in Chat next to the base.

- `images/classic-cv`: four photos of classic computer-science subjects for the Look tab (the debugging rubber duck, a duck in a glass bowl, the Utah teapot, the Stanford bunny), each with its author and license in the manifest. Copy them in with `look example classic-cv`, or "add the example photos" on the Look tab.

- `gestures/example-hands`: 113 examples of three hand gestures (open hand, fist, thumbs up), recorded with a laptop camera, a few seconds each: points only, no pictures. Copy it in with `gesture example example-hands`, or "start here" on the gesture tab, then train it and test it live with your own hand.

Copy one into your workspace with `data import example <name> <as>`, or from the Data panel.
