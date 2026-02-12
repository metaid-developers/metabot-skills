---
name: MetaID-Consolidating-Skill
description: Automatically consolidate scattered small UTXOs in an Agent's wallet to the main address. This skill scans for dust UTXOs (small unspent outputs) and consolidates them into a single transaction to optimize wallet structure and reduce future transaction fees. Use when users want to: (1) Clean up wallet by consolidating small UTXOs, (2) Optimize transaction fees, (3) Trigger consolidation with "确认归集" command. Trigger phrases include: "确认归集", "consolidate UTXOs", "归集资产".
---

# MetaID-Consolidating-Skill

This skill enables MetaBot Agents to automatically consolidate scattered small UTXOs (Unspent Transaction Outputs) in their wallet to the main address, optimizing wallet structure and reducing future transaction fees.

## Core Functionality

The MetaID-Consolidating-Skill provides:

1. **UTXO Scanning** - Scans wallet for small UTXOs that can be consolidated
2. **Dust Filtering** - Filters out dust UTXOs below the threshold (546 satoshis)
3. **Transaction Building** - Builds consolidation transactions to send all UTXOs to the main address
4. **State Management** - Implements a state machine to track consolidation progress
5. **Safety Checks** - Validates balance tolerance and prevents conflicts during consolidation

## When to Use This Skill

This skill activates when users send the exact command:
- **"确认归集"** (exact match required, no variations)

**Important:** The trigger word must be exactly "确认归集" - no spaces, no punctuation, no case variations.

## Features

### Trigger Logic
- **Exact Match Required**: Only "确认归集" triggers the consolidation
- **No Variations**: "确认"、"归集"、"确认 归集"、"确认归集!" will NOT trigger
- **Silent on Mismatch**: If the command doesn't match exactly, the system remains silent

### Dust Threshold
- **DUST_THRESHOLD**: 546 satoshis
- UTXOs below this threshold are excluded from consolidation to prevent failed transactions

### Balance Tolerance
- **BALANCE_TOLERANCE**: ±10%
- If the real-time balance deviates more than 10% from the scanned balance, the transaction is aborted for safety

### Confirmation Standard
- Consolidation is considered complete after **1 block confirmation**

### State Machine

The skill implements the following states:

1. **`idle`** - Initial state, waiting for "确认归集" command
2. **`awaiting_consolidation`** - Scanning UTXOs, building transaction, broadcasting
   - During this state, all new transfer requests are rejected
3. **`consolidating_pending`** - Transaction broadcasted, waiting for 1 confirmation
   - Polls blockchain status continuously
   - Timeout: 15 minutes
4. **`consolidating_timeout`** - Transaction not confirmed within 15 minutes
   - User can query transaction status (opens block explorer)
   - User can abandon consolidation (returns to `idle`)
   - **No retry button** to prevent double-spending

### Conflict Handling

During consolidation (from command to completion or timeout):
- **Exclusive Execution**: System enters locked state
- **Transfer Rejection**: Any new transfer requests are directly rejected with message: "当前正在执行归集操作，请在归集完成后再发起新交易。"

## Usage

### Command Line

```bash
npx ts-node scripts/consolidate.ts <agentName> <mainAddress>
```

**Parameters:**
- `agentName`: The name of the metabot-basic performing consolidation
- `mainAddress`: The main address to consolidate UTXOs to (optional, defaults to agent's primary address)

**Example:**
```bash
npx ts-node scripts/consolidate.ts "AI Sunny" "1KUmqn2noktJbdW4rPfHJdefCZmV8QzyiH"
```

### Programmatic Usage

```typescript
import { consolidateUtxos } from './scripts/consolidate'

const result = await consolidateUtxos(
  mnemonic,
  mainAddress,
  address,
  path
)
```

## Implementation Details

### Constants

All magic numbers are defined as constants at the top of the file:

```typescript
// TODO: extract to config
const DUST_THRESHOLD = 546 // satoshis
const BALANCE_TOLERANCE = 0.1 // ±10%
const CONFIRMATION_REQUIRED = 1 // blocks
const TIMEOUT_MINUTES = 15 // minutes
```

### Reading Operations
- Queries UTXOs using `fetchMVCUtxos` from `api.ts`
- Filters out dust UTXOs (< 546 satoshis)
- Validates balance tolerance before building transaction

### Writing Operations
- Builds consolidation transaction using `createPin` method
- Sends all UTXOs to main address
- Broadcasts transaction to MVC network
- Monitors transaction confirmation status

### State Management
- Tracks consolidation state in memory (can be persisted to file/database in future)
- Prevents concurrent operations during consolidation
- Handles timeout and error scenarios

## Error Handling

The skill handles:
- Insufficient balance for transaction fees
- Balance tolerance exceeded
- Transaction broadcast failures
- Confirmation timeout
- Network errors
- Invalid agent account
- Concurrent transfer requests during consolidation

## Error Messages

- **Transfer Rejection**: "当前正在执行归集操作，请在归集完成后再发起新交易。"
- **Timeout**: "归集交易已广播但尚未确认（超时15分钟），您可以继续等待或放弃本次归集。"
- **Broadcast Failure**: "归集交易广播失败，请稍后重试。"

## Dependencies

This skill uses scripts from metabot-basic:
- `metaid.ts` - For creating transactions and broadcasting to chain
- `wallet.ts` - For wallet operations and address derivation
- `api.ts` - For querying UTXOs and transaction status
- `utils.ts` - For account management
- `doge.ts` - For DOGE chain operations (if needed)

## Examples

### Basic Consolidation
```bash
# Consolidate UTXOs for AI Sunny
npx ts-node scripts/consolidate.ts "AI Sunny"
```

### Consolidate to Specific Address
```bash
# Consolidate to a specific main address
npx ts-node scripts/consolidate.ts "AI Sunny" "1KUmqn2noktJbdW4rPfHJdefCZmV8QzyiH"
```

## Version History

- **V1.0** (2026-02-11): Initial MVP version
  - Basic consolidation functionality
  - State machine implementation
  - Dust filtering and balance tolerance
  - Conflict handling during consolidation
