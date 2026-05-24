# ruflo-endomap

Endometriosis symptom assessment with 8-dimension endomap body visualization.

## Overview

Conducts a 32-question endometriosis symptom assessment across 8 dimensions
and renders results on an interactive SVG human body figure. Each body region
represents a symptom dimension; color intensity reflects severity. The artifact
updates in real time as the user moves sliders.

## Installation

```bash
claude --plugin-dir plugins/ruflo-endomap
```

## Agents

| Agent | Model | Role |
|-------|-------|------|
| `endomap-specialist` | sonnet | Deliver symptom assessment, present artifact, interpret results compassionately |

## Skills

| Skill | Usage | Description |
|-------|-------|-------------|
| `endomap-scoring` | `/endomap-scoring` | Generate interactive HTML artifact with 32 sliders and SVG body visualization |

## The Endomap Body Model

| Body Region | Symptom Dimension | Color (Severe) |
|-------------|------------------|----------------|
| Head | Mental & Emotional Wellbeing | Deep teal `#1a6a8a` |
| Shoulders + Upper chest | Shoulder & Chest Pain | Deep violet `#6a1fa8` |
| Upper abdomen | Bloating & Nausea | Forest green `#2d7a2d` |
| Lower abdomen / Pelvis | Pelvic Pain | Deep orange-red `#c94a00` |
| Uterine ellipse (overlay) | Bleeding | Crimson `#a81030` |
| Flanking bowel/bladder zones | Bowel & Bladder Symptoms | Amber-brown `#b35a00` |
| Legs | Back & Leg Pain | Dark blue `#1a5fa8` |
| Full torso (overlay) | Fatigue & Sleep | Dark gold `#8a7a00` |

## Symptom Dimensions

| # | Dimension | Questions |
|---|-----------|----------|
| 1 | Pelvic Pain | Pelvic pain average, dyspareunia, activity interference, ovulation pain |
| 2 | Bowel & Bladder | Dyschezia, dysuria, bowel irregularity, life disruption |
| 3 | Bleeding | Flow intensity, heavy days duration, spotting, clot passage |
| 4 | Bloating & Nausea | Endo belly, nausea, cramping, eating impact |
| 5 | Back & Leg Pain | Lower back, sciatic-type pain, hip stiffness, mobility |
| 6 | Shoulder & Chest | Right shoulder tip, chest tightness, breathing pain, worry |
| 7 | Fatigue & Sleep | Unresting fatigue, insomnia, activity limitation, energy level |
| 8 | Mental & Emotional | Anxiety, depression, brain fog, quality of life impact |

## Medical Disclaimer

This tool is for self-tracking and symptom awareness only. It does not
constitute medical advice, diagnosis, or treatment. All users are advised
to consult a qualified healthcare provider for evaluation and care.

## Namespace Coordination

This plugin owns the `endomap-results` namespace in AgentDB per the
ruflo-agentdb namespace convention. Key format: `endo-{ISO-timestamp}`.
Stores 8 dimension scores, total burden, label, and completion time.

See [ADR-0001](./docs/adrs/0001-endomap-contract.md) for namespace details.

## Compatibility

Pinned to `@claude-flow/cli` v3.6 (major + minor).

## Verification

```bash
bash plugins/ruflo-endomap/scripts/smoke.sh
# Expected: "13 passed, 0 failed"
```

## Architecture Decisions

- [ADR-0001 — endomap plugin contract](./docs/adrs/0001-endomap-contract.md)

## Related Plugins

- `ruflo-goals` — horizon planning; useful for scheduling around symptom cycles
- `ruflo-agentdb` — namespace convention owner; backing store for endomap-results

## License

MIT
