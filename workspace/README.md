# workspace

The state of retension. No database: every model, dataset, run and adapter is a plain folder here with a `manifest.json`, and the app renders from these files. Share an artifact by zipping its folder.

```
hf/<base-id>/                 Hugging Face snapshot + manifest.json (trains on)
data/<name>/                  train.jsonl, valid.jsonl, manifest.json
runs/<timestamp>-<name>/      config.yaml, command.txt, log.txt, loss.jsonl, manifest.json
adapters/<name>/              adapters.safetensors, adapter_config.json, manifest.json
fused/<name>/                 fused HF-format model, manifest.json
gguf/<name>.gguf              fp16 GGUF + <name>.manifest.json
merges/<name>/                averaged adapter + manifest.json
chat/<date>.jsonl             chat log: prompt, model, answer, timestamp
modelfiles/<name>.Modelfile   what was sent to ollama create
```

Every manifest has `name`, `kind`, `created`, `license`, `inputs` (paths it was made from) and `command` (the command that made it). Follow `inputs` to reconstruct lineage.

Everything here except this README and `examples/` is git-ignored.
