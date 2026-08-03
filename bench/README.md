# Benchmark

## Output

AMD Ryzen 5 5600X, Windows:

### Node.js 26.5.0

```sh
node bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 12.82 | 0.24 | 96.59 | 10352690.81 | 18.05 | 65.52 |
| node-red | 20 | 1000000 | 904.27 | 0.84 | 1341.30 | 745548.11 | 900.80 | 307.19 |

### bun 1.3.14

```sh
bun bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 16.54 | 0.53 | 139.84 | 7151122.82 | 17.00 | 146.84 |
| node-red | 20 | 1000000 | 714.95 | 1.30 | 1677.91 | 595981.27 | 729.55 | 278.00 |

### bun 1.4.0

```sh
bun bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 15.22 | 0.51 | 154.30 | 6480862.71 | 16.40 | 88.58 |
| node-red | 20 | 1000000 | 582.80 | 1.16 | 1630.69 | 613238.37 | 572.70 | 159.56 |

## Run it yourself

Run the small-flow baseline with:

```sh
npm run bench -- --runs 20 --messages 10000
```

Each run starts a fresh Node.js worker for this runner and Node-RED, then sends the same number of messages through the same two-node flow in 10,000-message chunks. A chunk must reach the sink before the next begins. It reports the mean of:

- `startupMs`: cold module startup through flow load (each sample uses a cache-isolated worker);
- `stopMs`: flow shutdown time;
- `flowMs` and `msgPerSec`: message-flow duration and throughput;
- `cpuMs`: CPU consumed through flow load;
- `rssMiB`: resident memory immediately after the flow loads.

Both targets disable HTTP routes and do not listen on a port. Use the same Node.js version, machine, flow, run count, and measurement definitions when recording results; the repository does not treat old measurements as current claims.
