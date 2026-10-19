"""Linear merge of two LoRA adapters (plan §6, merge).

    out = (1 - t) * A + t * B      for every tensor

Run by the helper as:
    uv run --project python python python/variable_machine/merge_adapters.py \
        --a workspace/adapters/A --b workspace/adapters/B --t 0.5 --out workspace/merges/NAME

Both adapters must come from the same base with the same fine-tune type,
rank, scale and layers, so every tensor lines up. They are checked before
anything is written.

A note on what this averages: LoRA stores each weight change as a product
lora_b @ lora_a. Averaging the two factors separately is not the same as
averaging the two weight changes; the product picks up cross terms. It
behaves sensibly when both adapters started from the same initialisation
(mlx-lm seeds it, seed 0 by default), the way averaged "model soups" do.
SLERP and other methods are a later flag.
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

import mlx.core as mx

MUST_MATCH = ["model", "fine_tune_type", "num_layers", "lora_parameters"]


def load(folder: Path):
    config = json.loads((folder / "adapter_config.json").read_text())
    weights = mx.load(str(folder / "adapters.safetensors"))
    return config, weights


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--a", required=True, type=Path)
    p.add_argument("--b", required=True, type=Path)
    p.add_argument("--t", required=True, type=float, help="0 = all A, 1 = all B")
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()

    if not 0.0 <= args.t <= 1.0:
        print(f"--t must be between 0 and 1, got {args.t}")
        return 2

    config_a, a = load(args.a)
    config_b, b = load(args.b)

    for key in MUST_MATCH:
        if config_a.get(key) != config_b.get(key):
            print(f"can't merge: {key} differs ({config_a.get(key)} vs {config_b.get(key)})")
            return 1
    if set(a) != set(b):
        print(f"can't merge: the adapters have different tensors ({len(set(a) ^ set(b))} differ)")
        return 1
    for k in a:
        if a[k].shape != b[k].shape:
            print(f"can't merge: {k} is {a[k].shape} in A and {b[k].shape} in B")
            return 1

    t = args.t
    merged = {k: (1 - t) * a[k] + t * b[k] for k in sorted(a)}

    args.out.mkdir(parents=True, exist_ok=True)
    mx.save_safetensors(str(args.out / "adapters.safetensors"), merged)
    config = dict(config_a)
    config["adapter_path"] = str(args.out)
    config["merge"] = {"a": str(args.a), "b": str(args.b), "t": t, "method": "linear"}
    (args.out / "adapter_config.json").write_text(json.dumps(config, indent=4))

    print(f"checked: same base ({config_a['model']}), {config_a['fine_tune_type']}, "
          f"rank {config_a['lora_parameters']['rank']}, {config_a['num_layers']} layers, {len(a)} tensors")
    print(f"merged {len(merged)} tensors: {1 - t:.2f} x {args.a.name} + {t:.2f} x {args.b.name}")
    print(f"wrote {args.out}/adapters.safetensors and adapter_config.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
