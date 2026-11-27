# Clean Architecture Plugin — repository instructions

This repository is the plugin itself. The rules it teaches live in one place, the `rules` skill, and are imported here so that working on this repository (including `examples/shop`) follows them too:

@../skills/rules/SKILL.md

## Working on the plugin

- The rule engine is `src/lib/architecture.js`, shared by the MCP server (`src/server.js`) and the hooks (`src/hooks/`). Change the rules there, never in one consumer only.
- After touching the engine, the hooks or a skill's rules, run `npm run verify:example`: it checks the engine in both directions against `examples/shop`.
- Bump the version in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json` and the `serverInfo` in `src/server.js` together.
