"""Preference tuning (DPO) with a LoRA adapter, on top of mlx-lm (plan §6, prefer).

    uv run --project python python python/variable_machine/dpo.py \
        --model HuggingFaceTB/SmolLM2-360M-Instruct \
        --data workspace/data/PREFS \
        --adapter-path workspace/adapters/NAME \
        --run-dir workspace/runs/RUN \
        [--beta 0.1] [--iters 100] [--learning-rate 2e-5] [--rank 8] [--layers 8] [--sft 0]

The data folder holds train.jsonl and valid.jsonl, one pair per line:
    {"prompt": "...", "chosen": "...", "rejected": "..."}

How it works, in the order it happens:
1. Each pair becomes two token sequences (prompt + chosen, prompt + rejected),
   built with the model's own chat template.
2. The reference log-probabilities are computed once, before any LoRA layer
   exists, so no second copy of the model is needed. A fresh LoRA adapter
   starts as an exact no-op (lora_b is zero), so the model at step 0 is the
   reference.
3. LoRA layers are added and only they train, on the DPO loss:
       -log σ(β · [(log π(chosen) − log π(rejected)) − (log ref(chosen) − log ref(rejected))])
   which raises the chosen answer's probability relative to the rejected one,
   measured against where the model started. With --sft w (more than 0), w
   times the chosen answer's average negative log-likelihood per token is
   added, so the model is also pulled toward actually writing the chosen
   answers (DPO plus a likelihood term, as in RPO, Pang et al. 2024).
4. Held-out pairs (valid.jsonl) are scored before and after: does the model
   find the chosen answer more likely than the rejected one? This uses the
   mean log-probability per token, so a short answer doesn't win just for
   being short.

On learning rate: with 30 "be concise" pairs on SmolLM2-360M, 2e-5 shortened
held-out answers from a median of ~800 to ~180 characters; 5e-5 went further
but some answers collapsed to a few words ("To bake bread"). That collapse is
what over-optimising a preference looks like.

The same happened with 37 haiku pairs (chosen: 5-7-5, about 77 characters;
rejected: whatever the base wrote, about 130): every run strong enough to
move the preference also broke the writing into fragments and repeated
words, because "shorter" was the easiest difference to learn. --sft 1 keeps
the chosen answers likely while the preference moves, and fixed it.

The adapter is saved in mlx-lm's format, so mlx_lm.fuse and the rest of the
pipeline treat it like any trained adapter. Progress is printed in the same
table mlx_lm.lora prints, so the app's loss plot reads both.

Why not mlx-tune: it has a DPOTrainer, but it is a Python API rather than a
command, and it brings about 80 more packages (mlx-vlm, mlx-audio, datasets,
pandas, opencv…) onto a student's machine. This file is the whole method.
"""

import argparse
import json
import random
import sys
import time
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
from mlx.utils import tree_flatten
from mlx_lm import load
from mlx_lm.tuner.utils import linear_to_lora_layers


def read_pairs(path: Path):
    pairs = []
    if not path.exists():
        return pairs
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if all(isinstance(row.get(k), str) and row[k].strip() for k in ("prompt", "chosen", "rejected")):
            pairs.append(row)
    return pairs


def encode_pair(tokenizer, pair, max_len):
    """(ids, start) for chosen and rejected: start is where the answer begins."""
    user = [{"role": "user", "content": pair["prompt"]}]
    prompt_text = tokenizer.apply_chat_template(user, add_generation_prompt=True, tokenize=False)
    prompt_ids = tokenizer.encode(prompt_text, add_special_tokens=False)
    out = []
    for key in ("chosen", "rejected"):
        full = tokenizer.apply_chat_template(user + [{"role": "assistant", "content": pair[key]}], tokenize=False)
        ids = tokenizer.encode(full, add_special_tokens=False)[:max_len]
        out.append((ids, min(len(prompt_ids), len(ids) - 1)))
    return out


def answer_logp(model, ids, start):
    """Sum and count of log-probabilities of the answer tokens (everything from `start` on)."""
    x = mx.array(ids)[None]
    logits = model(x[:, :-1]).astype(mx.float32)
    logp = nn.log_softmax(logits, axis=-1)
    targets = x[:, 1:]
    token_logp = mx.take_along_axis(logp, targets[..., None], axis=-1).squeeze(-1)[0]
    mask = mx.arange(token_logp.shape[0]) >= (start - 1)
    return (token_logp * mask).sum(), mask.sum()


def log_sigmoid(z):
    return -mx.logaddexp(mx.array(0.0), -z)


def prefers_chosen(model, encoded):
    """Fraction of pairs where the chosen answer is more likely per token than the rejected one."""
    wins = 0
    for (c_ids, c_start), (r_ids, r_start) in encoded:
        c_sum, c_n = answer_logp(model, c_ids, c_start)
        r_sum, r_n = answer_logp(model, r_ids, r_start)
        wins += int((c_sum / c_n).item() > (r_sum / r_n).item())
    return wins / max(1, len(encoded))


def main() -> int:
    p = argparse.ArgumentParser(description="DPO with a LoRA adapter on mlx-lm")
    p.add_argument("--model", required=True, help="Hugging Face id or a local model folder (e.g. workspace/fused/NAME)")
    p.add_argument("--data", required=True, type=Path)
    p.add_argument("--adapter-path", required=True, type=Path)
    p.add_argument("--run-dir", required=True, type=Path)
    p.add_argument("--beta", type=float, default=0.1)
    p.add_argument("--iters", type=int, default=100)
    p.add_argument("--learning-rate", type=float, default=2e-5)
    p.add_argument("--rank", type=int, default=8)
    p.add_argument("--layers", type=int, default=8)
    p.add_argument("--max-seq-length", type=int, default=1024)
    p.add_argument("--steps-per-report", type=int, default=5)
    p.add_argument("--steps-per-eval", type=int, default=25)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--sft", type=float, default=0.0, help="weight of the chosen answer's likelihood term (0 = plain DPO)")
    args = p.parse_args()

    random.seed(args.seed)
    mx.random.seed(args.seed)

    train_pairs = read_pairs(args.data / "train.jsonl")
    valid_pairs = read_pairs(args.data / "valid.jsonl")
    if len(train_pairs) < 2:
        print(f"need at least 2 preference pairs in {args.data}/train.jsonl, found {len(train_pairs)}")
        return 1
    if not valid_pairs:
        print("no held-out pairs in valid.jsonl: run data split first, so before/after can be measured")
        return 1

    print("Loading pretrained model")
    model, tokenizer = load(args.model)
    model.freeze()

    print(f"Encoding {len(train_pairs)} training pairs and {len(valid_pairs)} held-out pairs")
    train = [encode_pair(tokenizer, x, args.max_seq_length) for x in train_pairs]
    valid = [encode_pair(tokenizer, x, args.max_seq_length) for x in valid_pairs]

    # The reference: the model as it is now, before any LoRA layer.
    def ref_logps(encoded):
        out = []
        for (c_ids, c_start), (r_ids, r_start) in encoded:
            c, _ = answer_logp(model, c_ids, c_start)
            r, _ = answer_logp(model, r_ids, r_start)
            mx.eval(c, r)
            out.append((c.item(), r.item()))
        return out

    ref_train = ref_logps(train)
    ref_valid = ref_logps(valid)
    before = prefers_chosen(model, valid)
    print(f"held-out before: prefers the chosen answer in {round(before * len(valid))}/{len(valid)} pairs ({before:.0%})")

    lora = {"rank": args.rank, "scale": 20.0, "dropout": 0.0}
    linear_to_lora_layers(model, args.layers, lora)
    trainable = sum(v.size for _, v in tree_flatten(model.trainable_parameters()))
    total = sum(v.size for _, v in tree_flatten(model.parameters()))
    print(f"Trainable parameters: {100 * trainable / total:.3f}% ({trainable / 1e6:.3f}M/{total / 1e6:.3f}M)")

    def loss_fn(model, c_ids, c_start, r_ids, r_start, ref_c, ref_r):
        pc, nc = answer_logp(model, c_ids, c_start)
        pr, _ = answer_logp(model, r_ids, r_start)
        margin = args.beta * ((pc - pr) - (ref_c - ref_r))
        loss = -log_sigmoid(margin)
        if args.sft > 0:
            loss = loss + args.sft * (-pc / nc)
        return loss, margin

    loss_and_grad = nn.value_and_grad(model, lambda *a: loss_fn(*a)[0])
    optimizer = optim.Adam(learning_rate=args.learning_rate)

    def held_out_loss():
        total, correct = 0.0, 0
        for ((c_ids, c_start), (r_ids, r_start)), (ref_c, ref_r) in zip(valid, ref_valid):
            loss, margin = loss_fn(model, c_ids, c_start, r_ids, r_start, ref_c, ref_r)
            total += loss.item()
            correct += int(margin.item() > 0)
        return total / len(valid), correct / len(valid)

    args.run_dir.mkdir(parents=True, exist_ok=True)
    print("Training")
    print("  iter   train_loss     tok/s     tokens")
    t0 = time.perf_counter()
    v_loss, _ = held_out_loss()
    print(f"{1:>6}    val {v_loss:.3f}    {time.perf_counter() - t0:.2f}s", flush=True)

    order = []
    tokens = 0
    window_loss, window_tokens, window_start = 0.0, 0, time.perf_counter()
    for it in range(1, args.iters + 1):
        if not order:
            order = list(range(len(train)))
            random.shuffle(order)
        i = order.pop()
        (c_ids, c_start), (r_ids, r_start) = train[i]
        ref_c, ref_r = ref_train[i]
        loss, grads = loss_and_grad(model, c_ids, c_start, r_ids, r_start, ref_c, ref_r)
        optimizer.update(model, grads)
        mx.eval(model.parameters(), optimizer.state, loss)
        n = len(c_ids) + len(r_ids)
        tokens += n
        window_loss += loss.item()
        window_tokens += n
        if it % args.steps_per_report == 0 or it == args.iters:
            seconds = time.perf_counter() - window_start
            steps = args.steps_per_report if it % args.steps_per_report == 0 else it % args.steps_per_report
            print(f"{it:>6}    {window_loss / steps:.3f}    {window_tokens / max(seconds, 1e-6):>6.0f}    {tokens}", flush=True)
            window_loss, window_tokens, window_start = 0.0, 0, time.perf_counter()
        if it % args.steps_per_eval == 0 or it == args.iters:
            t1 = time.perf_counter()
            v_loss, v_acc = held_out_loss()
            print(f"{it:>6}    val {v_loss:.3f}    {time.perf_counter() - t1:.2f}s", flush=True)
            print(f"        held-out reward accuracy {v_acc:.0%}", flush=True)

    _, reward_accuracy = held_out_loss()
    after = prefers_chosen(model, valid)
    print(f"held-out after: prefers the chosen answer in {round(after * len(valid))}/{len(valid)} pairs ({after:.0%})")

    args.adapter_path.mkdir(parents=True, exist_ok=True)
    mx.save_safetensors(str(args.adapter_path / "adapters.safetensors"), dict(tree_flatten(model.trainable_parameters())))
    config = {
        "model": args.model,
        "fine_tune_type": "lora",
        "num_layers": args.layers,
        "lora_parameters": lora,
        "method": "dpo",
        "beta": args.beta,
        "sft": args.sft,
        "iters": args.iters,
        "learning_rate": args.learning_rate,
        "data": str(args.data),
        "seed": args.seed,
    }
    (args.adapter_path / "adapter_config.json").write_text(json.dumps(config, indent=4))
    # before/after: chosen more likely than rejected, per token. rewardAccuracy: DPO's own measure, the share of
    # held-out pairs whose margin moved toward the chosen answer compared with where the model started.
    results = {"heldOut": {"n": len(valid), "before": before, "after": after, "rewardAccuracy": reward_accuracy}, "trainPairs": len(train), "seconds": round(time.perf_counter() - t0)}
    (args.run_dir / "results.json").write_text(json.dumps(results, indent=2))
    print(f"Saved adapter to {args.adapter_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
