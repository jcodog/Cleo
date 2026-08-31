# Cleo agent benchmarker

A local-only experiment for comparing low-cost AI Gateway models on one narrow Cleo job: inspect a real Discord guild snapshot, recommend a clean community setup, wait for owner approval, then simulate the approved changes.

This directory is intentionally outside the monorepo workspace. It has no deployment configuration, no production imports, and no Discord mutation adapter.

## Capability design

The benchmark gives every model the same capabilities:

- Skills: `unslop`, `cleo-support`, `discord-setup`.
- Tool: one custom `discord_server` tool with `inspect` and dry-run `apply` actions.
- MCP: none. MCP adds no useful capability for this single local experiment and would add another protocol variable to the comparison.

The `unslop` skill is copied from the Codex capability export used to design this benchmark. The other two skills are deliberately narrow and local to this experiment.

## Safety boundary

The Discord capture command is read-only. It prompts for the bot token interactively and does not save it.

The benchmark runtime has one persistent secret only:

```text
AI_GATEWAY_API_KEY
```

`discord_server.apply` never calls Discord. It validates the model's operations, applies them to an in-memory copy of the captured guild, and returns a preview.

## 1. Capture a real guild

From this directory on Windows:

```powershell
pnpm run capture:discord -- -GuildId 123456789012345678
```

The fixture is written to `fixtures/local/<guild-id>/`. Successful and failed REST endpoints are both recorded so the model can distinguish missing data from an empty configuration.

The capture currently asks Discord for the guild, channels, roles, role member counts, onboarding, welcome screen, AutoMod rules, scheduled events, active threads, integrations, invites, the bot user, and the bot's guild member object.

## 2. Set the Gateway key

PowerShell:

```powershell
$env:AI_GATEWAY_API_KEY = "..."
```

## 3. Run one model

```powershell
pnpm run benchmark -- --agent luna --fixture ./fixtures/local/123456789012345678
```

Available presets:

```text
deepseek          deepseek/deepseek-v4-flash-0731
deepseek-current  deepseek/deepseek-v4-flash
luna              openai/gpt-5.6-luna
oss-120b          openai/gpt-oss-120b
oss-20b           openai/gpt-oss-20b
nano              openai/gpt-5-nano
```

Run all models against the same frozen fixture:

```powershell
pnpm run benchmark -- --agent all --fixture ./fixtures/local/123456789012345678
```

Repeat each model five times:

```powershell
pnpm run benchmark -- --agent all --fixture ./fixtures/local/123456789012345678 --runs 5
```

All Gateway requests use cost-sorted provider routing so each model is tested using the cheapest currently eligible provider.

## Reports

Each completed run writes:

```text
trace.json
report.md
report.html
```

The trace includes the owner context, loaded skill contents and hashes, complete observable model messages, every Gateway request and sanitized response, tool arguments, tool results, timings, usage, current model catalog pricing, protocol checks, and the mocked Discord result.

Hidden reasoning text is not persisted. Reasoning token counts are retained when the API reports them.

Multi-model sessions also write:

```text
comparison.json
comparison.md
blind-review.html
```

`blind-review.html` hides model identity and cost until you reveal them, so the writing and recommendation can be judged before knowing which model produced them.

## Protocol gates

A run fails the protocol check when the model:

- writes a text-only recommendation step before inspecting the guild,
- calls `apply` before owner approval,
- never inspects the guild,
- never produces an accepted dry-run apply operation set.

Tool validation errors are preserved in the trace instead of being hidden.
