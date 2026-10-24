"""mlx_vlm.train for SmolVLM, with its attention made causal again.

    uv run --project python --extra sees python python/variable_machine/vlm_train.py <mlx_vlm.train's own flags>

Takes exactly mlx_vlm.train's flags and runs it, with one fix. mlx-vlm 0.7.10's
trainer hands the batch's padding mask (1 for a token, 0 for padding, shape
[batch, length]) to the model, and SmolVLM's language model (idefics3) uses a
mask it is given in place of its causal mask. So in training every token
could see the tokens after it, including the answer it was meant to predict.
Loss fell to 0.001 in 20 steps by copying ahead, and the adapter answered
worse than the base (checked 2026-10-23: the label's loss without the mask,
as generation sees it, was 8.5 against the base's 3.1).

The fix: when the language model is given a padding mask, it uses the causal
mask with the padding taken out, which is what a padding mask means.
Generation never passes one, so it is unchanged.
"""

import sys

import mlx.core as mx
from mlx_vlm.models.idefics3 import language

_call = language.LanguageModel.__call__


def _causal(self, inputs, inputs_embeds=None, mask=None, cache=None, **kwargs):
    if mask is not None and mask.ndim == 2:
        length = mask.shape[1]
        causal = mx.tril(mx.ones((length, length), dtype=mx.bool_))
        mask = causal[None, None] & mask.astype(mx.bool_)[:, None, None, :]
    return _call(self, inputs, inputs_embeds=inputs_embeds, mask=mask, cache=cache, **kwargs)


language.LanguageModel.__call__ = _causal

if __name__ == "__main__":
    from mlx_vlm.train import main

    sys.exit(main())
