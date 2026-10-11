#!/usr/bin/env bash
# Spike Plan 0032, S1.1: Stand des Nutzungsfensters messen.
#   window.sh <label>
# Das Nutzungsfenster meldet die CLI nur im Ereignis rate_limit_event, und das gibt es nur mit
# --output-format stream-json; das verlangt im Druckmodus --verbose (CLI 2.1.296). --verbose ändert hier nur den
# Inhalt von stdout, und stdout geht in eine Datei im Artefakt, nie ins Log. Ins Log und in die Zusammenfassung
# kommen nur Status, Fenster, Auslastung und Reset-Zeit. Endet immer mit 0.
set -uo pipefail

label="$1"
out="${SPIKE_OUT:-${RUNNER_TEMP:?}/spike-out}"
mkdir -p "$out"
work="$(mktemp -d)"
home="$(mktemp -d)"
cd "$work" || exit 2

printf 'Antworte nur mit OK.' | env -i PATH="$PATH" HOME="$home" CLAUDE_CODE_OAUTH_TOKEN="${SPIKE_TOKEN:-}" \
  CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000 \
  claude -p --model "$SPIKE_MODEL" --system-prompt "Antworte knapp." --tools "" --disallowedTools "mcp__*" \
  --output-format stream-json --verbose --max-turns 1 --no-session-persistence --permission-mode dontAsk \
  > "$out/window-$label.jsonl" 2> "$out/window-$label.stderr.txt"
code=$?

auth_method="$(env -i PATH="$PATH" HOME="$home" CLAUDE_CODE_OAUTH_TOKEN="${SPIKE_TOKEN:-}" claude auth status 2>/dev/null \
  | jq -r '.authMethod // "?"' 2>/dev/null)"

meta="$(jq -cs --arg label "$label" --argjson exit "$code" --arg auth "$auth_method" '
  {
    label: $label, exit: $exit, authMethod: $auth,
    rate_limit_events: [.[] | select(.type == "rate_limit_event") | .rate_limit_info
      | {status, rateLimitType, resetsAt, utilization, isUsingOverage, unifiedWindows}],
    cost_usd: ([.[] | select(.type == "result") | .total_cost_usd] | first)
  }' "$out/window-$label.jsonl" 2>/dev/null)"
if [ -z "$meta" ]; then
  meta="$(jq -cn --arg label "$label" --argjson exit "$code" '{label: $label, exit: $exit, json: false}')"
fi

echo "$meta" | jq .
{
  echo "### Nutzungsfenster: $label"
  echo '```json'
  echo "$meta" | jq .
  echo '```'
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit 0
