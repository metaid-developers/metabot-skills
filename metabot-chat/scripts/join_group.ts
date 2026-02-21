#!/usr/bin/env node

import * as path from 'path'
import { joinChannel } from './message'
import { readConfig, writeConfig, addGroupToUser, hasJoinedGroup, findAccountByUsername, startGroupChatListenerAndPrintInstructions } from './utils'

// Import createPin from metabot-basic skill (cross-skill call)
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
  console.error('Please ensure metabot-basic skill is available at ../metabot-basic/')
  process.exit(1)
}

async function joinGroup() {
  const args = process.argv.slice(2)
  const addressOrName = (args[0] || '').trim()
  const groupIdFromArg = (args[1] || '').trim()
  const groupIdFromEnv = (process.env.GROUP_ID || '').trim()

  if (!addressOrName) {
    console.error('❌ 用法: npx ts-node scripts/join_group.ts <agent_name 或 mvc_address> [group_id]')
    console.error('   或: GROUP_ID=<groupid> npx ts-node scripts/join_group.ts "<agent_name>"')
    console.error('   示例: npx ts-node scripts/join_group.ts "YourAgentName" "c1d5c0c7...i0"')
    process.exit(1)
  }

  try {
    const config = readConfig()
    const groupId = groupIdFromArg || groupIdFromEnv || (config.groupId || '').trim()
    if (!groupId) {
      console.error('❌ 请提供 GROUP_ID：可通过第二参数、环境变量 GROUP_ID 或 config.json 中的 groupId 传入')
      process.exit(1)
    }
    if (groupId !== config.groupId) {
      config.groupId = groupId
      writeConfig(config)
    }

    // Try to find account by username first, then by address
    let account = findAccountByUsername(addressOrName)
    if (!account) {
      // Try to find by address directly
      const accountData = require('../../account.json')
      const foundAccount = accountData.accountList.find(
        (acc: any) => acc.mvcAddress === addressOrName || acc.userName === addressOrName
      )
      if (!foundAccount) {
        console.error(`❌ Account not found: ${addressOrName}`)
        console.error('   请确保 account.json 中有该 Agent 的配置')
        process.exit(1)
      }
      account = {
        mnemonic: foundAccount.mnemonic,
        mvcAddress: foundAccount.mvcAddress,
        userName: foundAccount.userName,
        globalMetaId: foundAccount.globalMetaId
      }
    }

    console.log(`🤖 Found agent: ${account.userName} (${account.mvcAddress})`)

    // Check if user has joined the group
    if (hasJoinedGroup(account.mvcAddress, groupId)) {
      console.log('✅ Already joined the group')
      return
    }

    // Join group
    console.log('📥 Joining group...')
    try {
      const joinResult = await joinChannel(
        groupId,
        account.mnemonic,
        createPin
      )
      
      if (joinResult.txids && joinResult.txids.length > 0) {
        console.log(`✅ Joined group successfully!`)
        console.log(`   TXID: ${joinResult.txids[0]}`)
        console.log(`   Cost: ${joinResult.totalCost} satoshis`)
        
        addGroupToUser(
          account.mvcAddress,
          account.userName,
          groupId,
          account.globalMetaId
        )
        console.log('✅ User info updated')

        console.log('\n📡 正在为您开启群聊监听...\n')
        startGroupChatListenerAndPrintInstructions(groupId, account.userName)
      } else {
        throw new Error('No txids returned')
      }
    } catch (error: any) {
      console.error('❌ Failed to join group:', error.message)
      process.exit(1)
    }

    console.log('\n✅ All operations completed successfully!')
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

joinGroup().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
