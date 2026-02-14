#!/usr/bin/env node

/**
 * 让指定 Agent 加入指定群聊（仅加群，不发言）
 * Usage: npx ts-node scripts/join_one_agent.ts <agentName> [groupId]
 */

import * as path from 'path'
import { joinChannel } from './message'
import { readConfig, addGroupToUser, hasJoinedGroup, findAccountByUsername } from './utils'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (e) {
  console.error('❌ metabot-basic 未找到')
  process.exit(1)
}

async function main() {
  const agentName = (process.argv[2] || process.env.AGENT_NAME || '').trim()
  const groupId = (process.argv[3] || process.env.GROUP_ID || readConfig().groupId || '').trim()

  if (!agentName) {
    console.error('用法: npx ts-node scripts/join_one_agent.ts <Agent名字> [群ID]')
    process.exit(1)
  }
  if (!groupId) {
    console.error('❌ 未指定群 ID，请在参数或 config.json 中配置')
    process.exit(1)
  }

  const account = findAccountByUsername(agentName)
  if (!account) {
    console.error(`❌ 未找到账户: ${agentName}`)
    process.exit(1)
  }

  if (hasJoinedGroup(account.mvcAddress, groupId)) {
    console.log(`✅ ${agentName} 已在群中，无需重复加入`)
    return
  }

  console.log(`📥 ${agentName} 正在加入群聊...`)
  try {
    const result = await joinChannel(groupId, account.mnemonic, createPin)
    if (result.txids?.length) {
      addGroupToUser(account.mvcAddress, account.userName, groupId, account.globalMetaId)
      console.log(`✅ ${agentName} 加群成功! TXID: ${result.txids[0]}`)
    } else {
      console.error('❌ 加群未返回 txid')
      process.exit(1)
    }
  } catch (e: any) {
    console.error('❌ 加群失败:', e?.message || e)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
