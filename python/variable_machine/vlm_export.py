"""Write a LoRA adapter trained with mlx-vlm into a copy of the GGUF Ollama runs.

    uv run --project python --extra sees python python/variable_machine/vlm_export.py \
        --model HuggingFaceTB/SmolVLM-256M-Instruct \
        --adapter-path workspace/adapters/<name> \
        --gguf workspace/tools/smolvlm-256m/SmolVLM-256M-Instruct-Q8_0.gguf \
        --out workspace/fused/<name>/model.gguf

Why not the usual route (fuse to safetensors, then `ollama create`): Ollama
0.40.6 refuses a Modelfile that mixes a safetensors folder with the GGUF
projector, and a safetensors import alone comes back without the projector,
so the model can no longer see. The adapter only changes the language half,
so the base projector stays as it is, and the language half is written here.

For each weight the adapter changed: W' = W + scale * (A @ B).T, from the
Hugging Face weights (bf16), then into the GGUF's own layout and type. llama
GGUFs keep q and k with their rows permuted for rotary embeddings (as
llama.cpp's converter writes them), so those get the same permutation. The
file is a copy of the base GGUF with only those tensors' bytes replaced, so
its tokenizer and metadata are the base's. A check on one layer prints how
far the written tensor is from the exact sum (the quantization's rounding).
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

import mlx.core as mx
import numpy as np
from gguf import GGUFReader
from gguf.quants import dequantize, quantize
from huggingface_hub import snapshot_download

# Hugging Face names → GGUF names for the parts of a llama layer LoRA touches.
NAMES = {
    "self_attn.q_proj": "attn_q",
    "self_attn.k_proj": "attn_k",
    "self_attn.v_proj": "attn_v",
    "self_attn.o_proj": "attn_output",
    "mlp.gate_proj": "ffn_gate",
    "mlp.up_proj": "ffn_up",
    "mlp.down_proj": "ffn_down",
}


def permute(w, heads):
    """llama.cpp's q/k permutation: within each head, interleaved halves of the rotary pairs."""
    return w.reshape(heads, 2, w.shape[0] // heads // 2, *w.shape[1:]).swapaxes(1, 2).reshape(w.shape)


def field(reader, key):
    f = reader.fields[key]
    return int(f.parts[f.data[0]][0])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--model", required=True, help="the Hugging Face repo the adapter was trained on")
    ap.add_argument("--adapter-path", required=True)
    ap.add_argument("--gguf", required=True, help="the base model's language-model GGUF (what Ollama runs)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    adapter = Path(a.adapter_path)
    cfg = json.loads((adapter / "adapter_config.json").read_text())
    if cfg.get("fine_tune_type", "lora") != "lora":
        sys.exit(f"vlm_export: only LoRA adapters ({cfg.get('fine_tune_type')} isn't)")
    scale = cfg["lora_parameters"]["scale"]
    lora = mx.load(str(adapter / "adapters.safetensors"))

    # the base weights, from the download training already made (HF_HOME)
    base_dir = Path(snapshot_download(a.model, allow_patterns=["*.safetensors", "*.json"]))
    weights = {}
    for f in sorted(base_dir.glob("*.safetensors")):
        weights.update(mx.load(str(f)))

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"copy {a.gguf} → {out}", flush=True)
    shutil.copyfile(a.gguf, out)
    reader = GGUFReader(str(out))
    heads = {"attn_q": field(reader, "llama.attention.head_count"), "attn_k": field(reader, "llama.attention.head_count_kv")}
    tensors = {t.name: t for t in reader.tensors}

    written = 0
    check = None
    with open(out, "r+b") as f:
        for key in sorted(lora):
            if not key.endswith(".lora_a"):
                continue
            module = key[: -len(".lora_a")]  # language_model.layers.N.self_attn.q_proj
            parts = module.split(".")
            if parts[0] != "language_model" or parts[1] != "layers":
                sys.exit(f"vlm_export: {module} is outside the language half; this export only writes the language model")
            layer, sub = parts[2], ".".join(parts[3:])
            if sub not in NAMES:
                sys.exit(f"vlm_export: don't know where {sub} goes in the GGUF")
            hf = f"model.text_model.layers.{layer}.{sub}.weight"
            w = np.array(weights[hf].astype(mx.float32))
            delta = np.array((scale * (lora[key] @ lora[module + ".lora_b"]).T).astype(mx.float32))
            new = w + delta
            gg = NAMES[sub]
            if gg in heads:
                new = permute(new, heads[gg])
            t = tensors[f"blk.{layer}.{gg}.weight"]
            q = quantize(new, t.tensor_type)
            if q.nbytes != t.data.nbytes:
                sys.exit(f"vlm_export: {t.name} would change size ({q.nbytes} vs {t.data.nbytes} bytes)")
            f.seek(t.data_offset)
            f.write(q.tobytes())
            written += 1
            if check is None:
                back = dequantize(q, t.tensor_type).reshape(new.shape)
                check = (t.name, float(np.abs(delta).max()), float(np.abs(back - new).max()), t.tensor_type.name)
        f.flush()

    print(f"wrote {written} tensors the adapter changed (scale {scale}, rank {cfg['lora_parameters']['rank']}); the rest are the base's", flush=True)
    if check:
        name, change, err = check[0], check[1], check[2]
        print(f"check {name}: the adapter moves it by up to {change:.4f}; written as {check[3]} it is within {err:.4f} of the exact sum, the same rounding the base file has", flush=True)


if __name__ == "__main__":
    main()
