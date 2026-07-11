# Node-RED Runner

`@fadoli/node-red-runner` is a lightweight runtime and test-helper-compatible
way to execute Node-RED flows. It loads only the node modules referenced by a
flow, has no editor or admin UI, and focuses on small, programmatically managed
deployments.

## Project status

The runtime is actively implemented and covered by the repository test suite.
Its public API is still evolving, so treat upgrades as potentially breaking.
It is not a drop-in replacement for the complete Node-RED application.

Current coverage includes:

- `node-red-test-helper`-style flow loading, node lookup, server lifecycle, and
  message/event helpers;
- Node-RED core nodes, including Inject, Function, Change, Template, JSON,
  Switch, Delay, File, HTTP In, and HTTP Response;
- Catch, Complete, Status, Link In/Out/Call, and nested subflows;
- dependency-ordered config-node startup, rollback on failed startup, and
  encrypted credentials;
- disk-backed node, flow, and global context.

The project intentionally omits the Node-RED editor and admin APIs. Node
compatibility is determined by the node's runtime requirements, not its editor
metadata alone.

## Use as a test helper

```js
const helper = require('@fadoli/node-red-runner');
const lowerCase = require('./nodes/lower-case');

await helper.load(lowerCase, [
    { id: 'lower', type: 'lower-case', wires: [['result']] },
    { id: 'result', type: 'helper' },
]);

helper.getNode('lower').receive({ payload: 'HELLO' });
const message = await helper.awaitNodeInput('result');
console.log(message.payload); // hello

await helper.unload();
```

## Run a flow

The CLI loads a Node-RED user directory, its flow, settings, credentials, core
nodes, and declared user-directory dependencies:

```sh
npx node-red-runner --user-dir ~/.node-red --port 1880
```

Use `node runflow.js --help` from a checkout to list flow, credentials, and
settings-file overrides.

### Run a disabled tab from Node-RED

Install this package in the parent Node-RED user directory and add a
**runner flow** node to an enabled tab. Configure the ID of a disabled tab and
an unused TCP port. The node starts that tab in an isolated runner process;
communicate with its HTTP In routes at `http://127.0.0.1:<port>/...`.
Its output emits one message per second with `payload.cpu` (user time, system
time, and interval CPU percentage) and `payload.memory` (`process.memoryUsage`
bytes).

Each runner-flow node stores its state under:

```text
<user-dir>/.node-red-runner/<runner-node-id>/context/
```

The node accepts only disabled tabs. It stops the child runner when the parent
flow stops or is redeployed.

## Context persistence

Configure `contextStorage` with a storage-root path to persist node, flow, and
global context. Persistence is enabled automatically when `file` (or its
`path` alias) is set; context reloads before flows start and flushes on the
configured interval and during shutdown.

```js
helper.settings({
    contextStorage: {
        file: './.node-red-runner/context',
        saveInterval: 5000,
        compressionThreshold: 256 * 1024,
        backup: true,
    },
});
```

If `file` has an extension, it is removed when deriving the storage root. The
example writes `./.node-red-runner/context/global.json`, plus
`./.node-red-runner/context/<flow-id>.json` and
`./.node-red-runner/context/<flow-id>/<node-id>.json`. Files above
`compressionThreshold` use built-in zlib compression; `backup` controls
backup-file creation.

## Development

```sh
npm test
npm run bench -- --runs 20 --messages 1000000
```

The [benchmark harness](bench/README.md) compares cold startup, shutdown, and
10,000-message-chunk flow throughput with Node-RED using the same flow.

## License

This project is available under AGPL-3.0-or-later. Commercial licensing is
available from the copyright holder; see [LICENSE](LICENSE).
