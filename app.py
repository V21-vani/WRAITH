# app.py
# FastAPI server that exposes the WRAITH OpenEnv environment as an API
# OpenEnv-compliant: /reset, /step, /state endpoints
# Deployable to HuggingFace Spaces via Docker

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn

from env import WraithEnvironment
from models import WraithAction

# ── App setup ─────────────────────────────────────────────────────

app = FastAPI(
    title="WRAITH Environment API",
    description=(
        "Boss AI that studies and exploits player behavioral patterns. "
        "OpenEnv-compliant environment for LLM training via GRPO/TRL."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# one global environment instance
env = WraithEnvironment()


# ── Request models ────────────────────────────────────────────────

class StepRequest(BaseModel):
    action: dict   # player_moves, round_number, player_hp, boss_hp

class ResetRequest(BaseModel):
    seed: int = None
    episode_id: str = None


# ── Endpoints ─────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name":        "WRAITH",
        "description": "Weakness Recognition and Adaptive Intelligence for Tactical Hunting",
        "status":      "online",
        "endpoints":   ["/reset", "/step", "/state"],
        "openenv":     True,
    }


@app.post("/reset")
def reset(request: ResetRequest = None):
    """Start a new fight episode. OpenEnv reset()."""
    seed       = request.seed       if request else None
    episode_id = request.episode_id if request else None

    obs = env.reset(seed=seed, episode_id=episode_id)

    return {
        "observation": {
            "profile_text":      obs.profile_text,
            "available_attacks": obs.available_attacks,
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

    Game sends player moves → environment builds profile →
    rule-based (or LLM-generated) attack is selected →
    hit/damage resolved → reward computed → observation returned.
    """
    player_moves = request.action.get("player_moves", [])
    player_hp    = request.action.get("player_hp",    100.0)
    boss_hp      = request.action.get("boss_hp",      100.0)

    # sync environment HP with game state
    env.state_data.player_hp = player_hp
    env.state_data.boss_hp   = boss_hp

    # feed ALL moves from this turn into the persistent profiler
    for move in player_moves:
        env.profiler.update(move, player_hp)

    profile = env.profiler.get_profile()

    # pick the attack that counters the player's accumulated pattern
    attack, reasoning = env.profiler.get_best_attack()

    action = WraithAction(attack=attack, reasoning=reasoning)

    # OpenEnv step — returns WraithObservation with reward + done baked in
    obs = env.step(action)

    return {
        "observation": {
            "profile_text": obs.profile_text,
            "round_number": obs.round_number,
            "boss_hp":      obs.boss_hp,
            "player_hp":    obs.player_hp,
            "done":         obs.done,
            "reward":       obs.reward,
        },
        "attack":    attack,
        "reasoning": reasoning,
        "hit":       obs.metadata.get("hit",   False),
        "reward":    obs.reward,
        "done":      obs.done,
        "profile":   profile,
    }


@app.get("/state")
def state():
    """Return current environment state. OpenEnv state property."""
    s = env.state
    return {
        "round":    s.round,
        "boss_hp":  s.boss_hp,
        "player_hp":s.player_hp,
        "done":     s.done,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
