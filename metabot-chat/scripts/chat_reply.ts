#!/usr/bin/env node

/**
 * 🤖MetaBot 畅聊群 智能回复
 * 根据最近30条群聊记录：
 * - 若有人提及 metabot-basic → 重点回复该人
 * - 若无提及 → 日常聊天，自然回复，不刻意展开话题
 */

import * as path from 'path'
import { getChannelNewestMessages } from './chat'
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
  getAgentsInGroup,
  filterAgentsWithBalance,
  getMvcBalanceSafe,
  BALANCE_LOW_ALERT_THRESHOLD,
  getLowBalanceMessage,
  isLateNightMode,
  getGoodnightMessage,
  stripLeadingSelfMention,
} from './utils'
import { generateChatReply, getResolvedLLMConfig } from './llm'
import { joinChannel } from './message'
import { getGroupLogPath, getHistoryLogEntries } from './chat-config'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (error) {
  console.error('❌ Failed to load metabot-basic:', error)
  process.exit(1)
}

/** 默认群 ID，优先使用 readConfig().groupId */
const DEFAULT_GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'
const METABOT_BASIC_KEYWORDS = ['metabot-basic', 'MetaBot', 'metabot-basic', 'MetaBotBasic']

function containsMetaIDAgent(text: string): boolean {
  const lower = (text || '').toLowerCase()
  return METABOT_BASIC_KEYWORDS.some((k) => lower.includes(k.toLowerCase()))
}

/** 检测消息中是否 @提及 了某 metabot-basic，返回被提及的 Agent 名（取最近一条） */
function findMentionedAgent(entries: { content: string; userInfo?: { name?: string } }[], agentNames: string[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const content = (entries[i].content || '').trim()
    for (const name of agentNames) {
      if (!name || !name.trim()) continue
      // 匹配 @AgentName 或 @AgentName 后面跟空格/标点
      const pattern = new RegExp(`@${escapeRegExp(name.trim())}(?:\\s|$|[，。！？、])`, 'i')
      if (pattern.test(content)) {
        return name.trim()
      }
    }
  }
  return null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pickRandomAgent(agents: string[]): string {
  return agents[Math.floor(Math.random() * agents.length)]
}

async function main() {
  // 优先从环境变量读取（避免 spawn shell 将 "AI Eason" 拆成 argv[2]="AI" argv[3]="Eason"）
  const specifiedAgent = (process.env.AGENT_NAME || process.argv[2])?.trim()

  const config = readConfig()
  // 获取 groupId 优先级：1) env.GROUP_ID 2) 当前操作用户在 userInfo.groupList 中的群 3) config.groupId 4) 默认
  let GROUP_ID = (process.env.GROUP_ID || '').trim()
  if (!GROUP_ID && specifiedAgent) {
    const userInfo = readUserInfo()
    const currentUser = userInfo.userList.find(
      (u) => u.userName && u.userName.trim().toLowerCase() === specifiedAgent.trim().toLowerCase()
    )
    if (currentUser?.groupList?.length) {
      const configGroupId = (config.groupId || '').trim()
      GROUP_ID = currentUser.groupList.includes(configGroupId)
        ? configGroupId
        : currentUser.groupList[0].trim()
    }
  }
  if (!GROUP_ID) {
    GROUP_ID = (config.groupId || DEFAULT_GROUP_ID).trim()
  }
  config.groupId = GROUP_ID
  writeConfig(config)

  const defaultLlm = getResolvedLLMConfig(undefined, config)
  if (!defaultLlm.apiKey) {
    console.error('❌ 请配置 .env 中 DEEPSEEK_API_KEY / GEMINI_API_KEY 等或 account.json/config.json llm')
    process.exit(1)
  }

  const secretKeyStr = GROUP_ID.substring(0, 16)
  await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)

  // 优先从 chat-history 群聊 log 读取（unified_chat_listener 写入源），确保 Socket 推送的新消息可被回复
  const groupLogPath = getGroupLogPath(GROUP_ID)
  let entries = getHistoryLogEntries(groupLogPath, 30)
    .filter((e) => e.content && (e.content as string).trim())
  if (entries.length === 0) {
    entries = getRecentChatEntriesWithSpeakers(GROUP_ID)
  }
  const recentMessages = entries.map((e) => `${e.userInfo?.name || '未知'}: ${e.content}`)

  if (recentMessages.length === 0) {
    console.log('ℹ️  暂无群聊记录，跳过')
    return
  }

  const agents = getAgentsInGroup(GROUP_ID)
  if (agents.length === 0) {
    console.error('❌ 群组中无 MetaBot，请先执行加群')
    process.exit(1)
  }

  // 过滤出 MVC 余额充足的 Agent，余额不足的打印提示并排除，不抛错
  const agentsWithBalance = await filterAgentsWithBalance(agents)
  if (agentsWithBalance.length === 0) {
    console.log('ℹ️  无 Agent 余额充足，跳过本次回复')
    return
  }

  // 优先检测 @提及某 Agent：若有人 @小橙、@Nova 等，由被提及的 Agent 回复
  const mentionedAgent = findMentionedAgent(entries, agents)
  let agentName: string
  if (specifiedAgent) {
    if (!agentsWithBalance.includes(specifiedAgent)) {
      if (!agents.includes(specifiedAgent)) {
        console.error(`❌ 未找到指定的 Agent: ${specifiedAgent}`)
        process.exit(1)
      }
      console.error(`❌ ${specifiedAgent} 余额不足，无法发言`)
      process.exit(1)
    }
    agentName = specifiedAgent
  } else {
    agentName = mentionedAgent || pickRandomAgent(agentsWithBalance)
    // 若被 @ 的 Agent 余额不足，从余额充足的 Agent 中重选
    if (mentionedAgent && !agentsWithBalance.includes(mentionedAgent)) {
      console.log(`   ℹ️  ${mentionedAgent} 余额不足，从其他 Agent 中选取`)
      agentName = pickRandomAgent(agentsWithBalance)
    }
  }

  const mentionEntry = [...entries].reverse().find((e) => containsMetaIDAgent(e.content))
  const hasMetaIDMention = !!mentionEntry
  let mentionTargetName = mentionEntry?.userInfo?.name
  let mentionTargetContent = mentionEntry?.content

  // 若有人 @提及了某 Agent，该 Agent 应回复提及者
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
  const account = findAccountByUsername(agentName)
  if (!account) {
    console.error(`❌ 未找到账户: ${agentName}`)
    process.exit(1)
  }

  const llmConfig = getResolvedLLMConfig(account, config)

  // 禁止自己回复自己：若最新一条消息来自本 Agent，跳过本次回复
  if (entries.length > 0) {
    const lastEntry = entries[entries.length - 1]
    const lastSpeakerName = (lastEntry.userInfo?.name || '').trim().toLowerCase()
    const lastIsSelf =
      lastSpeakerName === agentName.trim().toLowerCase() || lastEntry.address === account.mvcAddress
    if (lastIsSelf) {
      console.log('   ⏭️  最新一条消息来自本 Agent，跳过回复（禁止自己回复自己）')
      return
    }
  }

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
  if (mentionedAgent) {
    console.log(`   ✅ 检测到 @${mentionedAgent}，由 ${agentName} 回复 ${mentionTargetName || '提及者'}`)
  } else if (hasMetaIDMention) {
    console.log(`   ✅ 检测到提及 MetaBot，由 ${mentionTargetName} 发起`)
  } else {
    console.log(`   ℹ️  无提及，随机选择 Agent 进行日常聊天`)
  }
  console.log(`🤖 回复者: ${agentName}`)
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
    mentionName = result.mentionName
    // 禁止 @自己：若 LLM 返回 @ 的是自己，清除 mention 并去掉内容中的 @自己
    if (mentionName && mentionName.trim().toLowerCase() === agentName.trim().toLowerCase()) {
      mentionName = undefined
      content = stripLeadingSelfMention(content, agentName)
    }
  }

  let reply: import('./chat').ChatMessageItem | null = null
  let mentions: import('./message').Mention[] = []
  const targetName = mentionName || (hasMention ? mentionTargetName : undefined)
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
