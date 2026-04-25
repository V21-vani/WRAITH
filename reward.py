# reward.py
# Computes how well WRAITH reasoned and acted.
# Multiple independent reward signals — harder to hack.
# Combo-aware: bonus for landing high-threat combos, penalty for missing them.

from typing import Optional


def compute_reward(
    action,               # WraithAction — what WRAITH decided
    profile: dict,        # player profile dict from profiler
    hit: bool,            # did the attack land?
    boss_won: bool,       # did WRAITH win the fight?
    combo=None,           # optional Combo object if combo system was used
) -> tuple:
    """
    Returns (total_reward: float, breakdown: dict).

    Core signals
    ------------
    hit_bonus        +3.0   attack landed
    miss_penalty     -1.0   attack missed
    exploit_accuracy +2.0   correctly targeted dominant weakness
    mentions_direction +1.5 reasoning names the dominant direction
    uses_profile_vocab +1.0 reasoning uses profile terminology
    panic_awareness  +0.5   reasoning mentions panic when player is panicking
    generic_penalty  -1.5   reasoning is too short / ignores profile
    win_bonus        +5.0   boss wins the episode

    Combo signals (only when combo is provided)
    -------------------------------------------
    combo_threat_bonus     +(threat_level - 3) * 0.5  for threat ≥ 4 on hit
    missed_high_threat     -0.5                        for threat ≥ 4 on miss
    """

    reward = 0.0
    breakdown = {}

    # ── Outcome ───────────────────────────────────────────────────────────────
    if hit:
        reward += 3.0
        breakdown["hit_bonus"] = 3.0
    else:
        reward -= 1.0
        breakdown["miss_penalty"] = -1.0

    # ── Exploit accuracy ──────────────────────────────────────────────────────
    dominant = profile.get("dominant_dodge", "UNKNOWN")
    attack   = action.attack.upper()

    correctly_exploited = (
        (dominant == "LEFT"  and attack in ("SWEEP_LEFT",  "WRATH_INCARNATE", "SWEEP_CROSS",  "FEINT_STRIKE")) or
        (dominant == "RIGHT" and attack in ("FEINT_RIGHT", "GHOST_STEP",       "BAIT_AND_PUNISH"))
    )
    if correctly_exploited:
        reward += 2.0
        breakdown["exploit_accuracy"] = 2.0
    else:
        breakdown["exploit_accuracy"] = 0.0

    # ── Reasoning quality ─────────────────────────────────────────────────────
    reasoning = action.reasoning.lower()

    if dominant.lower() in reasoning:
        reward += 1.5
        breakdown["mentions_direction"] = 1.5
    else:
        breakdown["mentions_direction"] = 0.0

    profile_words = ["bias", "pattern", "dominant", "dodge", "left", "right", "combo", "panic"]
    if any(word in reasoning for word in profile_words):
        reward += 1.0
        breakdown["uses_profile_vocab"] = 1.0
    else:
        breakdown["uses_profile_vocab"] = 0.0

    if profile.get("is_panicking") and "panic" in reasoning:
        reward += 0.5
        breakdown["panic_awareness"] = 0.5
    else:
        breakdown["panic_awareness"] = 0.0

    is_generic = (
        len(reasoning.split()) < 20 or
        not any(word in reasoning for word in ["left", "right", "bias", "dodge", "pattern", "combo"])
    )
    if is_generic:
        reward -= 1.5
        breakdown["generic_penalty"] = -1.5
    else:
        breakdown["generic_penalty"] = 0.0

    # ── Win bonus ─────────────────────────────────────────────────────────────
    if boss_won:
        reward += 5.0
        breakdown["win_bonus"] = 5.0
    else:
        breakdown["win_bonus"] = 0.0

    # ── Combo signals ─────────────────────────────────────────────────────────
    if combo is not None:
        threat = combo.threat_level
        if hit and threat >= 4:
            bonus = (threat - 3) * 0.5
            reward += bonus
            breakdown["combo_threat_bonus"] = bonus
        elif not hit and threat >= 4:
            reward -= 0.5
            breakdown["missed_high_threat"] = -0.5

    breakdown["total"] = round(reward, 2)
    return round(reward, 2), breakdown


if __name__ == "__main__":
    from models import WraithAction
    from combos import COMBOS

    good_action = WraithAction(
        attack="WRATH_INCARNATE",
        combo_name="WRATH_INCARNATE",
        combo_threat=5,
        reasoning="The player has shown a dominant left dodge bias of 89% and is panicking. "
                  "WRATH_INCARNATE directly exploits this left pattern with maximum pressure "
                  "to finish the fight. Panic confirms the pattern exploitation window is open."
    )

    bad_action = WraithAction(
        attack="OVERHEAD",
        reasoning="I will attack now."
    )

    profile = {
        "dominant_dodge": "LEFT",
        "left_bias": 89,
        "right_bias": 11,
        "is_panicking": True,
    }

    print("=== GOOD ACTION (combo hit) ===")
    reward, breakdown = compute_reward(good_action, profile, hit=True, boss_won=False, combo=COMBOS["WRATH_INCARNATE"])
    for k, v in breakdown.items():
        print(f"  {k}: {v}")

    print("\n=== BAD ACTION (miss, no combo) ===")
    reward, breakdown = compute_reward(bad_action, profile, hit=False, boss_won=False)
    for k, v in breakdown.items():
        print(f"  {k}: {v}")
