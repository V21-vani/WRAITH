# profiler.py
# Tracks player behavioral patterns across ALL rounds of a fight.
# Used by WraithEnvironment to pick the attack most likely to hit.

import random
from collections import Counter, deque
from typing import List, Dict, Any

# Move classification — maps raw game moves to combat categories
DODGE_LEFT_MOVES  = {"DODGE_LEFT", "DASH_LEFT", "SPECIAL_DASH_LEFT", "MOVE_LEFT"}
DODGE_RIGHT_MOVES = {"DODGE_RIGHT", "DASH_RIGHT", "SPECIAL_DASH_RIGHT", "MOVE_RIGHT"}
DASH_MOVES        = {"DASH_LEFT", "DASH_RIGHT", "SPECIAL_DASH_LEFT", "SPECIAL_DASH_RIGHT"}
ATTACK_MOVES      = {
    "ATTACK", "HEAVY_ATTACK",
    "JUMP_UP_ATTACK", "JUMP_DOWN_ATTACK",
    "UP_ATTACK", "DASH_ATTACK",
}
NEUTRAL_MOVES     = {"JUMP", "WAIT"}


def _classify(move: str) -> str:
    """Bucket a raw move into DODGE_LEFT / DODGE_RIGHT / ATTACK / NEUTRAL."""
    m = move.upper()
    if m in DODGE_LEFT_MOVES:
        return "DODGE_LEFT"
    if m in DODGE_RIGHT_MOVES:
        return "DODGE_RIGHT"
    if m in ATTACK_MOVES:
        return "ATTACK"
    return "NEUTRAL"


class PlayerProfiler:
    """
    Persistent behavioral profiler.

    Accumulates every move the player makes across the entire fight,
    tracks left/right dodge bias, attack rate, and panic state.
    Exposes get_best_attack() so app.py can pick the optimal counter.
    """

    HISTORY_CAP = 200   # max moves to keep (plenty for one fight)
    RECENT_CAP  = 7     # short window for trend detection

    def __init__(self):
        self._history: deque = deque(maxlen=self.HISTORY_CAP)   # raw moves
        self._classes: deque = deque(maxlen=self.HISTORY_CAP)   # classified
        self._recent:  deque = deque(maxlen=self.RECENT_CAP)    # classified, short window
        self._hp_log:  List[float] = []
        self._counts:  Counter = Counter()   # classified move counts

    # ── Lifecycle ─────────────────────────────────────────────────

    def reset(self):
        self._history.clear()
        self._classes.clear()
        self._recent.clear()
        self._hp_log.clear()
        self._counts.clear()

    # ── Data ingestion ────────────────────────────────────────────

    def update(self, move: str, player_hp: float):
        """Record one player action and current HP."""
        cls = _classify(move)
        self._history.append(move.upper())
        self._classes.append(cls)
        self._recent.append(cls)
        self._hp_log.append(float(player_hp))
        if cls != "NEUTRAL":          # neutrals don't count toward bias
            self._counts[cls] += 1

    # ── Profile computation ───────────────────────────────────────

    def get_profile(self) -> Dict[str, Any]:
        """
        Return a dict with left_bias, right_bias, attack_rate,
        dominant_dodge, is_panicking, rounds, confidence,
        recent_left, recent_right, recent_attack.
        """
        total = len(self._classes)

        if total == 0:
            return {
                "left_bias":     50,
                "right_bias":    50,
                "attack_rate":   0,
                "total_dashes":  0,
                "dominant_dodge": "MIXED",
                "is_panicking":  False,
                "rounds":        0,
                "confidence":    "LOW",
                "recent_left":   0,
                "recent_right":  0,
                "recent_attack": 0,
            }

        # ── cumulative bias ──────────────────────────────────────
        left_n   = self._counts["DODGE_LEFT"]
        right_n  = self._counts["DODGE_RIGHT"]
        attack_n = self._counts["ATTACK"]
        dodge_n  = left_n + right_n
        dash_n   = sum(1 for m in self._history if m in DASH_MOVES)

        if dodge_n > 0:
            left_bias  = round(left_n  / dodge_n * 100)
            right_bias = 100 - left_bias
        else:
            left_bias = right_bias = 50

        attack_rate = round(attack_n / max(total, 1) * 100)

        # ── dominant pattern (cumulative) ───────────────────────
        if left_bias >= 60:
            dominant_dodge = "LEFT"
        elif right_bias >= 60:
            dominant_dodge = "RIGHT"
        else:
            dominant_dodge = "MIXED"

        # ── recent trend (last RECENT_CAP moves) ────────────────
        recent_left   = sum(1 for c in self._recent if c == "DODGE_LEFT")
        recent_right  = sum(1 for c in self._recent if c == "DODGE_RIGHT")
        recent_attack = sum(1 for c in self._recent if c == "ATTACK")

        # ── panic detection: HP dropped ≥ 25 in last 3 readings ─
        is_panicking = False
        if len(self._hp_log) >= 3:
            hp_drop = self._hp_log[-3] - self._hp_log[-1]
            is_panicking = hp_drop >= 25

        # ── confidence: how much data do we have ────────────────
        if total < 4:
            confidence = "LOW"
        elif total < 10:
            confidence = "MEDIUM"
        else:
            confidence = "HIGH"

        return {
            "left_bias":      left_bias,
            "right_bias":     right_bias,
            "attack_rate":    attack_rate,
            "total_dashes":   dash_n,
            "dominant_dodge": dominant_dodge,
            "is_panicking":   is_panicking,
            "rounds":         total,
            "confidence":     confidence,
            "recent_left":    recent_left,
            "recent_right":   recent_right,
            "recent_attack":  recent_attack,
        }

    def get_best_attack(self) -> tuple:
        """
        Choose the attack most likely to hit based on the accumulated profile.
        Returns (attack: str, reasoning: str).

        Logic priority:
          1. Not enough data → WAIT (observe)
          2. Recent trend (last 7) is decisive → exploit it
          3. Cumulative dominant pattern → exploit it
          4. Fallback → OVERHEAD (punishes aggression)
        """
        profile = self.get_profile()

        # ── 1. Not enough data ───────────────────────────────────
        if profile["confidence"] == "LOW":
            return (
                "WAIT",
                f"Only {profile['rounds']} moves recorded. "
                "Insufficient data for pattern lock. Observing..."
            )

        rl = profile["recent_left"]
        rr = profile["recent_right"]
        ra = profile["recent_attack"]

        # ── 2. Recent trend ──────────────────────────────────────
        recent_max = max(rl, rr, ra)
        if recent_max > 0:
            if rl == recent_max and rl > rr and rl > ra:
                attack = "SWEEP_LEFT"
                reasoning = (
                    f"Recent trend: {rl}/{self.RECENT_CAP} moves are left dodges. "
                    f"Cumulative left bias: {profile['left_bias']}%. "
                    "SWEEP_LEFT will intercept this pattern."
                )
            elif rr == recent_max and rr > rl and rr > ra:
                attack = "FEINT_RIGHT"
                reasoning = (
                    f"Recent trend: {rr}/{self.RECENT_CAP} moves are right dodges. "
                    f"Cumulative right bias: {profile['right_bias']}%. "
                    "FEINT_RIGHT exploits this drift."
                )
            elif ra == recent_max and ra > rl and ra > rr:
                attack = "OVERHEAD"
                reasoning = (
                    f"Recent trend: {ra}/{self.RECENT_CAP} moves are attacks. "
                    f"Overall attack rate: {profile['attack_rate']}%. "
                    "OVERHEAD punishes over-aggression."
                )
            else:
                # Tie in recent — fall through to cumulative
                attack = None
                reasoning = None
        else:
            attack = None
            reasoning = None

        # ── 3. Cumulative dominant pattern ───────────────────────
        if attack is None:
            dom = profile["dominant_dodge"]
            if dom == "LEFT":
                attack = "SWEEP_LEFT"
                reasoning = (
                    f"Cumulative left dodge bias: {profile['left_bias']}% "
                    f"over {profile['rounds']} moves. "
                    "Pattern locked — deploying SWEEP_LEFT."
                )
            elif dom == "RIGHT":
                attack = "FEINT_RIGHT"
                reasoning = (
                    f"Cumulative right dodge bias: {profile['right_bias']}% "
                    f"over {profile['rounds']} moves. "
                    "Pattern locked — deploying FEINT_RIGHT."
                )
            else:
                # Mixed dodge pattern — punish aggression
                attack = "OVERHEAD"
                reasoning = (
                    f"No dominant dodge bias detected after {profile['rounds']} moves. "
                    f"Attack rate: {profile['attack_rate']}%. "
                    "Deploying OVERHEAD to punish mixed aggression."
                )

        # ── Panic modifier ───────────────────────────────────────
        if profile["is_panicking"]:
            reasoning += (
                " Subject is in panic state — "
                "erratic behavior confirms pattern exploitation window is open."
            )

        return attack, reasoning

    # ── Training helper ───────────────────────────────────────────

    def simulate_player_move(self) -> str:
        """
        Return a weighted-random move based on historical frequency.
        Used by env.step() during GRPO training to simulate player behavior.
        Normalizes to the three move types the hit matrix understands.
        """
        if not self._counts:
            return random.choice(["DODGE_LEFT", "DODGE_RIGHT", "ATTACK"])

        weights = {
            "DODGE_LEFT":  self._counts["DODGE_LEFT"]  + 1,  # +1 Laplace smoothing
            "DODGE_RIGHT": self._counts["DODGE_RIGHT"] + 1,
            "ATTACK":      self._counts["ATTACK"]      + 1,
        }
        options = list(weights.keys())
        probs   = [weights[k] for k in options]
        return random.choices(options, weights=probs, k=1)[0]

    # ── Natural language summary ──────────────────────────────────

    def get_profile_text(self) -> str:
        p = self.get_profile()
        if p["rounds"] == 0:
            return "No behavioral data collected. WRAITH is observing."
        return (
            f"Rounds observed: {p['rounds']} | "
            f"Left bias: {p['left_bias']}% | Right bias: {p['right_bias']}% | "
            f"Attack rate: {p['attack_rate']}% | "
            f"Dominant: {p['dominant_dodge']} | "
            f"Panic: {'ACTIVE' if p['is_panicking'] else 'STABLE'} | "
            f"Confidence: {p['confidence']}"
        )
