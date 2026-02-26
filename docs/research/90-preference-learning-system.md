# RESEARCH: Preference Learning System for AugmentedMike
**Ticket #90 | Self Improvement | Completed: 2026-02-25**

---

## The Problem

AugmentedMike currently adapts to Mike's preferences via static instructions in SOUL.md and AGENTS.md. These were written once and drift: Mike's actual preferences (tone, verbosity, decision autonomy, when to ask vs. act) are learned through repeated correction, not encoded upfront. The goal is a system that closes this loop — capturing Mike's feedback signals and using them to continuously improve response quality without manual file updates.

---

## Key Concepts

### 1. Reinforcement Learning from Human Feedback (RLHF)
The classical pipeline (InstructGPT, ChatGPT):
1. **SFT** — Supervised fine-tune a base model on demonstration data
2. **Reward Model** — Train a preference model on ranked response pairs
3. **RL Optimization** — Fine-tune via PPO against the reward model with KL-divergence penalty

**Limitation for our case**: Requires GPU training infrastructure. Not practical for a running assistant on a Mac Mini. The reward model also requires paired comparisons, which requires asking Mike "which response was better?" — friction.

---

### 2. Direct Preference Optimization (DPO)
**Paper**: Rafailov et al., 2023 — arXiv:2305.18290 (Stanford, updated July 2024)

DPO eliminates the reward model entirely. It analytically reparameterizes the RLHF objective to optimize the language model directly on preference data with a binary cross-entropy loss.

**The DPO loss:**
```
L_DPO = -log σ(β · log[π_θ(y_w|x)/π_ref(y_w|x)] - β · log[π_θ(y_l|x)/π_ref(y_l|x)])
```

Where:
- `y_w` = the preferred ("chosen") response
- `y_l` = the rejected response  
- `π_θ` = the policy being trained
- `π_ref` = frozen reference model (SFT checkpoint)
- `β` = temperature (0.1–0.5); lower = less constraint to reference

**Data format required:**
```json
{
  "prompt": "context or instruction",
  "chosen": "the better response",
  "rejected": "the worse response"
}
```

**Key insight**: DPO is stable, lightweight, and works with LoRA adapters (4-bit quantization via QLoRA). TRL library has `DPOTrainer` out of the box.

---

### 3. KTO — Kahneman-Tversky Optimization
**Paper**: Ethayarajh et al., 2024 — arXiv:2402.01306 (ICML 2024)

**Critical advantage**: KTO learns from **binary signals** — thumbs up / thumbs down per response. No paired comparisons required.

KTO is grounded in prospect theory: humans are loss-averse, so it maximizes utility (not log-likelihood of preferences). Matches or exceeds DPO performance at 1B–30B scale.

**Data format:**
```json
{
  "prompt": "context",
  "completion": "model response",
  "label": true  // or false
}
```

**Why KTO wins for AugmentedMike**: We can collect `label: true/false` from Mike's Telegram reactions (👍 / 👎), from explicit feedback ("that was wrong"), or from implicit signals (Mike immediately asking a follow-up that implies dissatisfaction). No need to ask "which was better?" — just log whether each response was good or bad.

---

### 4. Iterative / Online DPO
**Paper**: Xiong et al., 2023 — arXiv:2312.11456

**Finding**: Standard offline DPO fails to explore — it only learns from a fixed dataset. Iterative DPO (cycling model → generate → collect feedback → retrain → repeat) significantly outperforms single-pass DPO.

**Practical implication**: Don't aim for a one-shot fine-tune. Build a pipeline that batches feedback every N interactions, runs a lightweight DPO/KTO update, and repeats.

---

## Architecture Proposal: AugmentedMike Preference Learning Loop

### Stage 1: Feedback Collection (Can Build Now, No GPU)

```
Mike sends message
    → AugmentedMike responds
    → [Store: prompt, response, timestamp] in preference_log.jsonl
    → Mike can react:
        👍 = positive signal
        👎 = negative signal
        Explicit correction = negative + gold response captured
```

**Storage schema** (`~/.openclaw/preference_log.jsonl`):
```json
{
  "id": "uuid",
  "timestamp": "2026-02-25T18:00:00Z",
  "session_key": "...",
  "prompt": "full conversation context",
  "completion": "AugmentedMike's response",
  "label": null,           // null = unlabeled, true = good, false = bad
  "correction": null,      // if Mike provided a better response
  "implicit_signals": {
    "follow_up_within_60s": false,  // suggests response needed clarification
    "mike_said_no": false,           // explicit pushback
    "task_completed": true           // downstream signal
  }
}
```

**Collection strategy (no friction)**:
- **Telegram 👍 reactions** → sets `label: true` on last response
- **Telegram 👎 reactions** → sets `label: false`
- **Phrases that indicate failure**: "that's wrong", "no", "try again", "not what I asked" → auto-label false
- **Phrases that indicate success**: "perfect", "ship it", "good", "exactly" → auto-label true
- **Implicit**: if Mike sends a corrective follow-up within 60s, label previous response false

---

### Stage 2: Preference Dataset Assembly (Weekly Cron)

```python
# Assembles labeled pairs for DPO or binary labels for KTO
# Filters by: has label, prompt length > 50 tokens, not duplicates

# For KTO:
kto_dataset = [
    {"prompt": r["prompt"], "completion": r["completion"], "label": r["label"]}
    for r in preference_log if r["label"] is not None
]

# For DPO (requires correction data):
dpo_dataset = [
    {"prompt": r["prompt"], "chosen": r["correction"], "rejected": r["completion"]}
    for r in preference_log if r["correction"] is not None
]
```

---

### Stage 3: Fine-Tuning Pipeline (Requires GPU — Cloud or Mac M-series)

**Model recommendation**: Start with a fine-tuned Llama-3.1-8B-Instruct or Mistral-7B-Instruct as the base SFT model. AugmentedMike's current model is Claude (API-only, no fine-tuning access). 

**Two-path strategy**:

**Path A — Local fine-tuned assistant (parallel model)**
- Train a 7B–8B local model on Mike's preference data using QLoRA + KTO via TRL
- Run on Mac Mini M-series (Apple Silicon MPS backend) or a cheap GPU instance (Vast.ai ~$0.30/hr for RTX 4090)
- Use for lower-stakes tasks; escalate to Claude API for complex reasoning

**Path B — System prompt engineering + memory updates (no GPU)**
- Extract preference patterns from labeled log → distill into SOUL.md updates
- Example: 30 👎 labels on verbose responses → add "Mike rated 30 verbose responses negatively; be more concise" to SOUL.md
- This is a pseudo-RLHF loop using prompt engineering as the optimization surface

**Recommended immediate path: Path B**, with Path A as a Q2 project once dataset reaches ~500 labeled examples.

---

### Stage 4: Q-Network Framing (Action-Value Learning)

**Q-learning analogy** for response selection:
```
State S = conversation context (last N turns)
Action A = response choice (from candidate set)
Reward R = Mike's feedback signal (thumbs up/down, task success)
Q(S, A) = expected cumulative reward of taking action A in state S
```

**Practical implementation as a lightweight ranker**:
```python
# Generate K candidate responses (temp=0.3 to 1.0 sampling)
candidates = [generate(prompt, temp=t) for t in [0.3, 0.6, 0.9]]

# Score each with a learned reward model (or proxy heuristics)
# Initially: use response length, confidence markers, matches Mike's style
scores = reward_model.predict(candidates)

# Select highest-scoring, log it for feedback collection
response = candidates[argmax(scores)]
```

**Bootstrapping without a trained reward model**: Use a simple classifier trained on the labeled preference_log to score new responses before sending. Even 200 labeled examples can train a meaningful length/style scorer.

---

## Implementation Roadmap

### Phase 1 — Logging (Week 1, ~4 hours)
- [ ] Create `preference_log.jsonl` in workspace
- [ ] Hook OpenClaw message lifecycle to append each response
- [ ] Parse Telegram reactions and map to labels
- [ ] Parse implicit negative signals from Mike's follow-up patterns

### Phase 2 — Weekly Distillation Cron (Week 2, ~2 hours)
- [ ] Cron job: reads preference_log, generates SOUL.md update suggestions
- [ ] Auto-update rules: if pattern appears 5+ times with same label → codify it
- [ ] Mike reviews and approves changes (Draft & Approve pattern)

### Phase 3 — Dataset Milestone (~500 examples)
- [ ] Assemble KTO dataset from labeled log
- [ ] Fine-tune a local 7B model on Vast.ai or Mac Mini M-series
- [ ] Eval: compare local model vs. Claude API on Mike's historical prompts

### Phase 4 — Online Iterative Loop
- [ ] Weekly fine-tune cycle: collect → label → train → deploy
- [ ] A/B test: route % of Mike's requests to local model, collect comparative feedback
- [ ] Iterative DPO once we have correction pairs

---

## Key Libraries & Tools

| Tool | Purpose | Status |
|---|---|---|
| `trl` (HuggingFace) | DPOTrainer, KTOTrainer, SFTTrainer | Available, pip install |
| `peft` | LoRA adapters for memory-efficient fine-tuning | Available |
| `bitsandbytes` | 4-bit quantization (QLoRA) | Available (Linux/CUDA) |
| `mlx` / `mlx-lm` | Apple Silicon MPS training (Mac Mini) | Available |
| Vast.ai | Cheap GPU rental ($0.30–$0.80/hr) | No account yet |
| Weights & Biases | Training monitoring | Free tier available |

---

## Practical Quick Wins (No Training Required)

1. **Reaction logging** — Add 👍/👎 Telegram reaction parsing to OpenClaw. Cost: ~1 hour. Immediate data collection starts.

2. **Implicit signal extraction** — Simple keyword classifier on Mike's follow-ups. Cost: ~30 min. No GPU.

3. **Response length calibration** — Mike's 👎 patterns likely correlate with response length. Analyze the first 100 labeled examples and adjust system prompt verbosity rules.

4. **Preference-aware SOUL.md** — Weekly cron that summarizes labeled patterns and drafts SOUL.md additions for Mike's approval. Closes the loop without any ML.

---

## References

- Rafailov, R. et al. (2023). *Direct Preference Optimization: Your Language Model is Secretly a Reward Model.* arXiv:2305.18290. [NeurIPS 2023]
- Ethayarajh, K. et al. (2024). *Model Alignment as Prospect Theoretic Optimization (KTO).* arXiv:2402.01306. [ICML 2024]
- Xiong, W. et al. (2023). *Iterative Preference Learning from Human Feedback.* arXiv:2312.11456.
- Lambert, N. et al. (2022). *Illustrating Reinforcement Learning from Human Feedback.* HuggingFace Blog.
- TRL Library DPO Tutorial: https://huggingface.co/blog/dpo-trl [Fine-tuning Llama 2 with DPO]

---

*Research by AugmentedMike | Self Improvement project | 2026-02-25*
