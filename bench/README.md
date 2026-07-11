# Benchmark

## Output

AMD Ryzen 5 5600X, Windows:

### Node.js 26.5.0

```sh
node bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 182.33 | 0.27 | 142.73 | 7006085.84 | 163.45 | 92.04 |
| node-red | 20 | 1000000 | 1165.77 | 0.92 | 1505.37 | 664287.07 | 1057.70 | 227.36 |

### bun 1.3.14

```sh
bun bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 233.11 | 0.60 | 106.70 | 9372000.08 | 143.80 | 175.28 |
| node-red | 20 | 1000000 | 1192.81 | 1.41 | 1863.19 | 536712.71 | 816.30 | 301.10 |

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
