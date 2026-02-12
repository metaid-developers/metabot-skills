#!/usr/bin/env node

/**
 * Batch join all known users from metabot-basic account.json to a specified group
 * Usage: npx ts-node scripts/batch_join_group.ts [groupId]
 */

import * as path from 'path'
import * as fs from 'fs'
import { joinChannel } from './message'
import { hasJoinedGroup, addGroupToUser } from './utils'

// Import createPin from metabot-basic skill
let createPin: any = null
try {
  const metaidAgentPath = path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid')
  const metaidModule = require(metaidAgentPath)
  createPin = metaidModule.createPin
  if (!createPin) {
    throw new Error('createPin not found in metabot-basic')
  }
} catch (error) {
  console.error('❌ Failed to load metabot-basic skill:', error)
  process.exit(1)
}

const TARGET_GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0' // 🤖MetaBot 畅聊群

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface Account {
  mnemonic: string
  mvcAddress: string
  userName: string
  globalMetaId?: string
}

function getKnownAccounts(): Account[] {
  const accountFile = path.join(__dirname, '..', '..', 'account.json')
  if (!fs.existsSync(accountFile)) {
    throw new Error('根目录 account.json 未找到，请先通过 metabot-basic 创建 Agent')
  }
  const data = JSON.parse(fs.readFileSync(accountFile, 'utf-8'))
  return (data.accountList || [])
    .filter((acc: any) => acc.mnemonic?.trim() && acc.userName?.trim())
    .map((acc: any) => ({
      mnemonic: acc.mnemonic,
      mvcAddress: acc.mvcAddress,
      userName: acc.userName,
      globalMetaId: acc.globalMetaId,
    }))
}

async function joinUserToGroup(account: Account, groupId: string): Promise<boolean> {
  if (hasJoinedGroup(account.mvcAddress, groupId)) {
    console.log(`   ⏭️  ${account.userName} 已在群中，跳过`)
    return true
  }

  try {
    const joinResult = await joinChannel(groupId, account.mnemonic, createPin)
    if (joinResult.txids && joinResult.txids.length > 0) {
      addGroupToUser(
        account.mvcAddress,
        account.userName,
        groupId,
        account.globalMetaId
      )
      console.log(`   ✅ ${account.userName} 加群成功! TXID: ${joinResult.txids[0]}`)
      return true
    }
  } catch (error: any) {
    console.error(`   ❌ ${account.userName} 加群失败:`, error.message)
    return false
  }
  return false
}

async function main() {
  const groupId = process.argv[2] || TARGET_GROUP_ID

  console.log('🎯 批量加群: 🤖MetaBot 畅聊群')
  console.log(`📋 目标群组 ID: ${groupId}`)
  console.log('='.repeat(60))

  const accounts = getKnownAccounts()
  if (accounts.length === 0) {
    console.error('❌ account.json 中没有找到已知用户（需有 userName 和 mnemonic）')
    process.exit(1)
  }

  console.log(`\n📌 共 ${accounts.length} 个已知用户: ${accounts.map(a => a.userName).join(', ')}\n`)

  let successCount = 0
  let skipCount = 0
  let failCount = 0

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    console.log(`[${i + 1}/${accounts.length}] 处理 ${account.userName} (${account.mvcAddress})...`)

    if (hasJoinedGroup(account.mvcAddress, groupId)) {
      skipCount++
      console.log(`   ⏭️  已在群中，跳过`)
    } else {
      const ok = await joinUserToGroup(account, groupId)
      if (ok) successCount++
      else failCount++

      // 间隔 3 秒，避免请求过快
      if (i < accounts.length - 1) {
        console.log('   ⏳ 等待 3 秒...')
        await sleep(3000)
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`🎉 完成! 成功: ${successCount}, 已存在跳过: ${skipCount}, 失败: ${failCount}`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
