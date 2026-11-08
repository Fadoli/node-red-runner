# Benchmark

## At a glance

Compared with Node-RED in the recorded small-flow benchmarks, the runner achieved:

**Node.js:** 9.4–70.5× faster startup, 7.5–49.9× less CPU time through flow load, 78–79% lower resident memory after flow load, and 10.0–13.9× higher message throughput.

**Bun:** 9.9–43.2× faster startup, 8.2–42.9× less CPU time through flow load, 44–48% lower resident memory after flow load, and 8.0–12.0× higher message throughput.

Ranges cover the recorded results below; results depend on the workload and environment.

## Output

### AMD Ryzen 5 5600X, Windows

#### Node.js 26.5.0

```sh
node bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 12.82 | 0.24 | 96.59 | 10352690.81 | 18.05 | 65.52 |
| node-red | 20 | 1000000 | 904.27 | 0.84 | 1341.30 | 745548.11 | 900.80 | 307.19 |

#### bun 1.3.14

```sh
bun bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 16.54 | 0.53 | 139.84 | 7151122.82 | 17.00 | 146.84 |
| node-red | 20 | 1000000 | 714.95 | 1.30 | 1677.91 | 595981.27 | 729.55 | 278.00 |

#### bun 1.4.0

```sh
bun bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 15.22 | 0.51 | 154.30 | 6480862.71 | 16.40 | 88.58 |
| node-red | 20 | 1000000 | 582.80 | 1.16 | 1630.69 | 613238.37 | 572.70 | 159.56 |

### Intel Core i5-7300HQ, Windows

An older laptop with lowend SSD storage.

#### Node.js 26.13.0

```sh
node bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 150.60 | 0.39 | 259.22 | 3857688.33 | 169.50 | 63.01 |
| node-red | 20 | 1000000 | 1411.96 | 1.15 | 2595.13 | 385337.48 | 1271.10 | 286.64 |

#### Bun 1.4.4

```sh
bun bench/measure.js --runs 20 --messages 1000000
```

| target | runs | messages | startupMs | stopMs | flowMs | msgPerSec | cpuMs | rssMiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runner | 20 | 1000000 | 178.02 | 0.63 | 280.13 | 3569729.51 | 131.15 | 65.71 |
| node-red | 20 | 1000000 | 1765.69 | 1.59 | 2246.69 | 445098.29 | 1081.05 | 126.74 |

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
