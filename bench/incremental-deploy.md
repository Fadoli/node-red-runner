# Incremental deployment benchmark

Run with:

```sh
node bench/incremental-deploy.js
```

The benchmark compiles the complete canonical graph, changes only one editor
position, compiles again, and computes the runtime impact. Position changes are
expected to restart zero nodes. Full compile-and-diff is intentionally the
initial implementation: it keeps subflow provenance and validation simple while
runtime construction remains partial.

Measure before replacing it with an incremental compiler. Record compile time,
heap usage, and the number of constructors/close handlers invoked by a real
deployment. The rejected alternatives are JSON Patch over array indexes (fragile
under reordering), calling `setFlows` (restarts every node), and editing the
expanded subflow graph directly (loses source/template ownership).
