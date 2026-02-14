#!/usr/bin/env node

/**
 * 临时脚本：让Alice加入指定群聊
 */

import * as path from 'path'
import { joinChannel } from './message'
import { addGroupToUser, hasJoinedGroup, findAccountByUsername } from './utils'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (e) {
  console.error('❌ metabot-basic 未找到')
  process.exit(1)
}

async function main() {
  const agentName = 'Alice'
  const groupId = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'

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
