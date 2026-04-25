# WRAITH: Teaching a Boss AI to Hunt Your Weaknesses with GRPO

*OpenEnv Hackathon India 2026 submission*

---

Most game bosses are liars. They pretend to adapt, but they're just picking from a fixed rotation. WRAITH is different — it actually watches how you play and builds a real behavioral profile that drives every decision it makes.

## The Problem

A good boss fight should feel personal. The boss should notice that you dodge left every time, that you panic under pressure, that you love to spam attacks when you get momentum. And it should punish you for all of it.

We built WRAITH (Weakness Recognition and Adaptive Intelligence for Tactical Hunting) to be exactly that boss.

## How It Works

Every time the player moves, WRAITH's behavioral profiler records it. After a few rounds it knows:

- Your dominant dodge direction (left/right bias as a percentage)
- Whether you're panicking (rapid back-and-forth movement)
- How often you attack vs. dodge
- Your confidence level and how it's changing over time

This profile gets converted to natural language: *"Player dodges left 72% of the time. Showing signs of panic. Confidence: HIGH."*

That text goes directly into a **fine-tuned Qwen2.5-1.5B LLM**. The model reads the profile and responds with a JSON object — which combo to use and why.

```json
{
  "combo": "GHOST_STEP",
  "reasoning": "Player is left-dominant at 72%. GHOST_STEP feints right to bait the predictable left dodge, then punishes the recovery."
}
```

The server translates that into a visual attack pattern and sends it to the Phaser.js game frontend, which animates the boss accordingly.

## The Training Setup

We used **GRPO** (Group Relative Policy Optimization) — the same algorithm behind DeepSeek-R1. It's perfect here because:

1. No value network needed — just a reward signal
2. Samples multiple completions per prompt and learns from which ones scored higher
3. Works well with small models on limited compute

**Base model**: Qwen2.5-1.5B-Instruct (4-bit quantized via Unsloth)  
**LoRA**: r=16, applied to q/k/v/o projections  
**Training data**: 500 synthetic episodes across 5 player archetypes  
**GRPO group size**: G=8 (8 completions per prompt, normalized rewards as advantages)

The reward function rewards tactical reasoning — not just "did the attack land" but "did the model correctly identify the player's weakness and name it in its reasoning?"

## Results

After 750 training steps on a single T4 GPU (free Colab):

| Metric | Start | End | Change |
|---|---|---|---|
| Reward mean | 2.36 | 6.68 | +183% |
| Reward std | 2.24 | 0.33 | −85% |
| KL divergence | ~0 | 0.18+ | Genuinely diverging from base |

The reward standard deviation collapse is the most interesting signal — the model stopped guessing randomly and converged on a consistent exploitation strategy. KL divergence growing confirms it's not just memorizing the base model's priors.

## The OpenEnv Interface

WRAITH is fully OpenEnv-compliant. The environment exposes `reset()`, `step()`, and a `state` property, with reward and done signals baked into every observation.

```python
env = WraithEnvironment()
obs = env.reset()

action = WraithAction(
    combo_name="GHOST_STEP",
    reasoning="Left-dominant player detected — feinting to punish predictable dodge."
)
obs = env.step(action)
print(obs.reward)   # reward for that tactical decision
```

The FastAPI server wraps this into HTTP endpoints so the game frontend can call it in real time.

## What's Next

- More player archetypes in training data (mixed, deceptive, adaptive players)
- Phase 2 boss mechanics — WRAITH spawning minions when HP drops below 30%
- Online fine-tuning — WRAITH keeps learning from real player sessions, not just synthetic ones
- Multiplayer — one WRAITH learning across many simultaneous players

---

The full code, training notebook, and OpenEnv manifest are in the [GitHub repo](https://github.com/V21-vani/WRAITH).

WRAITH doesn't just fight. It learns. It adapts. It hunts.
