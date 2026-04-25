# combo_selector.py
# Priority-based combo selection with per-combo cooldown tracking.
# select_combo() atomically decrements all cooldowns and resets the chosen one.

from combos import COMBOS, Combo
from typing import Dict, List


class ComboSelector:
    """
    Selects the highest-priority usable combo for the current player profile.

    Cooldown contract
    -----------------
    On every select_combo() call:
      1. All active cooldowns are decremented by 1.
      2. The selected combo's cooldown is set to its base cooldown_rounds value.
    SHADOW_OBSERVER (cooldown_rounds=0) is always available.
    """

    def __init__(self):
        self._cooldowns: Dict[str, int] = {name: 0 for name in COMBOS}

    # ── Public API ────────────────────────────────────────────────────────────

    def select_combo(
        self,
        profile: dict,
        round_number: int,
        boss_hp: float = 100.0,
        player_hp: float = 100.0,
    ) -> Combo:
        """
        Choose the best usable combo given the current fight state.

        Priority (highest → lowest)
        ---------------------------
        1. confidence == LOW          → SHADOW_OBSERVER  (observe, no attack)
        2. boss_hp ≤ 25               → DEATH_SPIRAL     (desperation finisher)
        3. panic + dominant LEFT      → WRATH_INCARNATE  (maximum damage burst)
        4. any panic                  → PANIC_EXPLOIT    (rapid pressure)
        5. dominant RIGHT             → GHOST_STEP       (feint punish)
        6. dominant LEFT              → SWEEP_CROSS      (sweep punish)
        7. attack_rate > 50 %         → COUNTER_ASSAULT  (overhead counter)
        8. fallback                   → PHANTOM_RUSH     (general pressure)
        """
        confidence   = profile.get("confidence", "LOW")
        dominant     = profile.get("dominant_dodge", "MIXED")
        is_panicking = profile.get("is_panicking", False)
        attack_rate  = profile.get("attack_rate", 0)

        if confidence == "LOW":
            chosen = "SHADOW_OBSERVER"

        elif boss_hp <= 25.0 and not self._on_cooldown("DEATH_SPIRAL"):
            chosen = "DEATH_SPIRAL"

        elif is_panicking and dominant == "LEFT" and not self._on_cooldown("WRATH_INCARNATE"):
            chosen = "WRATH_INCARNATE"

        elif is_panicking and not self._on_cooldown("PANIC_EXPLOIT"):
            chosen = "PANIC_EXPLOIT"

        elif dominant == "RIGHT" and not self._on_cooldown("GHOST_STEP"):
            chosen = "GHOST_STEP"

        elif dominant == "LEFT" and not self._on_cooldown("SWEEP_CROSS"):
            chosen = "SWEEP_CROSS"

        elif attack_rate > 50 and not self._on_cooldown("COUNTER_ASSAULT"):
            chosen = "COUNTER_ASSAULT"

        else:
            # PHANTOM_RUSH cooldown is 1 — always available at most 1 round after use
            chosen = "PHANTOM_RUSH" if not self._on_cooldown("PHANTOM_RUSH") else "SHADOW_STEP"

        self._tick(chosen)
        return COMBOS[chosen]

    def available_combos(self) -> List[str]:
        """Return the names of all combos not currently on cooldown."""
        return [name for name, cd in self._cooldowns.items() if cd == 0]

    def cooldown_state(self) -> Dict[str, int]:
        """Return a snapshot of the current cooldown table."""
        return dict(self._cooldowns)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _on_cooldown(self, name: str) -> bool:
        return self._cooldowns.get(name, 0) > 0

    def _tick(self, selected_name: str) -> None:
        """Decrement all active cooldowns by 1, then reset the selected combo's cooldown."""
        for name in self._cooldowns:
            if self._cooldowns[name] > 0:
                self._cooldowns[name] -= 1
        self._cooldowns[selected_name] = COMBOS[selected_name].cooldown_rounds
