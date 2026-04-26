# policy.py
# Uses HuggingFace Inference API to call the trained WRAITH model.
# No torch/unsloth needed in the server container — calls HF API remotely.

import os
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
    Calls the trained WRAITH model via HuggingFace Inference API.
    Requires HF_TOKEN env var with read access to the model.
    """

    def __init__(self, model_name: str = "notshakti/wraith-boss-ai"):
        self.model_name = model_name
        self.hf_token = os.environ.get("HF_TOKEN", "")
        try:
            from huggingface_hub import InferenceClient
            self.client = InferenceClient(
                model=self.model_name,
                token=self.hf_token if self.hf_token else None,
            )
            self._loaded = True
            print(f"[WraithPolicy] InferenceClient ready: {model_name}")
        except Exception as e:
            print(f"[WraithPolicy] Could not init InferenceClient: {e}")
            self._loaded = False

    def generate(self, profile_text: str, num_samples: int = 1) -> list:
        if not self._loaded:
            return ['{"combo": "PHANTOM_RUSH", "reasoning": "Model not available — using fallback."}']

        results = []
        for _ in range(num_samples):
            try:
                response = self.client.chat_completion(
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user",   "content": profile_text},
                    ],
                    max_tokens=220,
                    temperature=0.8,
                )
                text = response.choices[0].message.content
                results.append(text)
            except Exception as e:
                print(f"[WraithPolicy] Inference error: {e}")
                results.append('{"combo": "PHANTOM_RUSH", "reasoning": "Inference error — using fallback."}')
        return results

    def parse(self, text: str) -> dict:
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
