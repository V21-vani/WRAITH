# env.py
# WRAITH OpenEnv environment — with full combo system.
# Extends openenv.Environment: reset(), step(), state property.

import random
from typing import Optional

from models import WraithAction, WraithObservation, WraithState
from profiler import PlayerProfiler
from reward import compute_reward
from combos import COMBOS, Combo

try:
    from openenv import Environment
    _BASE = Environment
except ImportError:
    class _BASE:
        pass


class WraithEnvironment(_BASE):
    """
    WRAITH — Weakness Recognition and Adaptive Intelligence for Tactical Hunting.

    The LLM plays a boss villain that studies the player's behavioral
    patterns and exploits their specific weaknesses through multi-hit combos.

    OpenEnv-compliant: reset(), step(), state property.
    """

    def __init__(self):
        self.profiler   = PlayerProfiler()
        self.state_data = WraithState()
        self.reward_log = []

    # ── OpenEnv API ────────────────────────────────────────────────

    def reset(
        self,
        seed: Optional[int] = None,
        episode_id: Optional[str] = None,
        **kwargs,
    ) -> WraithObservation:
        """Start a fresh episode."""
        self.profiler.reset()
        self.state_data = WraithState()
        self.reward_log = []

        return WraithObservation(
            profile_text=self.profiler.get_profile_text(),
            available_attacks=["SWEEP_LEFT", "FEINT_RIGHT", "OVERHEAD", "WAIT"],
            available_combos=list(COMBOS.keys()),
            round_number=0,
            boss_hp=100.0,
            player_hp=100.0,
            done=False,
            reward=None,
        )

    def step(
        self,
        action: WraithAction,
        timeout_s: Optional[float] = None,
        **kwargs,
    ) -> WraithObservation:
        """
        Process one round of combat.

        1. Simulate what the player does this round (weighted by history)
        2. Update profiler with player move
        3. Hit detection — probabilistic for combos, deterministic for singles
        4. Update HP
        5. Compute reward
        6. Return next observation (done + reward baked in for OpenEnv)
        """

        # 1 — simulate player move
        player_move = self.profiler.simulate_player_move()

        # 2 — update profiler
        self.profiler.update(player_move, self.state_data.player_hp)

        # 3 — hit detection
        combo: Optional[Combo] = None
        if action.combo_name and action.combo_name in COMBOS:
            combo = COMBOS[action.combo_name]
            hit, damage = self._check_hit_combo(combo, player_move)
        else:
            hit    = self._check_hit(action.attack, player_move)
            damage = 15.0 if hit else 0.0

        # 4 — update HP
        if hit:
            self.state_data.player_hp -= damage
        else:
            self.state_data.boss_hp -= 10.0

        self.state_data.player_hp = max(0.0, self.state_data.player_hp)
        self.state_data.boss_hp   = max(0.0, self.state_data.boss_hp)

        # 5 — check terminal conditions
        self.state_data.round += 1
        boss_won   = self.state_data.player_hp <= 0
        player_won = self.state_data.boss_hp   <= 0
        self.state_data.done = boss_won or player_won or self.state_data.round >= 20
        self.state_data.last_combo = action.combo_name

        # 6 — compute reward
        profile = self.profiler.get_profile()
        reward, breakdown = compute_reward(
            action=action,
            profile=profile,
            hit=hit,
            boss_won=boss_won,
            combo=combo,
        )
        self.reward_log.append(breakdown)
        self.state_data.player_moves.append(player_move)

        return WraithObservation(
            profile_text=self.profiler.get_profile_text(),
            available_attacks=["SWEEP_LEFT", "FEINT_RIGHT", "OVERHEAD", "WAIT"],
            available_combos=list(COMBOS.keys()),
            round_number=self.state_data.round,
            boss_hp=self.state_data.boss_hp,
            player_hp=self.state_data.player_hp,
            done=self.state_data.done,
            reward=reward,
            metadata={
                "player_move":      player_move,
                "hit":              hit,
                "damage":           damage,
                "boss_won":         boss_won,
                "player_won":       player_won,
                "combo_name":       action.combo_name,
                "reward_breakdown": breakdown,
                "round":            self.state_data.round,
                "profile":          profile,
            },
        )

    @property
    def state(self) -> WraithState:
        """Return current environment state (OpenEnv property API)."""
        return self.state_data

    # ── Hit detection ──────────────────────────────────────────────

    def _check_hit_combo(self, combo: Combo, player_move: str) -> tuple:
        """
        Probabilistic hit check across all hit_frames of a combo.
        Returns (any_hit: bool, total_damage: float).
        """
        if not combo.hit_frames:
            return False, 0.0

        counters_weakness = (
            player_move in combo.counters or
            "panic" in combo.counters
        )
        hit_prob = combo.hit_prob_counter if counters_weakness else combo.hit_prob_normal

        total_damage = 0.0
        for _ in combo.hit_frames:
            if random.random() < hit_prob:
                total_damage += combo.damage_per_hit

        return total_damage > 0.0, total_damage

    def _check_hit(self, attack: str, player_move: str) -> bool:
        """
        Deterministic hit matrix for single attacks (non-combo path).
        WRAITH must pick the RIGHT attack for the RIGHT player move.
        """
        hit_matrix = {
            ("SWEEP_LEFT",  "DODGE_LEFT"):  True,
            ("FEINT_RIGHT", "DODGE_RIGHT"): True,
            ("OVERHEAD",    "ATTACK"):      True,
        }
        return hit_matrix.get((attack.upper(), player_move.upper()), False)


if __name__ == "__main__":
    from combo_selector import ComboSelector

    print("=== WRAITH ENVIRONMENT TEST ===\n")
    env      = WraithEnvironment()
    selector = ComboSelector()
    obs      = env.reset()

    for i in range(5):
        for _ in range(4):
            env.profiler.update(
                random.choice(["DODGE_LEFT", "DODGE_LEFT", "DODGE_RIGHT"]),
                env.state_data.player_hp,
            )

        profile = env.profiler.get_profile()
        combo   = selector.select_combo(profile, i + 1, env.state_data.boss_hp, env.state_data.player_hp)

        action = WraithAction(
            attack=combo.name,
            combo_name=combo.name,
            combo_threat=combo.threat_level,
            reasoning=(
                f"Deploying {combo.name} (threat {combo.threat_level}/5). "
                f"Player shows {profile.get('dominant_dodge','MIXED')} dominant dodge. "
                f"Confidence: {profile.get('confidence','LOW')}."
            ),
        )

        obs = env.step(action)
        print(
            f"Round {i+1}: combo={combo.name} | hit={obs.metadata['hit']} | "
            f"dmg={obs.metadata['damage']:.1f} | reward={obs.reward} | "
            f"boss_hp={obs.boss_hp:.0f} | player_hp={obs.player_hp:.0f}"
        )
        if obs.done:
            break

    print("\n=== TEST COMPLETE ===")
