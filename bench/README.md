# Benchmark

## Output

AMD Ryzen 5 5600X, Windows:

### Node.js 26.5.0

```sh
node bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 27.91 | 0.26 | 145.97 | 6850911.42 | 30.45 | 69.93 |
| node-red | 20 | 1000000 | 1144.93 | 0.91 | 1487.20 | 672404.27 | 1011.55 | 269.75 |

### bun 1.3.14

```sh
bun bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 31.46 | 0.55 | 119.06 | 8398888.41 | 34.35 | 156.77 |
| node-red | 20 | 1000000 | 1262.75 | 1.28 | 1808.44 | 552961.40 | 781.90 | 297.40 |

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
