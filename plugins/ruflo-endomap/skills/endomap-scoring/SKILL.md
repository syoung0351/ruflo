---
name: endomap-scoring
description: >
  Generate an interactive endometriosis symptom assessment HTML artifact with
  an 8-dimension SVG body visualization (the endomap model). Always use when
  the endomap-specialist agent needs to present a symptom assessment to a user.
  Also use directly when a user asks to track endo symptoms, log period pain,
  or create an endometriosis body map. Produces a fully self-contained HTML
  artifact with 32 slider questions and a live colored human body figure.
argument-hint: "[optional: user's name or session context]"
allowed-tools: Read Bash
---

# Endomap Scoring Skill — Ruflo Context

Generate the endomap HTML artifact from the embedded specification below. Unlike the canonical skills-repo version, this skill is self-contained and does not reference an external template file.

## The 8 Symptom Dimensions

| # | Dimension | Body Region | Base Color |
|---|-----------|-------------|------------|
| 1 | Pelvic Pain | Lower abdomen / pelvis | rgb(201,74,0) deep orange-red |
| 2 | Bowel & Bladder | Flanking bowel/bladder zones | rgb(179,90,0) amber-brown |
| 3 | Bleeding | Uterine ellipse overlay | rgb(168,16,48) crimson |
| 4 | Bloating & Nausea | Upper abdomen | rgb(45,122,45) forest green |
| 5 | Back & Leg Pain | Legs | rgb(26,95,168) dark blue |
| 6 | Shoulder & Chest Pain | Shoulders + upper chest | rgb(106,31,168) deep violet |
| 7 | Fatigue & Sleep | Full torso overlay (capped alpha) | rgb(138,122,0) dark gold |
| 8 | Mental & Emotional | Head + neck | rgb(26,106,138) deep teal |

## The 32 Questions (4 per dimension, 0–10 slider each)

**Pelvic Pain:** (1) Average pelvic or lower abdominal pain in the past 30 days; (2) Pain during or after sex (dyspareunia); (3) How often pelvic pain interferes with daily activities; (4) Ovulation pain (mid-cycle cramping).

**Bowel & Bladder:** (5) Pain during bowel movements (dyschezia); (6) Urgency, frequency, or pain urinating (dysuria); (7) Diarrhea or constipation especially around period; (8) How much bowel/bladder symptoms disrupt daily life.

**Bleeding:** (9) Menstrual flow intensity (0=very light, 10=flooding); (10) Duration of heavy bleeding days (0=1 day, 10=7+ days); (11) Spotting between periods; (12) Passage of large clots.

**Bloating & Nausea:** (13) Severity of abdominal bloating ("endo belly"); (14) Nausea during or around period; (15) Stomach cramping unrelated to periods; (16) How much bloating/nausea affects eating or comfort.

**Back & Leg Pain:** (17) Lower back or sacral/hip pain; (18) Radiating leg pain, numbness, or tingling (sciatic-type); (19) Hip stiffness or pain with movement; (20) How much back/leg pain limits mobility.

**Shoulder & Chest Pain:** (21) Right shoulder tip pain especially around period; (22) Chest pain or tightness during menstruation; (23) Pain worsening with deep breathing during cycle; (24) How much shoulder/chest pain worries or affects you.

**Fatigue & Sleep:** (25) Overall fatigue not relieved by rest; (26) Difficulty falling or staying asleep; (27) How often fatigue stops you from things you want to do; (28) Energy compared to your normal (0=full energy, 10=no energy).

**Mental & Emotional:** (29) Anxiety related to condition; (30) Low mood or depression; (31) Brain fog or difficulty concentrating; (32) Overall emotional impact on quality of life.

## Scoring Algorithm

- **Per-dimension average**: sum of 4 sliders ÷ 4
- **Color alpha (standard)**: `0.06 + (score/10) * 0.84` — from barely visible tint (score 0) to deep saturation (score 10)
- **Color alpha (fatigue overlay)**: `(score/10) * 0.32` — capped lower since it overlays the whole torso
- **Overall burden**: sum of 8 averages (0–80)

**Severity bands**: 0–1.9 Minimal, 2–3.9 Mild, 4–5.9 Moderate, 6–7.9 Significant, 8–10 Severe

**Overall burden labels**: 0–15 Low, 16–30 Mild-moderate, 31–50 Moderate-significant, 51–65 High, 66–80 Very high

## SVG Body Region IDs

- `region-mental`, `region-mental-neck` — head (mental/emotional)
- `region-shoulder-l`, `region-shoulder-r`, `region-chest` — shoulders + upper chest
- `region-gi` — upper abdomen (bloating)
- `region-pelvic` — lower abdomen/pelvis
- `region-bleeding` — uterine ellipse overlay
- `region-bowel-l`, `region-bowel-r` — flanking bowel/bladder zones
- `region-leg-l`, `region-leg-r` — legs (back & leg pain)
- `region-fatigue` — full torso overlay rect

## HTML Artifact Generation

Generate a single self-contained HTML file with:
- Left sidebar (340px): header, overall score, 8 `<details>` sections each with 4 range sliders (0–10), reset button, medical disclaimer
- Main area: SVG body figure (viewBox 0 0 220 520) with the regions above, below it 8 summary cards in a 2×4 grid
- JavaScript: `oninput` on every slider → recompute 4-slider averages per dimension → update SVG fill colors → update summary cards and overall score
- Fonts: Poppins (body) and Lora (headings/scores) from Google Fonts
- Color scheme: `--anthropic-cream: #f5f4ef`, `--anthropic-orange: #d4653a`, `--anthropic-white: #faf9f6`, `--anthropic-dark: #1a1915`, `--anthropic-mid: #6b6860`, `--anthropic-light: #c8c6bf`

## AgentDB Storage

After the user completes the assessment and shares their scores, store results:
- **Namespace**: `endomap-results`
- **Key**: `endo-{ISO-timestamp}`
- **Value**: `{ dimensions: {pelvic, bowel, bleeding, gi, legs, shoulder, fatigue, mental}, total, burdenLabel, completedAt }`

This enables future sessions to reference past assessments and track changes over time.

## Medical Disclaimer (Required)

Always include in the artifact footer and in any text interpretation:
> This tool is for self-tracking and symptom awareness only. It does not constitute medical advice, diagnosis, or treatment. Please consult a qualified healthcare provider for evaluation and care.
