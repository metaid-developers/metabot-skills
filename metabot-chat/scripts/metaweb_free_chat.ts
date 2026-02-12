#!/usr/bin/env node

/**
 * MetaWeb 场景深夜群聊 - 自由讨论模式
 * 2 反驳型 + 3 非反驳型 Agent，以日常群聊形式自由讨论
 * 无议题形式、无发言次数限制，可提问、反驳、补充
 * 围绕：自然语言任务 → MCP 匹配 Agent → 私聊 → SPACE 支付 → 任务执行
 */

import * as path from 'path'
import * as fs from 'fs'
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
import { generateChatReply, generateRebuttalReply, getResolvedLLMConfig } from './llm'
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

const METAWEB_CONTEXT = `MetaWeb 白皮书核心要点：
- 基于 BIWChain 区块链操作系统的元宇宙公链，构建 Web3.0 可信数字价值交互网络
- 移动端区块链、分布式数字身份（DID）、RSD 关系对象存储、跨链互操作、DeFi/DPFi`

const METAWEB_TOPIC = `如何在 MetaWeb 上实现：用户或 Agent 通过自然语言下达任务 → 找到链上 Agent 分身 → MCP 接口返回匹配任务的 Agent 列表（如「编写 XX 前端网站」返回有编码技能的 Agent）→ Agent 决策选中乙方 → 私聊沟通需求 → 乙方 SKILLS 报价（如 1 SPACE）→ 甲方构造 rawTx 支付 → 乙方 MCP 验证 rawTx 真伪（p2pkh 输出、金额）→ 广播确认 → 乙方执行任务 → 私聊返回结果。

前置：Agent 私聊、验证交易 MCP、寻找 Agent MCP 已有。MetaWeb 白皮书可参考。讨论可行性、实现步骤、架构设计。`

async function extractPdfText(pdfPath: string): Promise<string | null> {
  try {
    const { spawn } = await import('child_process')
    const pdftotext = spawn('pdftotext', [pdfPath, '-'])
    let text = ''
    pdftotext.stdout?.on('data', (chunk) => { text += chunk })
    await new Promise<void>((resolve, reject) => {
      pdftotext.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pdftotext exit ${code}`))))
      pdftotext.on('error', reject)
    })
    return text.trim() || null
  } catch {
    return null
  }
}

async function getDiscussionTopic(): Promise<string> {
  const pdfPath = path.join(__dirname, '..', 'references', 'MetaWeb_Whitepaper.pdf')
  if (fs.existsSync(pdfPath)) {
    const pdfText = await extractPdfText(pdfPath)
    if (pdfText && pdfText.length > 500) {
      const excerpt = pdfText.slice(0, 2000) + (pdfText.length > 2000 ? '...' : '')
      return `${METAWEB_TOPIC}\n\n【MetaWeb 白皮书摘录】\n${excerpt}`
    }
  }
  return `${METAWEB_TOPIC}\n\n【MetaWeb 背景】${METAWEB_CONTEXT}`
}

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
  const discussionTopic = await getDiscussionTopic()

  await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)

  const entries = getRecentChatEntriesWithSpeakers(GROUP_ID)
  let recentMessages = entries.map((e) => `${e.userInfo?.name || '未知'}: ${e.content}`)

  // 无历史时用占位符，让 Agent 自然开启讨论
  if (recentMessages.length === 0) {
    recentMessages = ['（群内暂无消息，请自由发言开启对 MetaWeb 场景的讨论）']
  }

  const rebuttalWithBalance = await filterAgentsWithBalance(REBUTTAL_AGENTS)
  const normalWithBalance = await filterAgentsWithBalance(NORMAL_AGENTS)

  const selectedRebuttal = rebuttalWithBalance.sort(() => Math.random() - 0.5).slice(0, 2)
  const selectedNormal = normalWithBalance.sort(() => Math.random() - 0.5).slice(0, 3)
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

  const balance = await getMvcBalanceSafe(account.mvcAddress)
  const useLowBalanceMessage = balance !== null && balance < BALANCE_LOW_ALERT_THRESHOLD
  const useGoodnightMessage = !useLowBalanceMessage && isLateNightMode() && Math.random() < 0.3

  console.log(`📋 最近 ${entries.length} 条消息 | 话题: MetaWeb 场景自由讨论`)
  console.log(`🤖 混合池: 反驳型[${selectedRebuttal.join('、')}] + 正常型[${selectedNormal.join('、')}]`)
  console.log(`🤖 本轮发言: ${agentName} (${isRebuttal ? '反驳型' : '正常型'})`)
  if (useLowBalanceMessage) {
    console.log(`   💰 余额不足，发送低余额提示消息`)
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
    const result = await generateRebuttalReply(
      agentName,
      recentMessages,
      enrichedProfile,
      llmConfig,
      { discussionTopic }
    )
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
        discussionTopic,
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
      console.log(`⚠️ ${agentName} 发送失败，可能余额不足: ${msg}`)
    } else {
      console.log(`⚠️ 发送失败: ${msg}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
