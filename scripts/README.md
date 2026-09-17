# scripts

## smoke.mjs

```bash
NODE_PATH=../DailyProblemTracker-Service/frontend/node_modules node scripts/smoke.mjs
```

Catches what fails silently in a project with no build: a broken import, a
module that throws at load, a `data-action` in the markup with no handler, a
handler nothing calls, a request body serialised twice.

See [../ARCHITECTURE.md](../ARCHITECTURE.md#tests) for why it loads the graph
through Node's ESM loader instead of letting jsdom do it.
