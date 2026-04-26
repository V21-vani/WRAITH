# policy.py
# Uses HuggingFace Inference API to call the trained WRAITH model.

import os
import json
import re
import requests
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

MODELS_TO_TRY = [
    "notshakti/wraith-boss-ai",
    "Qwen/Qwen2.5-1.5B-Instruct",
    "HuggingFaceH4/zephyr-7b-beta",
]


class WraithPolicy:
    def __init__(self, model_name: str = "notshakti/wraith-boss-ai"):
        self.model_name = model_name
        self.hf_token = os.environ.get("HF_TOKEN", "")
        self._loaded = bool(self.hf_token)
        print(f"[WraithPolicy] Ready, token={'yes' if self.hf_token else 'no'}")

    def _call_api(self, model: str, profile_text: str) -> str:
        url = f"https://router.huggingface.co/hf-inference/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self.hf_token}"}
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": profile_text},
            ],
            "max_tokens": 220,
            "temperature": 0.8,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        print(f"[WraithPolicy] {model} → {resp.status_code}")
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def generate(self, profile_text: str, num_samples: int = 1) -> list:
        if not self._loaded:
            return ['{"combo": "PHANTOM_RUSH", "reasoning": "No token."}']

        results = []
        for _ in range(num_samples):
            for model in MODELS_TO_TRY:
                try:
                    text = self._call_api(model, profile_text)
                    print(f"[WraithPolicy] Success via {model}")
                    results.append(text)
                    break
                except Exception as e:
                    print(f"[WraithPolicy] {model} failed: {e}")
            else:
                results.append('{"combo": "PHANTOM_RUSH", "reasoning": "LLM unavailable."}')
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
