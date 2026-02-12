#!/bin/bash

# Check Node.js version
echo "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 18.x.x"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version is too old. Please install Node.js >= 18.x.x"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check TypeScript
echo "Checking TypeScript..."
if ! command -v tsc &> /dev/null; then
    echo "❌ TypeScript is not installed. Please install TypeScript: npm install -g typescript"
    exit 1
fi

echo "✅ TypeScript version: $(tsc -v)"

# Check ts-node
echo "Checking ts-node..."
if ! command -v ts-node &> /dev/null; then
    echo "⚠️  ts-node is not installed globally. It will be installed as a dev dependency."
fi

echo "✅ Environment check passed!"
