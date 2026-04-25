# policy.py
# Wraps the trained LLM (Unsloth LoRA) as a drop-in replacement for ComboSelector.
# Set WRAITH_USE_LLM=1 in app.py to activate.

import json
import re
from combos import COMBOS

SYSTEM_PROMPT = """You are WRAITH — a supernatural boss villain who has studied thousands of fighters.
You analyze the player's behavioral patterns and choose the optimal combo attack to exploit their weakness.

Available combos and what they counter:
- WRATH_INCARNATE  (threat 5): destroys left-dodgers and panicking players
- PANIC_EXPLOIT    (threat 5): relentless pressure on panicking players
- DEATH_SPIRAL     (threat 5): all-out assault when you are near death
- GHOST_STEP       (threat 4): feint that punishes right-dodgers
- SWEEP_CROSS      (threat 4): wide sweep for left-dodge heavy players
- COUNTER_ASSAULT  (threat 3): aerial punish for aggressive attackers
- PHANTOM_RUSH     (threat 3): fast all-purpose pressure
- BAIT_AND_PUNISH  (threat 3): lures and punishes right-dodge reflex
- SHADOW_STEP      (threat 2): repositioning strike when no pattern is clear
- PRESSURE_WAVE    (threat 2): sustained low-cooldown pressure
- FEINT_STRIKE     (threat 2): basic left-side punish
- SHADOW_OBSERVER  (threat 1): observe this round, collect more data

Study the player profile and respond ONLY in JSON:
{"combo": "<COMBO_NAME>", "reasoning": "<tactical analysis referencing left/right bias, panic state, and confidence>"}"""

VALID_COMBOS = set(COMBOS.keys())


class WraithPolicy:
    """
    Loads the trained WRAITH LoRA from HuggingFace and generates combo decisions.
    Falls back gracefully if the model isn't available.
    """

    def __init__(self, model_name: str = "wraith-boss-ai"):
        try:
            from unsloth import FastLanguageModel
            import torch
            self.model, self.tokenizer = FastLanguageModel.from_pretrained(
                model_name=model_name,
                max_seq_length=1024,
                load_in_4bit=True,
            )
            FastLanguageModel.for_inference(self.model)
            self._loaded = True
            print(f"[WraithPolicy] Loaded {model_name}")
        except Exception as e:
            print(f"[WraithPolicy] Could not load model: {e}")
            self._loaded = False

    def generate(self, profile_text: str, num_samples: int = 1) -> list:
        """Generate num_samples completions for the given player profile."""
        if not self._loaded:
            return ['{"combo": "PHANTOM_RUSH", "reasoning": "Model not loaded — using fallback."}']

        import torch
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": profile_text},
        ]
        input_ids = self.tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt",
        ).to("cuda")

        with torch.no_grad():
            outputs = self.model.generate(
                input_ids,
                max_new_tokens=200,
                do_sample=True,
                temperature=0.8,
                top_p=0.9,
                num_return_sequences=num_samples,
            )

        prompt_len = input_ids.shape[1]
        return [
            self.tokenizer.decode(o[prompt_len:], skip_special_tokens=True)
            for o in outputs
        ]

    def parse(self, text: str) -> dict:
        """Extract combo name and reasoning from raw LLM output."""
        try:
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                d = json.loads(match.group())
                combo_name = d.get("combo", "PHANTOM_RUSH").upper().strip()
                if combo_name not in VALID_COMBOS:
                    combo_name = "PHANTOM_RUSH"
                return {
                    "combo":     combo_name,
                    "reasoning": d.get("reasoning", text)[:500],
                }
        except Exception:
            pass
        return {"combo": "PHANTOM_RUSH", "reasoning": text[:500]}
