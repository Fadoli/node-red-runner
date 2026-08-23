## Recommended architecture

Keep two graph representations:

```
Canonical editor graph
  tabs, nodes, config nodes, groups, subflows, credentials
                    │
                    ▼
          compiler + validation
                    │
          executable graph + indexes
                    │
                    ▼
          incremental runtime deploy
```

The editor and API must operate only on the canonical graph. The generated subflow nodes such as `instance:inner` remain private runtime details.

This fits the current architecture: subflow.js already compiles subflows, while runtime.js executes ordinary nodes. The current `setFlows` path in index.js stops everything, so it should remain the full-deploy fallback rather than power the editor.

Node-RED supports `full`, modified-node, and modified-flow deployment, but still accepts the complete flow document. Your custom API can improve on that by transmitting only changed entities while retaining revision conflict detection. [Node-RED POST /flows reference](https://nodered.org/docs/api/admin/methods/post/flows/)

## API model

Use domain changes rather than JSON Patch. Array-index patches become fragile as flows are reordered.

```http
GET /api/editor/snapshot
GET /api/editor/node-types
POST /api/editor/validate
POST /api/editor/deploy
GET /api/editor/events
```

Example deployment:

```json
{
  "baseRev": "42",
  "mutationId": "b680...",
  "changes": [
    {
      "op": "update-node",
      "id": "mqtt-out-1",
      "set": {
        "topic": "production/events"
      }
    },
    {
      "op": "replace-wires",
      "id": "function-1",
      "wires": [["mqtt-out-1"]]
    },
    {
      "op": "remove-node",
      "id": "debug-2"
    }
  ],
  "credentials": {
    "mqtt-config-1": {
      "password": "new secret"
    }
  }
}
```

Important API properties:

- `baseRev` provides optimistic concurrency; stale requests return `409`.
- A deployment batch is atomic.
- IDs, types, references, credentials and request sizes are validated server-side.
- Credentials are write-only and omitted from snapshots.
- The response includes the new revision and actual impact:

```json
{
  "rev": "43",
  "impact": {
    "created": ["mqtt-out-1"],
    "restarted": ["mqtt-config-1", "mqtt-out-1"],
    "rewired": ["function-1"],
    "removed": ["debug-2"]
  }
}
```

The UI can keep undeployed changes locally for the first release. Server-side drafts, collaborative editing and autosave can wait until there is a demonstrated need.

## Change-impact rules

| Change | Runtime action |
| --- | --- |
| Node position or editor-only appearance | Persist only; no runtime operation |
| Wires | Call `updateWires()` on the source; no constructor restart |
| Ordinary node runtime property | Restart that node |
| Config node | Restart it and all transitive consumers |
| Added node | Construct it dependency-first, then connect wires |
| Removed node | Disconnect incoming wires, close it with `removed=true`, then remove |
| Disabled node/tab | Treat as executable removal/addition |
| Tab environment | Restart nodes whose resolved environment changed |
| Subflow instance property/environment | Recompile and compare that instance |
| Subflow template internals | Recompile every direct and nested instance of that template |
| Subflow ports | Rebuild affected wrappers, proxies and connected external wires |
| Credentials | Restart every runtime node receiving those credentials |
| Unknown or unsafe effect | Fall back to affected-flow or full deploy |

An important implementation detail: node.js caches actual target node objects in `updateWires()`. Whenever a target is restarted—even under the same ID—all upstream nodes pointing to it must be rewired. They do not need to be restarted.

## Implementation phases

### 1. Extract a pure compiler

Turn the current `expandSubflows` plus `clearFlow` sequence into a compiler returning:

```js
{
  nodesById,
  sourceToRuntimeIds,
  runtimeToSourceId,
  configDependencies,
  configDependents,
  incomingWires,
  subflowInstances,
  diagnostics
}
```

Requirements:

- Never mutate the canonical editor graph.
- Preserve stable generated IDs for subflow children and output proxies.
- Detect missing references, duplicate IDs, unknown types, config cycles, subflow cycles and invalid ports.
- Include provenance for nested subflows and credential inheritance.
- Resolve disabled groups/tabs and flow/subflow environment consistently.

Initially compile the complete canonical graph and diff the compiled result. This is simpler and safer; only runtime application is partial. Replace it with incremental compilation only if benchmarks show compilation is significant.

### 2. Add an incremental runtime transaction

Add `runtime.apply(candidate, deploymentPlan)` alongside the existing full `load()`.

Deployment sequence:

1. Serialize deployments with one process-local lock.
2. Validate and compile without changing live state.
3. Disconnect incoming routes to nodes being replaced.
4. Close dependents before their config nodes.
5. Use `close(false)` for replacement and `close(true)` for genuine deletion.
6. Construct replacements dependency-first.
7. Commit registry entries.
8. Refresh cached wires pointing to replaced targets.
9. Close removed nodes and clean deleted context according to policy.
10. If startup fails, close staged nodes and recreate the previous affected nodes.

Unchanged registry entries must retain object identity, listeners, sockets, timers and context.

Define deployment traffic behavior explicitly: affected edges pause or drop messages during the short replacement window; unrelated flows continue. Do not add message queuing until a real use case requires it.

### 3. Fix lifecycle boundaries needed by partial deploys

Before exposing the editor:

- Separate `httpAdmin` and `httpNode`; they currently share one Express app.
- Track flow-owned HTTP routes so restarting an HTTP node does not leave duplicate routes.
- Preserve node/flow/global context across replacement; delete node context only for genuine deletion.
- Emit runtime status and deployment events through a standard `EventEmitter`.
- Provide SSE for UI status updates; WebSockets are unnecessary initially.
- Keep full deploy as a fallback for nodes with untracked global side effects.

HTTP route ownership is the largest compatibility risk because third-party constructors can register routes and other process-global resources.

### 4. Add storage and revisions

Introduce an in-memory canonical store indexed by ID using `Map`, with an authoritative revision.

For every deploy:

1. Apply the change batch to a candidate model.
2. Validate and compile.
3. Stage an atomic filesystem snapshot.
4. Apply the runtime transaction.
5. Commit the snapshot and revision only after runtime success.

Keep Node-RED-compatible import/export, but do not make expanded runtime JSON persistent. Credentials should remain in an encrypted, write-only store.

### 5. Build the UI

A practical MVP should contain:

- Flow tabs and SVG/canvas workspace.
- Palette and node search.
- Drag, connect, delete, copy/paste and undo/redo.
- Property inspector.
- Config-node editor and usage list.
- Subflow editor with breadcrumb navigation and input/output port editing.
- Disabled-state, environment and credential editing.
- Validation panel and deployment impact preview.
- Import/export of Node-RED-compatible JSON.
- Live node status through SSE.

The runtime currently imports execution JavaScript but not Node-RED editor HTML metadata. Therefore add a small node-type descriptor format—label, ports, defaults, credential fields and JSON-schema-like property definitions. Unknown node types should remain editable through a raw JSON inspector. Reimplementing Node-RED’s entire HTML editor plugin system should be deferred.

### 6. Security

Do not ship the admin UI behind the existing no-op `needsPermission` implementation.

Minimum requirements:

- Bind the admin API to loopback by default.
- Real authentication and authorization.
- CSRF protection if cookie authentication is used.
- Strict body limits and schema validation.
- Credentials never returned to the browser.
- No arbitrary package installation or filesystem access in the first release.
- Separate editor/admin paths from user flow HTTP endpoints.

## Required tests and benchmarks

Focused `node:test` coverage should verify:

- Position-only edit invokes zero constructors and zero close handlers.
- Wire-only edit reroutes immediately without restarting either endpoint.
- Replacing a target refreshes upstream cached target objects.
- Config changes restart transitive consumers in the correct order.
- Unrelated tabs remain alive and preserve object identity.
- Nested subflow edits restart every affected instance and nothing else.
- Failed constructors restore the previous affected graph and revision.
- HTTP routes do not duplicate after repeated edits.
- Credentials remain secret and restart the correct clones.
- Concurrent stale deployment returns `409`.
- Disabled tabs, groups, links, catch/status/complete nodes and context behave correctly.

Because this is performance-sensitive, add both `bench/incremental-deploy.js` and `bench/incremental-deploy.md`. Benchmark:

- One wire edit in 1k, 10k and 50k-node graphs.
- One ordinary-node edit.
- A config node with large fan-out.
- A subflow template with hundreds of instances.
- Full deploy comparison.
- Compile/diff time, apply time, event-loop pause, heap allocation and constructor/close counts.

Also record rejected experiments, especially incremental compilation if its bookkeeping costs more than full compile-and-diff.

The first useful milestone is: partial domain API + full compile/diff + partial runtime replacement + a basic canvas. That directly achieves “do not republish unchanged elements” without prematurely building collaboration, a plugin marketplace, or a second runtime.