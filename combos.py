# combos.py
# 12 WRAITH boss combos. Each combo carries its animation sequence,
# hit-frame indices, per-hit damage, threat rating, and the player patterns it exploits.

from dataclasses import dataclass, field
from typing import List


@dataclass
class Combo:
    name: str
    description: str
    sequence: List[str]         # ordered animation frame names
    hit_frames: List[int]       # 0-indexed frame positions that can deal damage
    damage_per_hit: float       # HP removed per successful hit-frame
    threat_level: int           # 1–5 display rating
    counters: List[str]         # player pattern tags this combo exploits
    cooldown_rounds: int        # rounds before the combo is usable again
    hit_prob_counter: float = 0.78  # P(hit) when the combo counters the player's weakness
    hit_prob_normal: float = 0.32   # P(hit) otherwise

    @property
    def total_max_damage(self) -> float:
        return self.damage_per_hit * len(self.hit_frames)


# ── Registry ──────────────────────────────────────────────────────────────────

COMBOS: dict = {}

def _reg(c: Combo) -> None:
    COMBOS[c.name] = c


# ── 1. WRATH_INCARNATE — panic punisher, left-dodger's nightmare ──────────────

_reg(Combo(
    name="WRATH_INCARNATE",
    description="Full-throttle assault that destroys panicking left-dodgers.",
    sequence=[
        "wraith_run", "wraith_run_alt", "wraith_dash",
        "wraith_attack1", "wraith_attack2", "wraith_attack1",
        "wraith_jump_start", "wraith_jump_loop", "wraith_land",
        "wraith_attack2",
    ],
    hit_frames=[3, 4, 5, 9],
    damage_per_hit=32.5,
    threat_level=5,
    counters=["DODGE_LEFT", "panic"],
    cooldown_rounds=4,
    hit_prob_counter=0.82,
    hit_prob_normal=0.28,
))

# ── 2. PANIC_EXPLOIT — rapid pressure on a distressed player ─────────────────

_reg(Combo(
    name="PANIC_EXPLOIT",
    description="Relentless pressure that punishes a panicking player's erratic dodges.",
    sequence=[
        "wraith_run", "wraith_attack1", "wraith_dash",
        "wraith_attack2", "wraith_attack1", "wraith_attack2",
    ],
    hit_frames=[1, 3, 4, 5],
    damage_per_hit=23.75,
    threat_level=5,
    counters=["panic"],
    cooldown_rounds=3,
    hit_prob_counter=0.80,
    hit_prob_normal=0.30,
))

# ── 3. DEATH_SPIRAL — boss desperation finisher (HP ≤ 25) ────────────────────

_reg(Combo(
    name="DEATH_SPIRAL",
    description="Last-resort all-out assault when WRAITH is near death.",
    sequence=[
        "wraith_run", "wraith_run_alt", "wraith_attack1",
        "wraith_attack2", "wraith_dash", "wraith_attack1",
        "wraith_jump_start", "wraith_land", "wraith_attack2",
    ],
    hit_frames=[2, 3, 5, 8],
    damage_per_hit=22.0,
    threat_level=5,
    counters=["boss_low_hp"],
    cooldown_rounds=5,
    hit_prob_counter=0.78,
    hit_prob_normal=0.55,
))

# ── 4. GHOST_STEP — feint that punishes right-dodgers ────────────────────────

_reg(Combo(
    name="GHOST_STEP",
    description="Deceptive feint sequence that baits and punishes right-dodge habit.",
    sequence=[
        "wraith_walk", "wraith_dash", "wraith_idle",
        "wraith_run_alt", "wraith_attack1", "wraith_attack2",
    ],
    hit_frames=[4, 5],
    damage_per_hit=32.5,
    threat_level=4,
    counters=["DODGE_RIGHT"],
    cooldown_rounds=2,
    hit_prob_counter=0.78,
    hit_prob_normal=0.30,
))

# ── 5. SWEEP_CROSS — aggressive sweep for left-dodgers ───────────────────────

_reg(Combo(
    name="SWEEP_CROSS",
    description="Wide sweep combo designed to catch predictable left-dodge patterns.",
    sequence=[
        "wraith_run", "wraith_attack1", "wraith_attack2",
        "wraith_dash", "wraith_attack1",
    ],
    hit_frames=[1, 2, 4],
    damage_per_hit=20.0,
    threat_level=4,
    counters=["DODGE_LEFT"],
    cooldown_rounds=2,
    hit_prob_counter=0.75,
    hit_prob_normal=0.28,
))

# ── 6. COUNTER_ASSAULT — overhead punish for aggressive players ───────────────

_reg(Combo(
    name="COUNTER_ASSAULT",
    description="Aerial counter that punishes players who over-commit to attacking.",
    sequence=[
        "wraith_idle", "wraith_jump_start", "wraith_jump_loop",
        "wraith_attack1", "wraith_land", "wraith_attack2",
    ],
    hit_frames=[3, 5],
    damage_per_hit=22.5,
    threat_level=3,
    counters=["ATTACK"],
    cooldown_rounds=2,
    hit_prob_counter=0.76,
    hit_prob_normal=0.32,
))

# ── 7. PHANTOM_RUSH — fast all-purpose pressure ───────────────────────────────

_reg(Combo(
    name="PHANTOM_RUSH",
    description="High-speed dash combo with moderate damage; no specific counter needed.",
    sequence=[
        "wraith_run", "wraith_dash", "wraith_attack1",
        "wraith_run_alt", "wraith_attack2",
    ],
    hit_frames=[2, 4],
    damage_per_hit=21.0,
    threat_level=3,
    counters=["MIXED"],
    cooldown_rounds=1,
    hit_prob_counter=0.60,
    hit_prob_normal=0.45,
))

# ── 8. BAIT_AND_PUNISH — alternate right-dodge counter ───────────────────────

_reg(Combo(
    name="BAIT_AND_PUNISH",
    description="Lures the player right then punishes the predictable dodge response.",
    sequence=[
        "wraith_idle", "wraith_walk", "wraith_run_alt",
        "wraith_attack2", "wraith_dash", "wraith_attack1",
    ],
    hit_frames=[3, 5],
    damage_per_hit=19.0,
    threat_level=3,
    counters=["DODGE_RIGHT"],
    cooldown_rounds=2,
    hit_prob_counter=0.72,
    hit_prob_normal=0.28,
))

# ── 9. SHADOW_STEP — mid-threat repositioning strike ─────────────────────────

_reg(Combo(
    name="SHADOW_STEP",
    description="Repositioning strike; used when no dominant pattern is exploitable.",
    sequence=[
        "wraith_walk", "wraith_run", "wraith_attack1",
        "wraith_idle",
    ],
    hit_frames=[2],
    damage_per_hit=28.0,
    threat_level=2,
    counters=[],
    cooldown_rounds=1,
    hit_prob_counter=0.50,
    hit_prob_normal=0.40,
))

# ── 10. PRESSURE_WAVE — sustained low-cooldown pressure ──────────────────────

_reg(Combo(
    name="PRESSURE_WAVE",
    description="Constant pressure to maintain control of fight rhythm.",
    sequence=[
        "wraith_run", "wraith_attack1", "wraith_idle",
        "wraith_attack2",
    ],
    hit_frames=[1, 3],
    damage_per_hit=12.5,
    threat_level=2,
    counters=[],
    cooldown_rounds=1,
    hit_prob_counter=0.55,
    hit_prob_normal=0.42,
))

# ── 11. FEINT_STRIKE — basic left-side punish ────────────────────────────────

_reg(Combo(
    name="FEINT_STRIKE",
    description="Simple feint that punishes basic left dodge attempts.",
    sequence=[
        "wraith_walk", "wraith_attack1", "wraith_attack2",
    ],
    hit_frames=[1, 2],
    damage_per_hit=11.0,
    threat_level=2,
    counters=["DODGE_LEFT"],
    cooldown_rounds=1,
    hit_prob_counter=0.62,
    hit_prob_normal=0.30,
))

# ── 12. SHADOW_OBSERVER — observation stance, no attack ──────────────────────

_reg(Combo(
    name="SHADOW_OBSERVER",
    description="WRAITH observes and collects behavioral data. No attack this round.",
    sequence=[
        "wraith_idle", "wraith_walk", "wraith_idle",
    ],
    hit_frames=[],
    damage_per_hit=0.0,
    threat_level=1,
    counters=[],
    cooldown_rounds=0,
    hit_prob_counter=0.0,
    hit_prob_normal=0.0,
))
