# Project guide for coding agents

## What this project is

`@fadoli/node-red-runner` is a lightweight Node.js runtime and
`node-red-test-helper`-style test helper for executing Node-RED flows without
the Node-RED editor or admin UI. It can also run a selected flow tab from the
command line and provides the `runner-flow` Node-RED node for isolated child
runners.

The public API is exported from `index.js`; the CLI entry point is
`runflow.js`. The package targets Node.js and is also exercised with Bun.

## Important commands

```sh
npm test
npm run bench -- --runs 20 --messages 10000
npm start -- --help
```

Run one test file with Node's built-in test runner when iterating:

```sh
node --test test/helper_spec.js
```

Do not add a test framework. Tests use `node:test` and `node:assert` (with a
small compatibility shim in some older specs).

## Repository map

- `index.js` — public helper API: load/unload, server lifecycle, node lookup,
  event/message waiting, settings, flow cleanup, and subflow expansion.
- `runflow.js` — CLI: reads a Node-RED user directory, flow, credentials,
  settings, core nodes, and declared user nodes; then starts the HTTP server.
- `src/runtime.js` — registration, config-node dependency ordering, startup,
  rollback, shutdown, settings, and Express integration.
- `src/node.js` — Node-RED-compatible node object and message/event delivery.
- `src/registry.js` — registered node types and the current flow.
- `src/context.js` — node/flow/global context and optional disk persistence.
- `src/subflow.js` — compiles subflow templates into ordinary node configs.
- `src/builtins.js` — runtime-owned Catch, Complete, Status, and Link nodes.
- `src/nodeReader.js` — discovers and selectively imports Node-RED node modules.
- `src/utils/` — Node-RED utility compatibility, filesystem persistence, and
  logging.
- `nodes/` — the packaged `runner-flow` node.
- `test/` — behavior and compatibility tests.
- `bench/` — runner-vs-Node-RED benchmark harness and recorded methodology.

See `src/README.md` for the detailed load lifecycle.

## Runtime invariants

- Node types must be registered before a flow is loaded.
- Every configured node is registered before constructors run, so constructors
  can resolve config nodes with `RED.nodes.getNode`.
- Config-node references determine startup order; ordinary message wires do
  not create config dependencies.
- Constructors run dependency-first and may be asynchronous.
- Startup failures must close already-created nodes and leave the registry and
  context clean enough for a retry.
- Wires are resolved after construction succeeds.
- Disabled tabs/nodes and wires to disabled nodes are removed by `clearFlow`.
- Subflows are expanded before runtime loading; runtime code should not create
  a second subflow execution path.
- Runtime state is process-global. The helper is not safe for parallel,
  independent helper instances in one process.

## Implementation conventions

- Prefer the existing runtime path and built-in Node.js APIs.
- Keep hot message-delivery paths allocation-light: use direct loops and avoid
  intermediate arrays or `Object.keys`/`Object.values` where practical.
- Preserve callback and Promise forms where the public helper already supports
  both.
- Preserve Node-RED compatibility behavior before improving internal style.
- Validate behavior at trust boundaries and preserve rollback/close handling.
- Use CommonJS and the repository's existing formatting/style unless a change
  is specifically about modernization.

## Making changes

1. Read the relevant public API and its callers before editing internals.
2. Add or update the smallest focused `node:test` case for non-trivial logic.
3. Run the focused test, then `npm test`.
4. If changing performance-sensitive code, run the benchmark and document
   findings in `bench/` with both a Markdown note and a runnable JavaScript
   benchmark. Record alternatives that were measured and rejected too.

Do not add editor/admin APIs, broad Node-RED features, abstractions for one
implementation, or dependencies unless the task explicitly requires them.

## Compatibility boundaries

This is a lightweight runtime, not a complete Node-RED replacement. Supported
behavior is defined by the tests and implemented compatibility surface. A node
that depends on editor metadata, admin APIs, or unimplemented runtime services
may not work even if it installs successfully.

## Flow editor UI conventions

- The editor is served by `src/editor-ui.js` from the raw assets
  `src/editor-ui.html` and `src/editor-ui-client.js`; keep browser code
  dependency-free and validate it with `node --check`.
- `src/editor-api.js` is the only editor backend boundary. Keep deployment
  revision checks, partial mutation semantics, credential redaction, and SSE
  event behavior intact when extending the UI.
- Node rendering metadata comes from adjacent Node-RED `.html` files through
  `src/nodeReader.js` and `registry.typeMetadata`; do not hard-code built-in
  node colors, port counts, icons, categories, or editor defaults.
- Disabled tabs/nodes remain visible in the editor but are greyed out. Runtime
  compilation still excludes them. Keep `d`/`disabled` controls out of the
  generic property form and expose explicit Enable/Disable actions.
- Selection supports shift-click and marquee selection. Moving any selected
  node moves the complete group. Wires are selectable and deletable; wiring is
  output-port drag to input-port drag, not a legacy click-to-wire mode.
- Keep Inspector, Debug, and Context as right-sidebar tabs. Debug consumes the
  `/api/editor/events` SSE stream; Context uses `/api/editor/context/:id`.
- When changing pointer interactions, verify selection, group movement,
  marquee selection, wire dragging/deletion, and Delete-key behavior while an
  inspector field has focus.
