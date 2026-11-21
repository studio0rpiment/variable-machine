"""Write a fused model's weights into a copy of its base's GGUF, for Ollama.

    uv run --project python --extra sees python python/variable_machine/gguf_export.py \
        --fused workspace/fused/<name> \
        --repo Qwen/Qwen2.5-0.5B-Instruct-GGUF --file qwen2.5-0.5b-instruct-q8_0.gguf \
        --out workspace/fused/<name>/model.gguf

Why: Ollama 0.40's safetensors import takes llama models but refuses qwen2
("unsupported MLX architecture"). A GGUF it takes whatever the architecture.
The base's GGUF comes from its makers (downloaded once into HF_HOME); this
copies it and writes each weight of the fused model over the base's, in the
GGUF's own type (Q8_0 for the weights, F32 for norms and biases). So its
tokenizer and metadata are the base's. qwen2 GGUFs keep q and k as Hugging
Face has them (only llama's are permuted), so nothing is reordered.
"""

import argparse
import shutil
import sys
from pathlib import Path

import mlx.core as mx
import numpy as np
from gguf import GGUFReader
from gguf.quants import quantize
from huggingface_hub import hf_hub_download

LAYER = {
    "input_layernorm.weight": "attn_norm.weight",
    "post_attention_layernorm.weight": "ffn_norm.weight",
    "self_attn.q_proj.weight": "attn_q.weight",
    "self_attn.q_proj.bias": "attn_q.bias",
    "self_attn.k_proj.weight": "attn_k.weight",
    "self_attn.k_proj.bias": "attn_k.bias",
    "self_attn.v_proj.weight": "attn_v.weight",
    "self_attn.v_proj.bias": "attn_v.bias",
    "self_attn.o_proj.weight": "attn_output.weight",
    "mlp.gate_proj.weight": "ffn_gate.weight",
    "mlp.up_proj.weight": "ffn_up.weight",
    "mlp.down_proj.weight": "ffn_down.weight",
}
TOP = {"model.embed_tokens.weight": "token_embd.weight", "model.norm.weight": "output_norm.weight", "lm_head.weight": "output.weight"}


def gguf_name(hf: str) -> str | None:
    if hf in TOP:
        return TOP[hf]
    p = hf.split(".")
    if p[:2] == ["model", "layers"] and ".".join(p[3:]) in LAYER:
        return f"blk.{p[2]}.{LAYER['.'.join(p[3:])]}"
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fused", required=True, help="the fused model's folder (mlx_lm.fuse)")
    ap.add_argument("--repo", required=True, help="the Hugging Face repo of the base's GGUF")
    ap.add_argument("--file", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    weights = {}
    for f in sorted(Path(a.fused).glob("*.safetensors")):
        weights.update(mx.load(str(f)))
    if not weights:
        sys.exit(f"gguf_export: no weights in {a.fused}")

    print(f"the base's GGUF: {a.repo}/{a.file}", flush=True)
    base = hf_hub_download(a.repo, a.file)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(base, out)
    tensors = {t.name: t for t in GGUFReader(str(out)).tensors}

    written, missing = 0, []
    with open(out, "r+b") as f:
        for hf in sorted(weights):
            name = gguf_name(hf)
            if name == "output.weight" and name not in tensors:
                continue  # tied to the embedding in the GGUF
            if name is None or name not in tensors:
                missing.append(hf)
                continue
            t = tensors[name]
            q = quantize(np.array(weights[hf].astype(mx.float32)), t.tensor_type)
            if q.nbytes != t.data.nbytes:
                sys.exit(f"gguf_export: {name} would change size ({q.nbytes} vs {t.data.nbytes} bytes); the GGUF isn't this model's base")
            f.seek(t.data_offset)
            f.write(q.tobytes())
            written += 1
    if missing:
        sys.exit(f"gguf_export: {len(missing)} weights have no place in the GGUF, e.g. {missing[0]}")
    print(f"wrote {written} of the base's {len(tensors)} tensors with the trained weights → {out}", flush=True)


if __name__ == "__main__":
    main()
