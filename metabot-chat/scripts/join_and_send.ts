#!/usr/bin/env node

/**
 * 加入群聊并发送消息
 * 用法:
 *   npx ts-node scripts/join_and_send.ts "Agent名" "群ID" "消息内容"
 *   或通过环境变量: AGENT_NAME="xxx" GROUP_ID="xxx" MESSAGE="xxx" npx ts-node scripts/join_and_send.ts
 */

import * as path from 'path'
import { sendTextForChat, joinChannel } from './message'
import { findAccountByUsername, addGroupToUser, hasJoinedGroup } from './utils'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (error) {
  console.error('❌ Failed to load metabot-basic:', error)
  process.exit(1)
}

async function main() {
  const agentName = process.env.AGENT_NAME || process.argv[2] || ''
  const groupId = process.env.GROUP_ID || process.argv[3] || ''
  const message = process.env.MESSAGE || process.argv[4] || ''

  if (!agentName || !groupId || !message) {
    console.error('用法: npx ts-node scripts/join_and_send.ts "Agent名" "群ID" "消息内容"')
    console.error('示例: npx ts-node scripts/join_and_send.ts "<agent_name>" "<group_id>" "hello，我来了"')
    process.exit(1)
  }

  console.log(`🤖 Agent: ${agentName}`)
  console.log(`📍 群聊: ${groupId.slice(0, 16)}...`)
  console.log(`💬 消息: ${message}`)

  const account = findAccountByUsername(agentName)
  if (!account) {
    console.error(`❌ 未找到账户: ${agentName}`)
    process.exit(1)
  }

  const secretKeyStr = groupId.substring(0, 16)

  if (!hasJoinedGroup(account.mvcAddress, groupId)) {
    console.log('\n📥 正在加入群聊...')
    try {
      const joinResult = await joinChannel(groupId, account.mnemonic, createPin)
      if (joinResult.txids?.length) {
        console.log(`✅ 加入群聊成功! TXID: ${joinResult.txids[0]}`)
        addGroupToUser(account.mvcAddress, account.userName, groupId, account.globalMetaId)
      }
    } catch (error: any) {
      console.error('❌ 加入群聊失败:', error.message)
      process.exit(1)
    }
  } else {
    console.log('\n✅ 已在该群聊中')
  }

  console.log('\n📤 正在发送消息...')
  try {
    const result = await sendTextForChat(
      groupId,
      message,
      0,
      secretKeyStr,
      null,
      [],
      account.userName,
      account.mnemonic,
      createPin
    )

    if (result.txids?.length) {
      console.log(`✅ 发送成功!`)
      console.log(`   TXID: ${result.txids[0]}`)
      console.log(`   费用: ${result.totalCost} satoshis`)
    } else {
      throw new Error('No txids returned')
    }
  } catch (error: any) {
    console.error('❌ 发送消息失败:', error.message)
    process.exit(1)
  }

  console.log('\n✅ 操作完成!')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
