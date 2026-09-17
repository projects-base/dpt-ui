# Architecture

No build step, no framework, no bundler. Native ES modules, served as-is by
Netlify. Open a file and what you see is what runs.

## The shape

```
index.html      → js/signin.js   entry point for signing in
dashboard.html  → js/main.js     entry point for everything else

js/
  main.js                  composition root — wires intents to features, boots
  signin.js                the sign-in flow (its own page, its own root)

  core/                    knows the browser; knows nothing about this product
    config.js              API base and client id
    log.js                 one console prefix
    dom.js                 element lookup, escaping, formatting
    session.js             the token, the cached user, what to do when it expires
    http.js                apiFetch — the only way to call our backend
    events.js              a tiny pub/sub, used only to break import cycles
    actions.js             one delegated listener for every button

  api/                     one module per backend resource
    knowledge.js

  ui/                      chrome; owns no data
    tabs.js                which panel is visible
    layout.js              sidebar, assistant panel width

  features/                one folder-worth of product per file
    overview.js            profile card, problem list, stats
    tracker.js             the Log Problem form
    portals.js             LeetCode / GitHub cards
    systemDesign.js        topic picker
    settings.js            Drive, Sheets, Gemini key and model
    assistant.js           Gemini chat + autofill
    workspace.js           Drive docs, Sheets embed
    knowledge/
      map.js               the vis-network canvas and its DataSets
      categories.js        the category pills
      panel.js             the node side panel and pop-out
```

Dependencies point one way: `features → api → core`, and `features → ui → core`.
Nothing in `core/` imports a feature. If you find yourself wanting it to, that
is the signal to publish an event instead.

## Where do I put a new thing?

| It is… | It goes in | It may import |
|---|---|---|
| a browser utility with no product knowledge | `core/` | other `core/` |
| a wrapper for a backend resource | `api/` | `core/http` |
| chrome — tabs, panels, layout | `ui/` | `core/` |
| a thing the user does | `features/` | `core/`, `api/`, `ui/` |
| wiring between them | `main.js` | anything |

## How a click reaches code

Markup declares an **intent**, never a function name:

```html
<button data-action="tab:switch" data-tab="overview">Overview</button>
```

`main.js` says what that intent means:

```js
register({ 'tab:switch': (el) => switchTab(el.dataset.tab) });
```

`core/actions.js` listens once, on `document`, and dispatches. So:

- markup and modules never reference each other by name
- content rendered later (the problem list, Drive files) works with no rebinding
- adding an action adds a key; the dispatcher never changes
- `scripts/smoke.mjs` can check every declared intent has a handler, and that
  no handler is dead

There used to be ~50 inline `onclick="doThing()"` attributes. Those require the
handler to be a global, which rules out modules entirely — that single
constraint is why the app could not be split up before.

## SOLID, concretely

Principles are cheap to claim, so here is where each one actually changed a
decision in this codebase.

**Single responsibility.** Every module states its one job in its header. The
test is whether you can name one reason it would change. `knowledge/` is three
files rather than one because a category pill row (a form) and a vis-network
canvas change for different reasons.

**Open/closed.** `core/actions.js` never needs editing to support a new button.
Same for `ui/tabs.js`: it announces `TAB_CHANGED` instead of importing each
feature that fills a panel, so adding a tab does not touch it.

**Liskov.** Barely applies without inheritance, and there is none here. Where it
shows up is that every action handler has the same shape `(element, event)`, so
the dispatcher never special-cases one.

**Interface segregation.** `features/portals.js` needs to add one node to the
graph. It used to import the `nodes` and `edges` DataSets and mutate them, which
meant knowing the vis-network node shape and remembering the pillar edge. It now
calls `addNodeToRenderedGraph(node)` — the narrow thing it needed instead of the
wide thing it had.

**Dependency inversion.** Features depend on `core/http`, never on `fetch`, so
the base URL, the bearer token, the 401 policy and the error type are decided in
one place. And where two modules genuinely needed each other, the upward call
became an announcement — see below.

## Why there is an event bus

Only to break cycles, and there were exactly three:

| Downward (kept as an import) | Upward (became an event) |
|---|---|
| `portals` reads the category list | categories announce `CATEGORIES_CHANGED` |
| `map` reads `categoryByKey` | categories announce `GRAPH_RELOAD` |
| `workspace` is told a tab opened | tabs announce `TAB_CHANGED` |

Everywhere else a plain import is clearer and stays a plain import. An event bus
used for everything is just a global with extra steps.

## Errors

`apiFetch` throws `ApiError` carrying the status and the server's own message.
Callers decide what that means:

- `handle401: true` (default) re-authenticates — the user is sent to sign in.
- `handle401: false` hands the 401 back, for panels that show the expiry inline
  rather than bouncing you out mid-edit: settings, the model list, the chat,
  save-problem.

Third-party calls deliberately bypass `apiFetch`: LeetCode and GitHub are
unauthenticated, and Google Drive uses a different token.

## Tests

```bash
NODE_PATH=../DailyProblemTracker-Service/frontend/node_modules node scripts/smoke.mjs
```

jsdom cannot execute `<script type="module">`, so the test stands up a jsdom
window, installs it globally, then imports `js/main.js` with Node's own ESM
loader. That exercises the real graph — every import resolves, nothing throws at
module scope, no cycle leaves a binding in its temporal dead zone — and then
checks the markup and the action registry agree.

It borrows jsdom from the study app's `node_modules` rather than adding a
`package.json` here, so this project stays dependency-free and Netlify keeps
publishing `.` unchanged.
