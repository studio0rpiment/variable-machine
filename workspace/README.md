# workspace

The state of Variable Machine. No database: every model, dataset, run and adapter is a plain folder here with a `manifest.json`, and the app renders from these files. Share an artifact by zipping its folder.

```
hf/<org--name>/manifest.json  a base model that has been trained on (the files are in hf/hub)
raw/<name>/                   raw material: source.*, chunks.jsonl, manifest.json (license as stated)
data/<name>/                  train.jsonl, valid.jsonl, manifest.json (format: chat or preference)
runs/<timestamp>-<name>/      config.yaml, command.txt, log.txt, loss.jsonl, manifest.json
adapters/<name>/              adapters.safetensors, adapter_config.json, manifest.json
fused/<name>/                 fused HF-format model, manifest.json
merges/<name>/                averaged adapter + manifest.json
chat/<date>.jsonl             chat log: prompt, model, answer, timestamp
modelfiles/<name>.Modelfile   what was sent to ollama create
shared/<kind>-<name>.zip      artifacts zipped to share, and zips received
tools/<name>/                 ready-made models (image tools, trackers, SmolVLM's GGUFs) + manifest.json
images/<set>/                 photos + manifest.json (each photo's credit and license)
outputs/<set>-<tool>/         pictures the Look tab made
audio/<set>/                  WAV sounds (spoken, recorded) + their transcripts + manifest.json
gestures/<name>/              examples.jsonl (points, never pictures), model.json, manifest.json
```

Every manifest has `name`, `kind`, `created`, `license`, `inputs` (paths it was made from) and `command` (the command that made it). Follow `inputs` to reconstruct lineage.

There is no gguf/ folder: Ollama 0.40.6 can't load mlx-lm's GGUF export, so models are imported from fused/ directly (see the main README).

Everything here except this README and `examples/` is git-ignored.
