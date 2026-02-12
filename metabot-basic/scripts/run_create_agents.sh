#!/bin/bash

cd "$(dirname "$0")/.."
ts-node scripts/create_agents.ts
