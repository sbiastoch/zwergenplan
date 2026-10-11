#!/usr/bin/env node
/**
 * Fake der Claude-CLI für scripts/pipeline/io/llm.test.ts (Plan 0032, E2). Die Umgebung des Aufrufs ist gefiltert,
 * deshalb steuert die erste Zeile von stdin: `FAKE <modus> <protokolldatei>`. Das Protokoll hält Argumente,
 * Arbeitsverzeichnis (samt Inhalt), Umgebung und stdin fest. Modi: ok, 401, 429, nologin, toolong, truncated, broken, exit.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const stdin = readFileSync(0, "utf8");
const [, mode = "ok", record] = stdin.split("\n")[0]?.split(" ") ?? [];
if (record)
  writeFileSync(
    record,
    JSON.stringify({
      args: process.argv.slice(2),
      cwd: process.cwd(),
      cwdFiles: readdirSync("."),
      env: process.env,
      stdin,
    }),
  );

const usage = {
  "claude-haiku-x": {
    inputTokens: 100,
    outputTokens: 20,
    cacheReadInputTokens: 5,
    cacheCreationInputTokens: 7,
    webSearchRequests: 0,
    costUSD: 0.001,
  },
  "claude-sonnet-x": {
    inputTokens: 10,
    outputTokens: 2,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 1,
    costUSD: 0.0005,
  },
};
const base = { type: "result", subtype: "success", num_turns: 2, duration_ms: 1234, modelUsage: usage };
const error = (status, result) => ({ ...base, is_error: true, api_error_status: status, result, total_cost_usd: 0 });

switch (mode) {
  case "ok":
    process.stdout.write(
      `${JSON.stringify({
        ...base,
        is_error: false,
        result: "",
        total_cost_usd: 0.0015,
        structured_output: { events: [] },
        permission_denials: [{ tool_name: "WebSearch" }],
      })}\n`,
    );
    break;
  case "401":
    process.stdout.write(
      `${JSON.stringify(error(401, "Failed to authenticate. API Error: 401 Invalid bearer token"))}\n`,
    );
    break;
  case "429":
    process.stdout.write(`${JSON.stringify(error(429, "API Error: 429 rate_limit_error"))}\n`);
    break;
  case "truncated":
    process.stdout.write(
      `${JSON.stringify(error(null, "API Error: Claude's response exceeded the 32000 output token maximum."))}\n`,
    );
    break;
  case "nologin":
    process.stdout.write(`${JSON.stringify(error(null, "Not logged in · Please run /login"))}\n`);
    break;
  case "toolong":
    process.stdout.write(`${JSON.stringify(error(400, "Prompt is too long: input exceeds the context limit"))}\n`);
    break;
  case "broken":
    process.stdout.write("{ kein JSON\n");
    break;
  default:
    process.stderr.write("unbekannte Option --foo\n");
    process.exit(1);
}
