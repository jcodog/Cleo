# Discord fixtures

`fixtures/local/` is intentionally ignored. Capture a guild with `pnpm run capture:discord -- -GuildId <id>` and point the benchmark at the generated directory.

Raw Discord responses are retained inside the fixture so every model can be evaluated against exactly the same server state. Do not commit production guild captures unless you have deliberately reviewed their contents.
