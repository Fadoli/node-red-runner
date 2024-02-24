# Node-Red-Runner

## Status

This is still a Work-In-Progress, as such any APIs or files are highly likely to be modified at anytime.

HTTP-IN - RESPONSE is currently brokken because of the use of hyper-express.

## Goals

The goal of this repository is to provide a fast and lightweight implementation of node-red-test-helper and node-red runtime.

To achieve this goal, here are the main differences :

1. This is not Node-Red, and the goal is not to be identical to it, as such we drop everything that is UI related, instead this aims to provide a Read-Only execution context
1. This repository is recent and does not have to bear with years of technical debts, recent nodejs APIs are used.
1. Fancy things such as "not loading all nodes" into the runtime are done to reduce memory usage and startup time, at the cost of risking some incompatibilities.
1. Events in the runtime are greatly modified, there is no plan here to have things such as hooks for whenever messages are being handled, we want to keep the flow execution simple, external tools are to be used for profiling / debuging.

Some additionnal optimisation are planned like the usage of "compiled" node.send functions, simplified context management ...

## Some numbers

As of now (2024/02/23), a small flow with mostly only node-red nodes perform better in several metrics :

1. Startup time is slightly improved
1. Memory consumption is improved in the case of small flows (NR uses around ~50-75MB whereas this use only ~25-30MB)
1. CPU usage overhead is reduced as well due to the simplification of the runtime
