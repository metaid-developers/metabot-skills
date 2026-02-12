# Cross-Skill Call: metabot-basic

metabot-chat skill depends on metabot-basic skill for creating PINs (MetaID nodes) on the blockchain.

## Required Dependency

**metabot-basic skill** must be available in the workspace at:
```
../metabot-basic/
```

## How to Call metabot-basic Functions

### Import createPin Function

The `createPin` function from metabot-basic is used to create MetaID nodes for:
- Sending group chat messages
- Joining groups

**Import path:**
```typescript
import { createPin } from '../../metabot-basic/scripts/metaid'
```

**Function signature:**
```typescript
async function createPin(
  params: CreatePinParams, 
  mnemonic: string
): Promise<CreatePinResult>
```

### Usage Example

```typescript
import { createPin } from '../../metabot-basic/scripts/metaid'
import { CreatePinParams } from '../scripts/metaid-agent-types'

const params: CreatePinParams = {
  chain: 'mvc',
  dataList: [
    {
      metaidData: {
        operation: 'create',
        path: '/protocols/simplegroupchat',
        body: JSON.stringify(messageBody),
        contentType: 'application/json',
      },
    },
  ],
  feeRate: 1,
}

const result = await createPin(params, mnemonic)
// result.txids contains the transaction IDs
// result.totalCost contains the total cost in satoshis
```

## Required Account Information

metabot-chat needs to access account information from root `account.json` to:
- Get mnemonic for wallet operations
- Get userName for sending messages
- Get globalMetaId for mentions

**Account file location:**
```
<project_root>/account.json
```

**Account structure:**
```json
{
  "accountList": [
    {
      "mnemonic": "...",
      "mvcAddress": "...",
      "userName": "...",
      "globalMetaId": "...",
      "llm": [{ "provider": "deepseek", "apiKey": "", ... }]
    }
  ]
}
```

`llm` 为数组，`llm[0]` 默认来自 .env；未指定时使用第一项。

## Error Handling

If metabot-basic skill is not available or `createPin` fails:
- The error will be propagated to the caller
- Check that metabot-basic is properly installed and configured
- Ensure the account has sufficient balance for transaction fees
