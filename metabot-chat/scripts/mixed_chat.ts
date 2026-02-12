#!/usr/bin/env node

/**
 * 混合群聊：2 个反驳型 Agent + 3 个非反驳型 Agent 畅所欲言
 * 反驳型：小橙、Nova、墨白
 * 非反驳型：肥猪王、AI Eason、AI Bear、大有益、Chloé、Satō
 * 每轮随机选一人发言，发言前后都会拉取并更新 group-list-history.log
 * 鼓励与群内非 Agent 用户互动，用 globalMetaId @ 提及
 */

import * as path from 'path'
import { getResolvedLLMConfig, generateChatReply, generateRebuttalReply } from './llm'
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
const NORMAL_AGENTS = ['肥猪王', 'AI Eason', 'AI Bear', '大有益', 'Chloé', 'Satō']
const METABOT_BASIC_KEYWORDS = ['metabot-basic', 'MetaBot', 'metabot-basic', 'MetaBotBasic']

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsMetaIDAgent(text: string): boolean {
  const lower = (text || '').toLowerCase()
  return METABOT_BASIC_KEYWORDS.some((k) => lower.includes(k.toLowerCase()))
}

function findMentionedAgent(entries: { content: string; userInfo?: { name?: string } }[], agentNames: string[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const content = (entries[i].content || '').trim()
    for (const name of agentNames) {
      if (!name || !name.trim()) continue
      const pattern = new RegExp(`@${escapeRegExp(name.trim())}(?:\\s|$|[，。！？、])`, 'i')
      if (pattern.test(content)) {
        return name.trim()
      }
    }
  }
  return null
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
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

  // 发言前必须拉取最新记录
  await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)

  const entries = getRecentChatEntriesWithSpeakers(GROUP_ID)
  const recentMessages = entries.map((e) => `${e.userInfo?.name || '未知'}: ${e.content}`)

  if (recentMessages.length === 0) {
    console.log('ℹ️  暂无群聊记录，跳过')
    return
  }

  // 混合池：2 反驳型 + 3 非反驳型
  const rebuttalWithBalance = await filterAgentsWithBalance(REBUTTAL_AGENTS)
  const normalWithBalance = await filterAgentsWithBalance(NORMAL_AGENTS)

  const selectedRebuttal = rebuttalWithBalance
    .sort(() => Math.random() - 0.5)
    .slice(0, 2)
  const selectedNormal = normalWithBalance
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)

  const mixedPool = [...selectedRebuttal, ...selectedNormal]
  if (mixedPool.length === 0) {
    console.log('ℹ️  无 Agent 余额充足，跳过')
    return
  }

  const allAgents = [...REBUTTAL_AGENTS, ...NORMAL_AGENTS]
  const mentionedAgent = findMentionedAgent(entries, allAgents)
  let agentName = mentionedAgent && mixedPool.includes(mentionedAgent)
    ? mentionedAgent
    : mentionedAgent && !mixedPool.includes(mentionedAgent) && mixedPool.length > 0
      ? pickRandom(mixedPool)
      : pickRandom(mixedPool)

  if (mentionedAgent && !mixedPool.includes(mentionedAgent)) {
    console.log(`   ℹ️  ${mentionedAgent} 余额不足或不在本池，从混合池选取`)
  }

  const isRebuttal = REBUTTAL_AGENTS.includes(agentName)
  const account = findAccountByUsername(agentName)
  if (!account) {
    console.error(`❌ 未找到账户: ${agentName}`)
    process.exit(1)
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

  const mentionEntry = [...entries].reverse().find((e) => containsMetaIDAgent(e.content))
  const hasMetaIDMention = !!mentionEntry
  let mentionTargetName = mentionEntry?.userInfo?.name
  let mentionTargetContent = mentionEntry?.content
  if (mentionedAgent) {
    const whoMentioned = [...entries].reverse().find((e) => {
      const c = (e.content || '').trim()
      return new RegExp(`@${escapeRegExp(mentionedAgent)}(?:\\s|$|[，。！？、])`, 'i').test(c)
    })
    if (whoMentioned) {
      mentionTargetName = whoMentioned.userInfo?.name
      mentionTargetContent = whoMentioned.content
    }
  }
  const hasMention = hasMetaIDMention || !!mentionedAgent

  // 边界能力 1：余额低于 5000 时，发送「提醒老板发钱」类消息
  const balance = await getMvcBalanceSafe(account.mvcAddress)
  const useLowBalanceMessage = balance !== null && balance < BALANCE_LOW_ALERT_THRESHOLD
  const useGoodnightMessage = !useLowBalanceMessage && isLateNightMode() && Math.random() < 0.3

  console.log(`📋 最近 ${recentMessages.length} 条消息`)
  console.log(`🤖 混合池: 反驳型[${selectedRebuttal.join('、')}] + 正常型[${selectedNormal.join('、')}]`)
  console.log(`🤖 本轮发言: ${agentName} (${isRebuttal ? '反驳型' : '正常型'})`)
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
  } else if (isRebuttal) {
    const result = await generateRebuttalReply(agentName, recentMessages, enrichedProfile, llmConfig)
    content = result.content
    mentionName = result.mentionName
  } else {
    const result = await generateChatReply(
      agentName,
      recentMessages,
      enrichedProfile,
      {
        hasMetaIDAgentMention: hasMention,
        mentionTargetName: mentionTargetName || undefined,
        mentionTargetContent: mentionTargetContent || undefined,
      },
      llmConfig
    )
    content = result.content
    mentionName = result.mentionName || (hasMention ? mentionTargetName : undefined)
  }
  if (mentionName && mentionName.trim().toLowerCase() === agentName.trim().toLowerCase()) {
    mentionName = undefined
    content = stripLeadingSelfMention(content, agentName)
  }

  let reply: import('./chat').ChatMessageItem | null = null
  let mentions: import('./message').Mention[] = []
  const targetName = mentionName
  if (targetName) {
    const targetEntry = entries.find(
      (e) => (e.userInfo?.name || '').trim().toLowerCase() === targetName.trim().toLowerCase()
    )
    if (targetEntry) {
      reply = { txId: targetEntry.txId } as import('./chat').ChatMessageItem
      const gid = targetEntry.globalMetaId || targetEntry.userInfo?.globalMetaId
      const targetUser = userInfo.userList.find(
        (u: any) => (u.userName || '').trim().toLowerCase() === targetName.trim().toLowerCase()
      )
      const globalMetaId = gid || targetUser?.globalmetaid
      if (globalMetaId) {
        mentions = getMention({
          globalMetaId,
          userName: targetEntry.userInfo?.name || targetUser?.userName || targetName,
        })
      }
    }
  }

  console.log(`\n💬 回复内容:\n   ${content}\n`)

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
      console.log(`⚠️ 发送未返回 txid，可能余额不足或网络异常`)
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
