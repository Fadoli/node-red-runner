# Runtime internals

The runtime deliberately has one execution path: every configured node becomes a
`Node`, is registered before constructors run, and sends directly to pre-resolved
wire targets. Features should reuse that path instead of adding a second event bus.

## Files

- `runtime.js` owns registration, dependency-ordered startup, rollback, shutdown,
  settings, and the Express server.
- `node.js` implements the node API and message delivery.
- `registry.js` stores node types and the currently loaded flow.
- `context.js` owns node, flow, global, and persisted context.
- `subflow.js` expands subflow templates into ordinary node configurations before
  runtime loading.
- `builtins.js` contains the small runtime-owned routing nodes: Catch, Complete,
  Status, and Link nodes.
- `nodeReader.js` discovers node modules for CLI use.
- `compiler.js` keeps the canonical editor graph separate from the expanded
  runtime graph and calculates partial-deploy impact.

## Load lifecycle

1. `index.js` registers built-in and requested node modules.
2. Subflows are expanded and disabled nodes/wires are removed.
3. `runtime.load` validates types and IDs and computes config-node dependencies.
4. All `Node` objects are registered so constructors can call `getNode`.
5. Constructors run dependency-first; asynchronous constructors are awaited.
6. Wires are resolved only after construction succeeds.

If construction or wire setup fails, every created node is closed, the registry and
failed context state are discarded, and the original error is rethrown.

## Internal configuration fields

Fields prefixed with `_` are produced by subflow expansion and are not public API:

- `_targets` and output proxy nodes bridge subflow inputs and outputs.
- `_parentFlowId` implements `$parent` context access.
- `_env` and `_parentEnv` provide environment lookup.
- `_credentialId` and `_envCredential*` map cloned nodes back to exported credentials.

Keep runtime work allocation-light: use direct loops in frequently executed paths
and avoid enumeration helpers that create intermediate arrays.
