#!/usr/bin/env bash
set -euo pipefail
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0

check() {
  local desc="$1"
  local result
  if eval "$2" &>/dev/null; then
    echo "PASS: $desc"; ((PASS++))
  else
    echo "FAIL: $desc"; ((FAIL++))
  fi
}

check "plugin.json exists"             "[ -f '$PLUGIN_DIR/.claude-plugin/plugin.json' ]"
check "plugin.json has name field"     "grep -q '\"name\"' '$PLUGIN_DIR/.claude-plugin/plugin.json'"
check "plugin.json has version field"  "grep -q '\"version\"' '$PLUGIN_DIR/.claude-plugin/plugin.json'"
check "plugin.json has keywords"       "grep -q 'keywords' '$PLUGIN_DIR/.claude-plugin/plugin.json'"
check "agent file exists"              "[ -f '$PLUGIN_DIR/agents/endomap-specialist.md' ]"
check "agent has model: sonnet"        "grep -q 'model: sonnet' '$PLUGIN_DIR/agents/endomap-specialist.md'"
check "skill SKILL.md exists"          "[ -f '$PLUGIN_DIR/skills/endomap-scoring/SKILL.md' ]"
check "skill has allowed-tools"        "grep -q 'allowed-tools' '$PLUGIN_DIR/skills/endomap-scoring/SKILL.md'"
check "skill has medical disclaimer"   "grep -qi 'medical advice' '$PLUGIN_DIR/skills/endomap-scoring/SKILL.md'"
check "ADR-0001 exists"                "[ -f '$PLUGIN_DIR/docs/adrs/0001-endomap-contract.md' ]"
check "ADR-0001 status Proposed"       "grep -q 'Status: Proposed' '$PLUGIN_DIR/docs/adrs/0001-endomap-contract.md'"
check "README.md exists"               "[ -f '$PLUGIN_DIR/README.md' ]"
check "README has Compatibility"       "grep -q 'Compatibility' '$PLUGIN_DIR/README.md'"

echo ""
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
