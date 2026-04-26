# app.py
# FastAPI server that exposes the WRAITH OpenEnv environment as an API.
# The Phaser.js game calls this in real time.
# Deployable to HuggingFace Spaces via Docker (port 7860).

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

from env import WraithEnvironment
from models import WraithAction
from combo_selector import ComboSelector
from combos import COMBOS

# Maps backend combo names → visual attack patterns game.js understands
COMBO_TO_VISUAL = {
    "WRATH_INCARNATE":  "SWEEP_LEFT",
    "SWEEP_CROSS":      "SWEEP_LEFT",
    "FEINT_STRIKE":     "SWEEP_LEFT",
    "GHOST_STEP":       "FEINT_RIGHT",
    "BAIT_AND_PUNISH":  "FEINT_RIGHT",
    "COUNTER_ASSAULT":  "OVERHEAD",
    "SHADOW_OBSERVER":  "OVERHEAD",
    "PHANTOM_RUSH":     "DASH_STRIKE",
    "SHADOW_STEP":      "DASH_STRIKE",
    "PANIC_EXPLOIT":    "COMBO_2HIT",
    "DEATH_SPIRAL":     "COMBO_2HIT",
    "PRESSURE_WAVE":    "COMBO_2HIT",
}

# ── Optional LLM policy (loaded if WRAITH_USE_LLM=1 is set) ──────────────────
_policy = None
if os.environ.get("WRAITH_USE_LLM") == "1":
    try:
        from policy import WraithPolicy
        _model_name = os.environ.get("WRAITH_MODEL", "wraith-boss-ai")
        _policy = WraithPolicy(model_name=_model_name)
        print(f"[WRAITH] LLM policy loaded: {_model_name}")
    except Exception as e:
        print(f"[WRAITH] LLM load failed, falling back to rule-based: {e}")

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="WRAITH Environment API",
    description=(
        "Boss AI that studies and exploits player behavioral patterns via combo system. "
        "OpenEnv-compliant. Trained with GRPO via Unsloth + HF TRL."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# one global environment + selector per server instance
env      = WraithEnvironment()
selector = ComboSelector()


# ── Request models ────────────────────────────────────────────────────────────

class StepRequest(BaseModel):
    action: dict  # player_moves, round_number, player_hp, boss_hp

class ResetRequest(BaseModel):
    seed: Optional[int] = None
    episode_id: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name":        "WRAITH",
        "description": "Weakness Recognition and Adaptive Intelligence for Tactical Hunting",
        "status":      "online",
        "mode":        "llm" if _policy else "rule-based",
        "endpoints":   ["/reset", "/step", "/state"],
        "openenv":     True,
    }


@app.post("/reset")
def reset(request: ResetRequest = None):
    """Start a new fight episode. OpenEnv reset()."""
    global selector
    selector = ComboSelector()

    seed       = request.seed       if request else None
    episode_id = request.episode_id if request else None

    obs = env.reset(seed=seed, episode_id=episode_id)
    return {
        "observation": {
            "profile_text":      obs.profile_text,
            "available_attacks": obs.available_attacks,
            "available_combos":  obs.available_combos,
            "round_number":      obs.round_number,
            "boss_hp":           obs.boss_hp,
            "player_hp":         obs.player_hp,
            "done":              obs.done,
            "reward":            obs.reward,
        },
        "message": "New episode started. WRAITH is watching.",
    }


@app.post("/step")
def step(request: StepRequest):
    """
    Process one round. OpenEnv step().

    Flow:
      Game sends player_moves →
      Profiler builds behavioral pattern →
      LLM (or rule-based) picks the best combo →
      Probabilistic hit resolution →
      Reward computed →
      Observation returned.
    """
    player_moves = request.action.get("player_moves", [])
    player_hp    = request.action.get("player_hp",    100.0)
    boss_hp      = request.action.get("boss_hp",      100.0)

    # sync environment HP with live game state
    env.state_data.player_hp = player_hp
    env.state_data.boss_hp   = boss_hp

    # feed all moves from this turn into the persistent profiler
    for move in player_moves:
        env.profiler.update(move, player_hp)

    profile      = env.profiler.get_profile()
    profile_text = env.profiler.get_profile_text()

    # ── Pick combo: LLM if available, otherwise rule-based ────────
    if _policy:
        completions = _policy.generate(profile_text, num_samples=1)
        parsed      = _policy.parse(completions[0])
        combo_name  = parsed["combo"]
        reasoning   = parsed["reasoning"]
        combo       = COMBOS.get(combo_name, COMBOS["PHANTOM_RUSH"])
    else:
        combo     = selector.select_combo(
            profile,
            round_number=env.state_data.round,
            boss_hp=boss_hp,
            player_hp=player_hp,
        )
        combo_name = combo.name
        reasoning  = _build_reasoning(combo, profile)

    action = WraithAction(
        attack=combo_name,
        combo_name=combo_name,
        combo_threat=combo.threat_level,
        reasoning=reasoning,
    )

    obs = env.step(action)

    # Translate combo name to visual pattern game.js understands
    visual_attack = COMBO_TO_VISUAL.get(combo_name, "SWEEP_LEFT")

    return {
        "observation": {
            "profile_text":      obs.profile_text,
            "available_attacks": obs.available_attacks,
            "available_combos":  selector.available_combos(),
            "round_number":      obs.round_number,
            "boss_hp":           obs.boss_hp,
            "player_hp":         obs.player_hp,
            "done":              obs.done,
            "reward":            obs.reward,
        },
        "combo":        combo_name,
        "combo_threat": combo.threat_level,
        "sequence":     combo.sequence,
        "attack":       visual_attack,   # game.js reads this to pick visual pattern
        "reasoning":    reasoning,
        "hit":          obs.metadata.get("hit",    False),
        "damage":       obs.metadata.get("damage", 0.0),
        "reward":       obs.reward,
        "done":         obs.done,
        "profile":      profile,
    }


@app.get("/state")
def state():
    """Return current environment state. OpenEnv state property."""
    s = env.state
    return {
        "round":          s.round,
        "boss_hp":        s.boss_hp,
        "player_hp":      s.player_hp,
        "done":           s.done,
        "last_combo":     s.last_combo,
        "cooldown_state": selector.cooldown_state(),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_reasoning(combo, profile: dict) -> str:
    dom    = profile.get("dominant_dodge", "MIXED")
    lb     = profile.get("left_bias",  50)
    rb     = profile.get("right_bias", 50)
    conf   = profile.get("confidence", "LOW")
    panic  = profile.get("is_panicking", False)
    rounds = profile.get("rounds", 0)

    atk_r  = profile.get("attack_rate", 0.0)

    if dom == "DODGE_LEFT" and lb >= 60:
        detail = (
            f"Subject dodges LEFT {lb}% of the time — a deeply ingrained reflex. "
            f"{combo.name} is calibrated to punish exactly this pattern."
        )
    elif dom == "DODGE_RIGHT" and rb >= 60:
        detail = (
            f"Subject favors RIGHT evasion at {rb}% — predictable and exploitable. "
            f"Deploying {combo.name} to feint left and punish the right-dodge reflex."
        )
    elif panic:
        detail = (
            f"Subject is PANICKING — erratic movement across {rounds} inputs. "
            f"Panic exploitation window fully open. {combo.name} maximizes pressure."
        )
    elif atk_r > 0.4:
        detail = (
            f"Subject is attack-heavy ({int(atk_r*100)}% attacks). "
            f"Baiting aggression and countering with {combo.name}."
        )
    else:
        detail = (
            f"Mixed profile over {rounds} moves (left {lb}%, right {rb}%). "
            f"Deploying {combo.name} as a probing attack to force a readable pattern."
        )

    return f"[WRAITH] {detail} Threat {combo.threat_level}/5. Confidence: {conf}."


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
