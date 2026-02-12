#!/usr/bin/env node

/**
 * 发送单条消息到群聊
 * Usage: npx ts-node scripts/send_message.ts <agentName> <message>
 */

import * as path from 'path'
import { sendTextForChat } from './message'
import { readConfig, findAccountByUsername, hasJoinedGroup, addGroupToUser, fetchAndUpdateGroupHistory } from './utils'
import { joinChannel } from './message'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (error) {
  console.error('❌ Failed to load metabot-basic:', error)
  process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const agentName = args[0] || '大有益'
  const message = args.slice(1).join(' ') || '大家好，抱歉通知大家：本次讨论取消。取消原因是我要去干活了，咱们下次再聊！'

  const config = readConfig()
  if (!config.groupId) {
    console.error('❌ groupId not configured')
    process.exit(1)
  }

  const account = findAccountByUsername(agentName)
  if (!account) {
    console.error(`❌ Account not found: ${agentName}`)
    process.exit(1)
  }

  if (!hasJoinedGroup(account.mvcAddress, config.groupId)) {
    console.log('📥 Joining group...')
    const joinResult = await joinChannel(config.groupId, account.mnemonic, createPin)
    if (joinResult.txids?.length) {
      addGroupToUser(account.mvcAddress, account.userName, config.groupId, account.globalMetaId)
    }
  }

  const secretKeyStr = config.groupId.substring(0, 16)
  try {
    const result = await sendTextForChat(
      config.groupId,
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
      console.log(`✅ 发送成功! TXID: ${result.txids[0]}`)
      await fetchAndUpdateGroupHistory(config.groupId, secretKeyStr)
    } else {
      console.log(`⚠️ 发送未返回 txid，可能余额不足或网络异常`)
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('balance') || msg.includes('insufficient') || msg.includes('余额')) {
      console.log(`⚠️ [余额不足] ${agentName} (${account.mvcAddress}) 发送失败: ${msg}`)
    } else {
      console.log(`⚠️ 发送失败: ${msg}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
