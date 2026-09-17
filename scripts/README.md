# scripts

## smoke.cjs

Loads `dashboard.html` under jsdom with a stubbed `fetch` and drives the shared
API layer. It catches the things that break silently in a project with no build
step: a renamed global, a script-order mistake, a double-encoded request body.

```bash
NODE_PATH=../DailyProblemTracker-Service/frontend/node_modules node scripts/smoke.cjs
```

It borrows jsdom from the service's frontend rather than adding a
`package.json` here — this project stays dependency-free and Netlify keeps
publishing `.` unchanged.

Two things it does deliberately:

- **Scripts are injected as real `<script>` elements**, not `window.eval`.
  Indirect eval gets its own variable environment, so a top-level `class` or
  `const` in one call is invisible to the next. That is not how a browser loads
  these files, and testing it that way makes `class ApiError` look broken when
  it is fine.
- **Lexical globals are probed from inside the page** for the same reason.
  `class ApiError` and `const REAUTH_FLAG` are reachable by name from every
  script but are never properties of `window`, so `window.ApiError` is always
  `undefined` and proves nothing.
