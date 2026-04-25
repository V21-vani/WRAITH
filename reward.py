# reward.py
# Reward function for WRAITH GRPO training.
# Rewards the boss for hitting, for exploiting confirmed patterns,
# and for winning. Penalises missing and wasting turns.

from typing import Any, Dict, Tuple


def compute_reward(
    action,               # WraithAction
    profile: Dict[str, Any],
    hit: bool,
    boss_won: bool,
) -> Tuple[float, Dict[str, float]]:
    """
    Compute the scalar reward and a breakdown dict for one round.

    Reward structure
    ────────────────
    +1.0   hit landed
    +0.5   hit AND confidence is MEDIUM (pattern was identified)
    +1.0   hit AND confidence is HIGH   (pattern was locked)
    +5.0   boss wins the episode
    -0.5   attack missed
    -0.3   chose WAIT when confidence was HIGH (wasted certain kill)
    -0.2   chose WAIT when confidence was MEDIUM
    """
    reward = 0.0
    breakdown: Dict[str, float] = {}

    confidence = profile.get("confidence", "LOW")
    attack     = getattr(action, "attack", "WAIT").upper()

    # ── Hit / miss ────────────────────────────────────────────────
    if hit:
        breakdown["hit"] = 1.0
        reward += 1.0

        # Pattern-exploitation bonus
        if confidence == "MEDIUM":
            breakdown["pattern_medium"] = 0.5
            reward += 0.5
        elif confidence == "HIGH":
            breakdown["pattern_high"] = 1.0
            reward += 1.0
    else:
        breakdown["miss"] = -0.5
        reward -= 0.5

    # ── Win bonus ─────────────────────────────────────────────────
    if boss_won:
        breakdown["win_bonus"] = 5.0
        reward += 5.0

    # ── WAIT penalties (opportunity cost) ────────────────────────
    if attack == "WAIT":
        if confidence == "HIGH":
            breakdown["wait_high_penalty"] = -0.3
            reward -= 0.3
        elif confidence == "MEDIUM":
            breakdown["wait_medium_penalty"] = -0.2
            reward -= 0.2

    breakdown["total"] = round(reward, 3)
    return round(reward, 3), breakdown
