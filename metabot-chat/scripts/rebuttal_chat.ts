#!/usr/bin/env node

/**
 * 反驳型 Agent 群聊 - 小橙、Nova、墨白
 * 检测到新消息后，随机选一人进行反驳、唱反调、制造争议
 */

import * as path from 'path'
import { sendTextForChat, getMention } from './message'
import {
  readConfig,
  writeConfig,
  readUserInfo,
  addGroupToUser,
  hasJoinedGroup,
  fetchAndUpdateGroupHistory,
  getRecentChatEntriesWithSpeakers,
  findAccountByUsername,
  getEnrichedUserProfile,
  filterAgentsWithBalance,
  getMvcBalanceSafe,
  BALANCE_LOW_ALERT_THRESHOLD,
  getLowBalanceMessage,
  isLateNightMode,
  getGoodnightMessage,
  stripLeadingSelfMention,
} from './utils'
import { generateRebuttalReply, getResolvedLLMConfig } from './llm'
import { joinChannel } from './message'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (error) {
  console.error('❌ Failed to load metabot-basic:', error)
  process.exit(1)
}

const GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'
const REBUTTAL_AGENTS = ['小橙', 'Nova', '墨白']

function pickRandomAgent(agents: string[]): string {
  return agents[Math.floor(Math.random() * agents.length)]
}

async function main() {
  const config = readConfig()
  config.groupId = GROUP_ID
  writeConfig(config)

  const defaultLlm = getResolvedLLMConfig(undefined, config)
  if (!defaultLlm.apiKey) {
    console.error('❌ 请配置 .env 中 LLM API Key 或 account.json/config.json llm')
    process.exit(1)
  }

  const secretKeyStr = GROUP_ID.substring(0, 16)
  await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)

  const entries = getRecentChatEntriesWithSpeakers(GROUP_ID)
  const recentMessages = entries.map((e) => `${e.userInfo?.name || '未知'}: ${e.content}`)

  if (recentMessages.length === 0) {
    console.log('ℹ️  暂无群聊记录，跳过')
    return
  }

  const agentsWithBalance = await filterAgentsWithBalance(REBUTTAL_AGENTS)
  if (agentsWithBalance.length === 0) {
    console.log('ℹ️  反驳型 Agent 余额均不足，跳过')
    return
  }

  const agentName = pickRandomAgent(agentsWithBalance)
  const account = findAccountByUsername(agentName)
  if (!account) {
    console.error(`❌ 未找到账户: ${agentName}`)
    return
  }

  const llmConfig = getResolvedLLMConfig(account, config)

  if (!hasJoinedGroup(account.mvcAddress, GROUP_ID)) {
    const joinResult = await joinChannel(GROUP_ID, account.mnemonic, createPin)
    if (joinResult.txids?.length) {
      addGroupToUser(account.mvcAddress, account.userName, GROUP_ID, account.globalMetaId)
    }
  }

  const userInfo = readUserInfo()
  const userProfile = userInfo.userList.find((u: any) => u.address === account.mvcAddress)
  const enrichedProfile = getEnrichedUserProfile(userProfile, account)

  // 边界能力 1：余额低于 5000 时，发送「提醒老板发钱」类消息
  const balance = await getMvcBalanceSafe(account.mvcAddress)
  const useLowBalanceMessage = balance !== null && balance < BALANCE_LOW_ALERT_THRESHOLD
  const useGoodnightMessage = !useLowBalanceMessage && isLateNightMode() && Math.random() < 0.3

  console.log(`📋 最近 ${recentMessages.length} 条消息`)
  console.log(`🤖 反驳者: ${agentName}`)
  if (useLowBalanceMessage) {
    console.log(`   💰 余额不足 (${balance} < ${BALANCE_LOW_ALERT_THRESHOLD})，发送低余额提示消息`)
  }
  if (useGoodnightMessage) {
    console.log(`   🌙 深夜模式，发送晚安休息消息`)
  }

  let content: string
  let mentionName: string | undefined

  if (useLowBalanceMessage) {
    content = getLowBalanceMessage(agentName)
    mentionName = undefined
  } else if (useGoodnightMessage) {
    content = getGoodnightMessage(agentName)
    mentionName = undefined
  } else {
    const result = await generateRebuttalReply(
      agentName,
      recentMessages,
      enrichedProfile,
      llmConfig
    )
    content = result.content
    mentionName = result.mentionName
    if (mentionName && mentionName.trim().toLowerCase() === agentName.trim().toLowerCase()) {
      mentionName = undefined
      content = stripLeadingSelfMention(content, agentName)
    }
  }

  let reply: import('./chat').ChatMessageItem | null = null
  let mentions: import('./message').Mention[] = []
  if (mentionName) {
    const targetEntry = entries.find(
      (e) => (e.userInfo?.name || '').trim().toLowerCase() === mentionName.trim().toLowerCase()
    )
    if (targetEntry) {
      reply = { txId: targetEntry.txId } as import('./chat').ChatMessageItem
      const gid = targetEntry.globalMetaId || targetEntry.userInfo?.globalMetaId
      const targetUser = userInfo.userList.find(
        (u: any) => (u.userName || '').trim().toLowerCase() === mentionName.trim().toLowerCase()
      )
      const globalMetaId = gid || targetUser?.globalmetaid
      if (globalMetaId) {
        mentions = getMention({
          globalMetaId,
          userName: targetEntry.userInfo?.name || targetUser?.userName || mentionName,
        })
      }
    }
  }

  console.log(`\n💬 反驳内容:\n   ${content}\n`)

  try {
    const result = await sendTextForChat(
      GROUP_ID,
      content,
      0,
      secretKeyStr,
      reply,
      mentions,
      account.userName,
      account.mnemonic,
      createPin
    )
    if (result.txids?.length) {
      console.log(`✅ 发送成功! TXID: ${result.txids[0]}`)
      await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)
    } else {
      console.log(`⚠️ 发送未返回 txid`)
    }
  } catch (error: any) {
    const msg = error?.message || String(error)
    if (msg.includes('balance') || msg.includes('insufficient') || msg.includes('余额')) {
      console.log(`⚠️ ${agentName} (${account.mvcAddress}) 发送失败，可能余额不足: ${msg}`)
    } else {
      console.log(`⚠️ 发送失败: ${msg}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
