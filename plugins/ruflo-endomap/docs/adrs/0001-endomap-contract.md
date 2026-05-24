# ADR-0001 — ruflo-endomap Plugin Contract

Status: Proposed
Date: 2026-05-24

## Context

The ruflo-endomap plugin provides endometriosis symptom assessment with an
interactive SVG body visualization (the "endomap" model). It is a pure
artifact-generation plugin: it produces a self-contained HTML file and stores
results in AgentDB. It has no custom MCP tool surface.

## Decisions

**1. Version pinning**
Plugin targets `@claude-flow/cli` v3.6 (major + minor). Patch updates are
non-breaking by convention and do not require a new ADR.

**2. AgentDB namespace**
This plugin owns the `endomap-results` namespace in AgentDB per the
ruflo-agentdb namespace convention. Reserved namespaces (`pattern`,
`claude-memories`, `default`) are not touched. Key format:
`endo-{ISO-8601-timestamp}`. Value schema:
```json
{
  "dimensions": {
    "pelvic": 0.0, "bowel": 0.0, "bleeding": 0.0, "gi": 0.0,
    "legs": 0.0,  "shoulder": 0.0, "fatigue": 0.0, "mental": 0.0
  },
  "total": 0.0,
  "burdenLabel": "Low overall burden",
  "completedAt": "2026-05-24T00:00:00.000Z"
}
```

**3. MCP tool surface**
Zero custom MCP tools. The skill uses only built-in `Read` and `Bash`
(allowed-tools: Read Bash). No MCP-tool drift risk.

**4. Smoke contract**
`scripts/smoke.sh` performs 12 structural checks. CI must pass all 12.
The baseline is monotone-non-decreasing (no regression allowed).

**5. Skill source**
The canonical question bank and SVG specification live in `syoung0351/skills`.
The ruflo plugin skill (`skills/endomap-scoring/SKILL.md`) is a self-contained
deployment wrapper that embeds the specification inline to avoid cross-repo
dependencies. Template updates from the skills repo must be manually synced.

**6. Medical disclaimer**
Every user-facing output from this plugin must include the disclaimer:
"This tool is for self-tracking and symptom awareness only. It does not
constitute medical advice, diagnosis, or treatment. Please consult a qualified
healthcare provider for evaluation and care." This is non-negotiable and is
enforced by the smoke test.

## Consequences

- No MCP-tool drift risk (zero custom tool calls)
- Assessment results persist in AgentDB and can be retrieved by other plugins
  via the `endomap-results` namespace
- Template changes in the skills repo require a manual sync PR
- Non-diagnostic framing is enforced at the skill and agent level
