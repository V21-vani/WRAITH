# env.py
# The main WRAITH OpenEnv environment
# Extends openenv.Environment — reset(), step(), state property

from typing import Optional

from models import WraithAction, WraithObservation, WraithState
from profiler import PlayerProfiler
from reward import compute_reward

try:
    from openenv import Environment
    _BASE = Environment
except ImportError:
    # local fallback
    class _BASE:
        pass


class WraithEnvironment(_BASE):
    """
    WRAITH — Weakness Recognition and Adaptive Intelligence for Tactical Hunting.

    The LLM plays a boss villain that studies the player's behavioral
    patterns and exploits their specific weaknesses.

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
        **kwargs
    ) -> WraithObservation:
        """Start a fresh episode."""
        self.profiler.reset()
        self.state_data = WraithState()
        self.reward_log = []

        return WraithObservation(
            profile_text=self.profiler.get_profile_text(),
            available_attacks=["SWEEP_LEFT", "FEINT_RIGHT", "OVERHEAD", "WAIT"],
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
        **kwargs
    ) -> WraithObservation:
        """
        Process one round of combat.

        1. Simulate what the player does this round
        2. Check if boss attack hits
        3. Update HP
        4. Compute reward
        5. Return next observation (with done + reward baked in)
        """

        # step 1 — simulate player move
        player_move = self.profiler.simulate_player_move()

        # step 2 — update profiler with player move
        self.profiler.update(player_move, self.state_data.player_hp)

        # step 3 — did the attack hit?
        hit = self._check_hit(action.attack, player_move)

        # step 4 — update HP
        if hit:
            self.state_data.player_hp -= 15.0
        else:
            self.state_data.boss_hp -= 10.0

        self.state_data.player_hp = max(0.0, self.state_data.player_hp)
        self.state_data.boss_hp   = max(0.0, self.state_data.boss_hp)

        # step 5 — check terminal conditions
        self.state_data.round += 1
        boss_won   = self.state_data.player_hp <= 0
        player_won = self.state_data.boss_hp   <= 0
        self.state_data.done = boss_won or player_won or self.state_data.round >= 20

        # step 6 — compute reward
        profile = self.profiler.get_profile()
        reward, breakdown = compute_reward(
            action=action,
            profile=profile,
            hit=hit,
            boss_won=boss_won
        )
        self.reward_log.append(breakdown)
        self.state_data.player_moves.append(player_move)

        # step 7 — build next observation (OpenEnv: reward + done go inside obs)
        return WraithObservation(
            profile_text=self.profiler.get_profile_text(),
            available_attacks=["SWEEP_LEFT", "FEINT_RIGHT", "OVERHEAD", "WAIT"],
            round_number=self.state_data.round,
            boss_hp=self.state_data.boss_hp,
            player_hp=self.state_data.player_hp,
            done=self.state_data.done,
            reward=reward,
            metadata={
                "player_move":      player_move,
                "hit":              hit,
                "boss_won":         boss_won,
                "player_won":       player_won,
                "reward_breakdown": breakdown,
                "round":            self.state_data.round,
                "profile":          profile,
            }
        )

    @property
    def state(self) -> WraithState:
        """Return current environment state (OpenEnv property API)."""
        return self.state_data

    # ── Internal helpers ───────────────────────────────────────────

    def _check_hit(self, attack: str, player_move: str) -> bool:
        """
        Hit detection matrix.
        WRAITH must pick the RIGHT attack for the RIGHT move.
        """
        attack      = attack.upper()
        player_move = player_move.upper()

        hit_matrix = {
            ("SWEEP_LEFT",  "DODGE_LEFT"):  True,
            ("FEINT_RIGHT", "DODGE_RIGHT"): True,
            ("OVERHEAD",    "ATTACK"):      True,
            ("WAIT",        "DODGE_LEFT"):  False,
            ("WAIT",        "DODGE_RIGHT"): False,
            ("WAIT",        "ATTACK"):      False,
        }
        return hit_matrix.get((attack, player_move), False)


if __name__ == "__main__":
    print("=== WRAITH ENVIRONMENT TEST ===\n")

    env = WraithEnvironment()
    obs = env.reset()

    print(f"Initial observation:\n{obs.profile_text}\n")
    print("-" * 50)

    for i in range(5):
        action = WraithAction(
            attack="SWEEP_LEFT",
            reasoning=(
                f"The player shows dominant left dodge bias. "
                f"Round {i+1}: deploying SWEEP_LEFT to exploit "
                f"their predictable left dodge pattern directly."
            )
        )

        obs = env.step(action)

        print(f"Round {i+1}:")
        print(f"  Player did:  {obs.metadata['player_move']}")
        print(f"  Hit landed:  {obs.metadata['hit']}")
        print(f"  Reward:      {obs.reward}")
        print(f"  Boss HP:     {obs.boss_hp}")
        print(f"  Player HP:   {obs.player_hp}")
        print(f"  Done:        {obs.done}")
        print()

        if obs.done:
            break

    print("=== TEST COMPLETE ===")
    print(f"Total rounds played: {env.state.round}")
    print(f"Final Boss HP:       {env.state.boss_hp}")
    print(f"Final Player HP:     {env.state.player_hp}")
