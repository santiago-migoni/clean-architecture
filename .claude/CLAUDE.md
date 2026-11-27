# Clean Architecture Plugin — repository instructions

This repository is the plugin itself. The rules it teaches live in one place, the `rules` skill, and are imported here so that working on this repository (including `examples/typescript`) follows them too:

@../skills/rules/SKILL.md

## Working on the plugin

- The rule engine is `src/lib/architecture.js`, shared by the MCP server (`src/server.js`) and the hooks (`src/hooks/`). Change the rules there, never in one consumer only. Everything language-specific (file extensions, import syntax, how an import maps to a folder) lives in a profile under `src/lib/languages/`; the rules stay language-neutral.
- Skills are language-neutral: no code block in a `SKILL.md`; the code goes in `skills/<skill>/references/<language>.md` (typescript, python, go; sql where it applies), with concrete names so that `node scripts/check-snippets.mjs` can parse every block. A skill with references links each of them.
- Every language profile is verified against its example in `examples/<language>/` (SQL against the Go example): a real application that must keep passing its own tests, and the checks in `scripts/verify-example.mjs`. The three examples implement the same spec (`examples/README.md`); a change to one is made to all three.
- `src/lib/scan.js` holds the project-wide analyses (scan, metrics, cycles) used by both the MCP server and the `ca-scan` CLI (`src/cli.js`).
- A linter configuration recommended by a skill reference must also live in the matching example and pass `node scripts/check-linters.mjs` in both directions.
- After touching the engine, the hooks or a skill's rules, run `npm run verify:example`: it checks the engine in both directions against `examples/typescript`.
- Bump the version in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json` and the `serverInfo` in `src/server.js` together.
