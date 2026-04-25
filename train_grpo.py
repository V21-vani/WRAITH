# train_grpo.py
# GRPO training for WRAITH boss AI.
#
# Algorithm: Group Relative Policy Optimization (DeepSeek-R1 style)
#   - For each player profile prompt, sample G=8 completions from the LLM
#   - Score each with the WRAITH reward function
#   - Normalize within the group: advantage_i = (r_i - mean) / std
#   - Policy gradient update — no value network needed
#
# Run in Colab with a T4 GPU:
#   pip install unsloth trl>=0.9.0 datasets torch transformers peft bitsandbytes
#   python train_grpo.py
#
# After training:
#   model.push_to_hub("YOUR_USERNAME/wraith-boss-ai")
#   Then set WRAITH_USE_LLM=1 and WRAITH_MODEL=YOUR_USERNAME/wraith-boss-ai in app.py

import json
import random
import re

# ── 1. Load base model with Unsloth ──────────────────────────────────────────

from unsloth import FastLanguageModel
import torch

MODEL_NAME     = "unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit"
MAX_SEQ_LEN    = 1024
NUM_GENERATIONS = 8       # G — completions sampled per prompt
NUM_EPISODES   = 500      # number of synthetic training episodes
EPOCHS         = 3
BATCH_SIZE     = 4
GRAD_ACCUM     = 4
LR             = 2e-5

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=MODEL_NAME,
    max_seq_length=MAX_SEQ_LEN,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0.05,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

# ── 2. Build training prompts from synthetic episodes ────────────────────────

from env import WraithEnvironment
from profiler import PlayerProfiler
from policy import SYSTEM_PROMPT

MOVE_POOL = ["DODGE_LEFT", "DODGE_RIGHT", "ATTACK"]
MOVE_WEIGHTS = {
    "left_heavy":   [0.70, 0.20, 0.10],
    "right_heavy":  [0.20, 0.70, 0.10],
    "aggressive":   [0.20, 0.20, 0.60],
    "mixed":        [0.40, 0.40, 0.20],
    "panic_left":   [0.65, 0.15, 0.20],
}

def synthetic_profile_text(style: str, n_moves: int = 12) -> tuple:
    """Return (profile_text, profile_dict, boss_hp, player_hp) for training."""
    profiler = PlayerProfiler()
    weights  = MOVE_WEIGHTS.get(style, MOVE_WEIGHTS["mixed"])
    hp       = random.uniform(15.0, 100.0)
    boss_hp  = random.uniform(20.0, 100.0)

    for i in range(n_moves):
        move = random.choices(MOVE_POOL, weights=weights)[0]
        # simulate HP dropping (triggers panic detection)
        cur_hp = max(5.0, hp - i * (85.0 / max(n_moves, 1)))
        profiler.update(move, cur_hp)

    return (
        profiler.get_profile_text(),
        profiler.get_profile(),
        boss_hp,
        cur_hp,
    )

print(f"Generating {NUM_EPISODES} training prompts...")
records = []
styles  = list(MOVE_WEIGHTS.keys())
for _ in range(NUM_EPISODES):
    style = random.choice(styles)
    n     = random.randint(4, 18)
    profile_text, profile, boss_hp, player_hp = synthetic_profile_text(style, n)
    records.append({
        "prompt": tokenizer.apply_chat_template(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": profile_text},
            ],
            tokenize=False,
            add_generation_prompt=True,
        ),
        "_profile":    json.dumps(profile),
        "_boss_hp":    boss_hp,
        "_player_hp":  player_hp,
    })

from datasets import Dataset
dataset = Dataset.from_list(records)
print(f"Dataset: {len(dataset)} prompts")

# ── 3. Reward function ────────────────────────────────────────────────────────

from models import WraithAction
from reward import compute_reward
from combos import COMBOS

VALID_COMBOS = set(COMBOS.keys())

def _parse_completion(text: str) -> dict:
    try:
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            d = json.loads(m.group())
            name = d.get("combo", "PHANTOM_RUSH").upper().strip()
            if name not in VALID_COMBOS:
                name = "PHANTOM_RUSH"
            return {"combo": name, "reasoning": d.get("reasoning", text)}
    except Exception:
        pass
    return {"combo": "PHANTOM_RUSH", "reasoning": text}

def reward_fn(completions, prompts=None, **kwargs):
    """
    Called by GRPOTrainer for each batch of completions.
    Returns a list of scalar rewards, one per completion.
    """
    rewards    = []
    batch_meta = kwargs.get("batch", [{}] * len(completions))

    for i, text in enumerate(completions):
        parsed     = _parse_completion(text)
        combo_name = parsed["combo"]
        reasoning  = parsed["reasoning"]

        meta       = batch_meta[i] if i < len(batch_meta) else {}
        profile    = json.loads(meta.get("_profile", "{}"))
        boss_hp    = float(meta.get("_boss_hp",   100.0))
        player_hp  = float(meta.get("_player_hp", 100.0))

        # ── Rebuild a minimal env to get hit/win outcome ──────────
        env = WraithEnvironment()
        env.state_data.boss_hp   = boss_hp
        env.state_data.player_hp = player_hp

        # Seed profiler with the stored bias so simulate_player_move is realistic
        dom = profile.get("dominant_dodge", "MIXED")
        n   = max(profile.get("rounds", 4), 4)
        lb  = profile.get("left_bias",  50) / 100.0
        rb  = profile.get("right_bias", 50) / 100.0
        for _ in range(n):
            roll = random.random()
            if roll < lb:
                env.profiler.update("DODGE_LEFT",  player_hp)
            elif roll < lb + rb:
                env.profiler.update("DODGE_RIGHT", player_hp)
            else:
                env.profiler.update("ATTACK",      player_hp)

        combo  = COMBOS.get(combo_name, COMBOS["PHANTOM_RUSH"])
        action = WraithAction(
            attack=combo_name,
            combo_name=combo_name,
            combo_threat=combo.threat_level,
            reasoning=reasoning,
        )

        obs = env.step(action)
        r, _ = compute_reward(
            action=action,
            profile=profile,
            hit=obs.metadata.get("hit", False),
            boss_won=obs.metadata.get("boss_won", False),
            combo=combo,
        )
        rewards.append(float(r))

    return rewards

# ── 4. GRPOTrainer ────────────────────────────────────────────────────────────

from trl import GRPOConfig, GRPOTrainer

training_args = GRPOConfig(
    output_dir="wraith-grpo-checkpoints",
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRAD_ACCUM,
    num_generations=NUM_GENERATIONS,
    max_new_tokens=220,
    temperature=0.85,
    learning_rate=LR,
    optim="adamw_8bit",
    logging_steps=10,
    save_steps=100,
    report_to="none",
    fp16=not torch.cuda.is_bf16_supported(),
    bf16=torch.cuda.is_bf16_supported(),
)

trainer = GRPOTrainer(
    model=model,
    tokenizer=tokenizer,
    reward_funcs=reward_fn,
    args=training_args,
    train_dataset=dataset,
)

print("Starting GRPO training...")
trainer.train()
print("Training complete.")

# ── 5. Save & push to HuggingFace Hub ────────────────────────────────────────

HF_USERNAME = "YOUR_HF_USERNAME"   # ← replace before running
HF_TOKEN    = "hf_..."             # ← replace before running

model.save_pretrained("wraith-boss-ai-lora")
tokenizer.save_pretrained("wraith-boss-ai-lora")
print("Saved LoRA weights to wraith-boss-ai-lora/")

model.push_to_hub(f"{HF_USERNAME}/wraith-boss-ai", token=HF_TOKEN)
tokenizer.push_to_hub(f"{HF_USERNAME}/wraith-boss-ai", token=HF_TOKEN)
print(f"Pushed to https://huggingface.co/{HF_USERNAME}/wraith-boss-ai")
print("\nTo use in app.py:")
print(f"  WRAITH_USE_LLM=1 WRAITH_MODEL={HF_USERNAME}/wraith-boss-ai python app.py")
