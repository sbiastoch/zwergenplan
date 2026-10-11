#!/usr/bin/env bash
# Spike Plan 0032, S1.1: ein Aufruf von `claude -p` nach E2.
#   call.sh <name> <basis> <none|web> <max-turns> [max-output-tokens]
# <basis> wählt .github/spike/<basis>.system.md, .input.txt (stdin) und .schema.json.
# Umgebung: SPIKE_TOKEN (OAuth-Token), SPIKE_MODEL, SPIKE_OUT (Artefaktordner, Standard $RUNNER_TEMP/spike-out).
# Die rohe Antwort landet nur in $SPIKE_OUT (Artefakt). Log und $GITHUB_STEP_SUMMARY bekommen nur Metadaten,
# denn das Repo ist öffentlich. Endet immer mit 0, damit jede Messung entsteht; der Exit-Code der CLI steht im Bericht.
set -uo pipefail

name="$1"
base="$2"
tools="$3"
max_turns="$4"
max_out="${5:-32000}"
spike_dir="$(cd "$(dirname "$0")" && pwd)"
out="${SPIKE_OUT:-${RUNNER_TEMP:?}/spike-out}"
mkdir -p "$out"

case "$tools" in
  none) tool_args=(--tools "") ;;
  # --tools macht die Werkzeuge nur verfügbar; unter dontAsk braucht es zusätzlich --allowedTools (lokal geprüft).
  web) tool_args=(--tools "WebSearch,WebFetch" --allowedTools "WebSearch,WebFetch") ;;
  *) echo "unbekannte Werkzeugwahl: $tools" >&2; exit 2 ;;
esac

# jq-Prüfung der Form von structured_output je Schema (die CLI erzwingt das Schema; hier wird es nachgemessen).
case "$base" in
  extract | truncate)
    check='(.structured_output.events | type == "array") and all(.structured_output.events[];
      (.title | type == "string") and (.start | type == "string")
      and (.ageMin == null or (.ageMin | type == "number")) and (.ageMax == null or (.ageMax | type == "number"))
      and (.price == null or (.price | type == "string"))
      and (.availability | IN("frei", "wenige", "ausgebucht", "unbekannt")))'
    count='.structured_output.events | length'
    schema_base=extract
    ;;
  assess)
    check='(.structured_output.verdict | IN("aufnehmen", "verwerfen")) and (.structured_output.reason | type == "string")
      and (.structured_output.programUrl == null or (.structured_output.programUrl | type == "string"))'
    count='1'
    schema_base=assess
    ;;
  search)
    check='(.structured_output.anbieter | type == "array" and length <= 5) and all(.structured_output.anbieter[];
      (.name | type == "string") and (.url | type == "string") and (.warum | type == "string"))'
    count='.structured_output.anbieter | length'
    schema_base=search
    ;;
  *) echo "unbekannte Basis: $base" >&2; exit 2 ;;
esac

work="$(mktemp -d)"
home="$(mktemp -d)"
cd "$work" || exit 2

start_ms="$(date +%s%3N)"
# --json-schema nimmt den Schema-Text, keinen Dateipfad (CLI 2.1.296: "--json-schema is not valid JSON").
env -i PATH="$PATH" HOME="$home" CLAUDE_CODE_OAUTH_TOKEN="${SPIKE_TOKEN:-}" CLAUDE_CODE_MAX_OUTPUT_TOKENS="$max_out" \
  claude -p \
  --model "$SPIKE_MODEL" \
  --system-prompt-file "$spike_dir/$schema_base.system.md" \
  "${tool_args[@]}" \
  --disallowedTools "mcp__*" \
  --output-format json \
  --json-schema "$(cat "$spike_dir/$schema_base.schema.json")" \
  --max-turns "$max_turns" \
  --no-session-persistence \
  --permission-mode dontAsk \
  < "$spike_dir/$base.input.txt" > "$out/$name.json" 2> "$out/$name.stderr.txt"
code=$?
wall_ms=$(( $(date +%s%3N) - start_ms ))

# Was die CLI im Arbeitsverzeichnis und im leeren HOME anlegt (nur Namen).
{ echo "## work"; ls -A "$work"; echo "## home"; find "$home" -maxdepth 2 | sed "s|^$home|~|"; } > "$out/$name.files.txt"

meta="$(jq -c --arg name "$name" --argjson exit "$code" --argjson wall "$wall_ms" --argjson max_out "$max_out" "
  {
    name: \$name, exit: \$exit, wall_ms: \$wall, max_output_tokens: \$max_out,
    subtype, is_error, terminal_reason, stop_reason, api_error_status, num_turns, duration_ms, duration_api_ms,
    total_cost_usd,
    usage: (.usage | {input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens,
      thinking_tokens: .output_tokens_details.thinking_tokens?, server_tool_use}),
    models: (.modelUsage // {} | keys),
    model_usage_sum: ([.modelUsage // {} | .[]] | {
      inputTokens: (map(.inputTokens) | add), outputTokens: (map(.outputTokens) | add),
      cacheReadInputTokens: (map(.cacheReadInputTokens) | add),
      cacheCreationInputTokens: (map(.cacheCreationInputTokens) | add),
      webSearchRequests: (map(.webSearchRequests) | add), costUSD: (map(.costUSD) | add),
      costBasis: (map(.costBasis) | unique)}),
    permission_denials: [.permission_denials[]?.tool_name],
    structured_output: (.structured_output != null),
    schema_ok: (if .structured_output == null then null else ($check) end),
    items: (if .structured_output == null then null else ($count) end),
    result_len: (.result // \"\" | length),
    errors: .errors,
    # Nur bei is_error: dann ist result eine Meldung der CLI bzw. API, keine Modellantwort.
    error_text: (if .is_error then (.result // \"\" | .[0:200]) else null end),
    abort: (if .is_error | not then null
      elif (.api_error_status == 401 or .api_error_status == 403
        or (.result // \"\" | test(\"authenticat|oauth|bearer|billing\"; \"i\"))) then \"auth\"
      elif (.api_error_status == 429 or (.result // \"\" | test(\"limit\"; \"i\")))
        and (.result // \"\" | test(\"output token maximum\") | not) then \"limit\"
      else null end),
    truncated: (.result // \"\" | test(\"exceeded the [0-9]+ output token maximum\"))
  }" "$out/$name.json" 2>/dev/null)"
if [ -z "$meta" ]; then
  meta="$(jq -cn --arg name "$name" --argjson exit "$code" --argjson wall "$wall_ms" \
    --arg stderr "$(head -c 300 "$out/$name.stderr.txt")" '{name: $name, exit: $exit, wall_ms: $wall, json: false, stderr: $stderr}')"
fi

echo "$meta" | jq .
{
  echo "### $name"
  echo '```json'
  echo "$meta" | jq .
  echo '```'
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit 0
