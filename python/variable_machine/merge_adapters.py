"""Linear merge of two LoRA adapters (plan §6, merge).

    change = (1 - t) * change_A + t * change_B      for every layer

Run by the helper as:
    uv run --project python python python/variable_machine/merge_adapters.py \
        --a workspace/adapters/A --b workspace/adapters/B --t 0.5 --out workspace/merges/NAME

Both adapters must come from the same base with the same fine-tune type,
rank, scale and layers, so every layer lines up. They are checked before
anything is written.

How: LoRA stores each layer's change as a product, x @ lora_a @ lora_b.
Averaging lora_a and lora_b separately is not the same as averaging the two
changes: the product picks up cross terms (A's lora_a times B's lora_b),
which neither adapter learned. So the two are stacked side by side instead:

    lora_a = [A.lora_a | B.lora_a]               (rank r + r)
    lora_b = [(1 - t) * A.lora_b ; t * B.lora_b]

and the product is exactly (1 - t) * A's change + t * B's change. The merged
adapter has twice the rank, so it is twice the size, and fuse, export and
everything else take it as they take any adapter. Tensors that aren't LoRA
factors (DoRA's magnitudes, or a full fine-tune's weights) are averaged as
they are; for a full fine-tune that is exact too. SLERP is a later flag.
"""

import argparse
import json
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
    rank = config_a["lora_parameters"]["rank"]
    lora = config_a["fine_tune_type"] in ("lora", "dora")
    merged = {}
    for k in sorted(a):
        if lora and k.endswith(".lora_a"):
            merged[k] = mx.concatenate([a[k], b[k]], axis=-1)
        elif lora and k.endswith(".lora_b"):
            merged[k] = mx.concatenate([(1 - t) * a[k], t * b[k]], axis=-2)
        else:
            merged[k] = (1 - t) * a[k] + t * b[k]

    # Show it is exact on one layer: the stacked product against the weighted sum of the two changes.
    first = next((k for k in sorted(a) if k.endswith(".lora_a")), None)
    if lora and first:
        kb = first[: -len("lora_a")] + "lora_b"
        want = (1 - t) * (a[first] @ a[kb]) + t * (b[first] @ b[kb])
        got = merged[first] @ merged[kb]
        err = mx.max(mx.abs(got - want)).item()
        print(f"check on {first[: -len('.lora_a')]}: stacked product vs (1 - t)·A + t·B, largest difference {err:.2e}")

    args.out.mkdir(parents=True, exist_ok=True)
    mx.save_safetensors(str(args.out / "adapters.safetensors"), merged)
    config = dict(config_a)
    config["adapter_path"] = str(args.out)
    if lora:
        config["lora_parameters"] = {**config_a["lora_parameters"], "rank": 2 * rank}
    config["merge"] = {"a": str(args.a), "b": str(args.b), "t": t, "method": "linear", "how": "stacked to rank 2r" if lora else "averaged"}
    (args.out / "adapter_config.json").write_text(json.dumps(config, indent=4))

    print(f"checked: same base ({config_a['model']}), {config_a['fine_tune_type']}, "
          f"rank {rank}, {config_a['num_layers']} layers, {len(a)} tensors")
    if lora:
        print(f"merged: {1 - t:.2f} x {args.a.name} + {t:.2f} x {args.b.name}, stacked side by side: rank {rank} + {rank} = {2 * rank}")
    else:
        print(f"merged {len(merged)} tensors: {1 - t:.2f} x {args.a.name} + {t:.2f} x {args.b.name}")
    print(f"wrote {args.out}/adapters.safetensors and adapter_config.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
