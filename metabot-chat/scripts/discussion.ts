#!/usr/bin/env node

import * as path from 'path'
import { sendTextForChat } from './message'
import {
  readConfig,
  writeConfig,
  readUserInfo,
  addGroupToUser,
  hasJoinedGroup,
  fetchAndUpdateGroupHistory,
  getRecentChatContext,
  getRecentChatContextWithSpeakers,
  getRecentChatEntriesWithSpeakers,
  generateChatSummary,
  calculateEnthusiasmLevel,
  findAccountByUsername,
  readGroupListHistory,
  getEnrichedUserProfile,
  filterAgentsWithBalance,
  stripLeadingSelfMention,
} from './utils'
import {
  generateDiscussionMessage,
  shouldParticipateNow,
  calculateThinkingTime,
  getResolvedLLMConfig,
  LLMConfig,
} from './llm'
import { getMention } from './message'

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

import { joinChannel } from './message'

interface DiscussionState {
  topic: string
  agents: string[]
  groupId: string
  messagesPerAgent: Record<string, number>
  lastMessageTime: Record<string, number> // Track last message time for each agent
  targetMessages: number
  currentRound: number
  agentIndex: number
}

/**
 * Ensure agent joins the group
 */
async function ensureAgentJoined(
  agentName: string,
  account: any,
  groupId: string,
  secretKeyStr: string
): Promise<boolean> {
  if (hasJoinedGroup(account.mvcAddress, groupId)) {
    console.log(`✅ ${agentName} already joined the group`)
    return true
  }

  console.log(`📥 ${agentName} joining group...`)
  try {
    const joinResult = await joinChannel(groupId, account.mnemonic, createPin)
    if (joinResult.txids && joinResult.txids.length > 0) {
      console.log(`✅ ${agentName} joined successfully! TXID: ${joinResult.txids[0]}`)
      addGroupToUser(
        account.mvcAddress,
        account.userName,
        groupId,
        account.globalMetaId
      )
      return true
    }
  } catch (error: any) {
    console.error(`❌ ${agentName} failed to join:`, error.message)
    return false
  }
  return false
}

/**
 * Fetch and update latest messages（委托给统一策略）
 */
async function updateMessages(groupId: string, secretKeyStr: string): Promise<void> {
  await fetchAndUpdateGroupHistory(groupId, secretKeyStr)
}

/**
 * Agent sends a message in the discussion using LLM
 */
async function agentSpeak(
  agentName: string,
  topic: string,
  groupId: string,
  secretKeyStr: string,
  messageCount: number,
  state: DiscussionState,
  config: { llm?: Partial<LLMConfig> }
): Promise<boolean> {
  try {
    // Find account
    const account = findAccountByUsername(agentName)
    if (!account) {
      console.error(`❌ Account not found for: ${agentName}`)
      return false
    }

    const llmConfig = getResolvedLLMConfig(account, config)

    // Get user profile
    const userInfo = readUserInfo()
    const userProfile = userInfo.userList.find((u) => u.address === account.mvcAddress)
    if (!userProfile) {
      console.error(`❌ User profile not found for: ${agentName}`)
      return false
    }

    // 发言前拉取最新消息并写入 group-list-history.log
    await updateMessages(groupId, secretKeyStr)

    // Get context：更多历史消息（15-20条）以增强关联性
    const chatSummary = generateChatSummary()
    const recentEntries = getRecentChatEntriesWithSpeakers(groupId)
    const recentMessages = recentEntries.map(
      (e) => `${e.userInfo?.name || '未知'}: ${e.content}`
    )

    // Calculate enthusiasm level
    const enthusiasmLevel = calculateEnthusiasmLevel(userProfile)

    // 未发言过的 Agent 强制参与，确保每人都有机会
    const forceParticipate = messageCount === 0

    let participationDecision: { should: boolean; reason?: string } = { should: true, reason: '准备发言' }
    if (!forceParticipate) {
      const lastMessageTime = state.lastMessageTime[agentName]
      participationDecision = await shouldParticipateNow(
        agentName,
        topic,
        chatSummary,
        recentMessages,
        {
          ...userProfile,
          enthusiasmLevel,
        },
        lastMessageTime,
        15, // Minimum 15 seconds between messages
        llmConfig
      )
    }

    if (!participationDecision.should) {
      console.log(`\n⏸️  ${agentName} 决定暂不发言: ${participationDecision.reason || '需要更多思考时间'}`)
      return false
    }

    console.log(`\n💭 ${agentName} 正在思考... (${participationDecision.reason || '准备发言'})`)

    // Calculate thinking time (simulate human thinking)
    const thinkingTime = calculateThinkingTime(
      chatSummary.length + recentMessages.join(' ').length,
      'medium'
    )
    await new Promise((resolve) => setTimeout(resolve, thinkingTime))

    // Generate message using LLM（含话题性交互、反驳、口语化）
    console.log(`🤖 ${agentName} 正在生成回复...`)
    const enrichedProfile = getEnrichedUserProfile(userProfile, account)
    const { content: messageContent, mentionName } = await generateDiscussionMessage(
      agentName,
      topic,
      chatSummary,
      recentMessages,
      enrichedProfile,
      messageCount,
      llmConfig
    )
    let contentToSend = messageContent
    let mentionToUse = mentionName
    if (mentionToUse && mentionToUse.trim().toLowerCase() === agentName.trim().toLowerCase()) {
      mentionToUse = undefined
      contentToSend = stripLeadingSelfMention(contentToSend, agentName)
    }

    console.log(`\n💬 ${agentName} (第${messageCount + 1}次发言):`)
    console.log(`   ${contentToSend}`)

    // 解析 reply 与 mention：若 LLM 指定了 mentionName，则回复对方最后一条消息并 @ 对方
    let reply: import('./chat').ChatMessageItem | null = null
    let mentions: import('./message').Mention[] = []
    if (mentionToUse) {
      const targetEntry = [...recentEntries].reverse().find(
        (e) => (e.userInfo?.name || '').trim().toLowerCase() === mentionToUse!.trim().toLowerCase()
      )
      if (targetEntry) {
        reply = { txId: targetEntry.txId } as import('./chat').ChatMessageItem
        const gid = targetEntry.globalMetaId || targetEntry.userInfo?.globalMetaId
        const targetUser = readUserInfo().userList.find(
          (u) => (u.userName || '').trim().toLowerCase() === mentionToUse!.trim().toLowerCase()
        )
        const globalMetaId = gid || targetUser?.globalmetaid
        if (globalMetaId) {
          mentions = getMention({
            globalMetaId,
            userName: targetEntry.userInfo?.name || targetUser?.userName || mentionToUse,
          })
        }
      }
    }

    // Send message
    const result = await sendTextForChat(
      groupId,
      contentToSend,
      0,
      secretKeyStr,
      reply,
      mentions,
      account.userName,
      account.mnemonic,
      createPin
    )

    if (result.txids && result.txids.length > 0) {
      console.log(`   ✅ 发送成功! TXID: ${result.txids[0]}`)
      await fetchAndUpdateGroupHistory(groupId, secretKeyStr)

      // Update last message time
      state.lastMessageTime[agentName] = Date.now() / 1000

      // Wait a bit before next message (random interval between 5-15 seconds)
      const waitTime = 5000 + Math.random() * 10000
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      return true
    }

    return false
  } catch (error: any) {
    const msg = error?.message || String(error)
    if (msg.includes('balance') || msg.includes('insufficient') || msg.includes('余额')) {
      console.log(`⚠️ ${agentName} 发送失败，可能余额不足: ${msg}`)
    } else {
      console.log(`⚠️ ${agentName} 发言失败: ${msg}`)
    }
    return false
  }
}

/**
 * Generate summary and MVP selection after discussion using LLM
 */
async function generateDiscussionSummaryWithMVP(
  topic: string,
  agents: string[],
  messagesPerAgent: Record<string, number>,
  groupId: string,
  llmConfig: Partial<LLMConfig>
): Promise<{ summary: string; mvp: string }> {
  const totalMessages = Object.values(messagesPerAgent).reduce((a, b) => a + b, 0)

  // Get discussion content with speaker names for MVP evaluation
  const historyEntries = readGroupListHistory()
    .filter((e) => e.groupId === groupId)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
  const discussionText = historyEntries
    .map((e) => `${e.userInfo?.name || '未知'}: ${e.content}`)
    .join('\n')

  try {
    const { generateLLMResponse } = await import('./llm')
    const messages = [
      {
        role: 'system' as const,
        content: `你是一个讨论总结与评选助手。请为一次群聊讨论生成总结，并评选出论点最鲜明的一人作为本场讨论MVP。
总结要求：100-200字，概括讨论要点。
MVP评选：从参与者中选出一位论点最鲜明、最有洞察力的参与者，说明评选理由（1-2句话）。`,
      },
      {
        role: 'user' as const,
        content: `讨论议题：${topic}

参与者及发言次数：${agents.map((a) => `${a}(${messagesPerAgent[a] || 0}次)`).join('、')}
总发言数：${totalMessages}次

讨论内容：
${discussionText || '（无具体内容）'}

请按以下格式回复：
【讨论总结】
（此处写总结内容）

【本场MVP】
（参与者姓名）：（简要评选理由）`,
      },
    ]

    const response = await generateLLMResponse(messages, { ...llmConfig, maxTokens: 600 })
    const content = response.content.trim()

    // Parse MVP from response
    let mvp = agents[0]
    const mvpMatch = content.match(/【本场MVP】\s*\n?\s*([^：:]+)[：:]/)
    if (mvpMatch) {
      const candidate = mvpMatch[1].trim()
      if (agents.includes(candidate)) {
        mvp = candidate
      }
    }

    return { summary: content, mvp }
  } catch (error) {
    // Fallback
    const fallbackSummary = `关于"${topic}"的讨论总结：\n\n本次讨论共有${agents.length}位参与者，共发表${totalMessages}条意见。\n\n${agents.map((agent) => `- ${agent}: ${messagesPerAgent[agent] || 0}次发言`).join('\n')}\n\n通过这次深入讨论，我们从多个角度探讨了这个重要话题。\n\n【本场MVP】${agents[0]}：感谢大家的精彩发言。`
    return { summary: fallbackSummary, mvp: agents[0] }
  }
}

/** 默认群 ID（🤖MetaBot 畅聊群） */
const DEFAULT_GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'

export interface RunDiscussionOverrides {
  topic?: string
  agents?: string[]
  targetMessages?: number
  topicAnnouncer?: string
  groupId?: string
  /** 讨论总时长（毫秒），超时后结束讨论 */
  maxDurationMs?: number
  /** 过半时由主持人发送的下半场提示文案（与 maxDurationMs 搭配使用） */
  halfTimeMessage?: string
  /** 负责发送总结的 Agent（默认大有益） */
  summaryAgent?: string
}

/**
 * Main discussion function
 * @param overrides - Optional overrides: { topic, agents, targetMessages, topicAnnouncer, groupId }
 */
export async function runDiscussion(overrides?: RunDiscussionOverrides) {
  const groupId = overrides?.groupId || DEFAULT_GROUP_ID
  let topic = '有了AI人类就不需要学习了?'
  let allAgents = ['大有益', 'Chloé', 'Satō', '肥猪王', 'AI Bear', 'AI Eason']
  let targetMessages = 8
  if (overrides) {
    if (overrides.topic) topic = overrides.topic
    if (overrides.agents) allAgents = overrides.agents
    if (overrides.targetMessages != null) targetMessages = overrides.targetMessages
  }
  const agents = overrides?.agents
    ? await filterAgentsWithBalance(overrides.agents)
    : await filterAgentsWithBalance(allAgents)
  if (agents.length === 0) {
    console.log('ℹ️  无 Agent 余额充足，讨论任务跳过')
    return
  }
  const topicAnnouncer = overrides?.topicAnnouncer ?? (agents.includes('大有益') ? '大有益' : agents[0])
  const maxDurationMs = overrides?.maxDurationMs
  const halfTimeMessage = overrides?.halfTimeMessage
  const summaryAgentOverride = overrides?.summaryAgent

  console.log('🎯 开始智能讨论任务')
  console.log(`📋 议题: ${topic.substring(0, 80)}${topic.length > 80 ? '...' : ''}`)
  console.log(`👥 参与者: ${agents.join(', ')}`)
  console.log(`🎯 目标: 每人最多发表${targetMessages}次见解`)
  console.log(`📢 开场: ${topicAnnouncer} 公布议题`)
  if (maxDurationMs) console.log(`⏰ 讨论时长: ${Math.round(maxDurationMs / 60000)} 分钟，上下半场各约 ${Math.round(maxDurationMs / 120000)} 分钟`)
  console.log(`🤖 使用 LLM: 按 account/config 解析（默认见上）\n`)

  // Get LLM config（默认用 config/env；单次发言时按 account 优先见 getResolvedLLMConfig）
  const config = readConfig()
  config.groupId = groupId
  writeConfig(config)

  const defaultLlmConfig = getResolvedLLMConfig(undefined, config)

  // Check LLM configuration
  if (!defaultLlmConfig.apiKey) {
    console.error('❌ LLM API key not configured!')
    console.error('   请设置 .env 中 DEEPSEEK_API_KEY / OPENAI_API_KEY / CLAUDE_API_KEY / GEMINI_API_KEY 之一')
    console.error('   或在 account.json 的 accountList[].llm 或 config.json 中配置')
    process.exit(1)
  }

  console.log(`✅ LLM 默认: ${defaultLlmConfig.provider} (${defaultLlmConfig.model || 'default'})\n`)

  const secretKeyStr = groupId.substring(0, 16)
  const state: DiscussionState = {
    topic,
    agents,
    groupId,
    messagesPerAgent: {},
    lastMessageTime: {},
    targetMessages,
    currentRound: 0,
    agentIndex: 0,
  }

  // Initialize message counts and last message times
  agents.forEach((agent) => {
    state.messagesPerAgent[agent] = 0
    state.lastMessageTime[agent] = 0
  })

  // Ensure all agents join the group
  console.log('📥 检查并加入群组...\n')
  for (const agentName of agents) {
    const account = findAccountByUsername(agentName)
    if (!account) {
      console.log(`⚠️ Account not found for: ${agentName}，跳过`)
      continue
    }

    const joined = await ensureAgentJoined(agentName, account, groupId, secretKeyStr)
    if (!joined) {
      console.log(`⚠️ ${agentName} 加群失败，跳过`)
    }

    // Wait a bit between joins
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  console.log('\n✅ 所有参与者已加入群组\n')

  // Step 1: AI Eason 公布议题
  console.log(`📢 ${topicAnnouncer} 公布议题...\n`)
  const announcerAccount = findAccountByUsername(topicAnnouncer)
  if (announcerAccount) {
    const topicPreview = topic.length > 150 ? topic.slice(0, 150) + '...' : topic
    const announcementText = `大家好！我是本场主持${topicAnnouncer}。今天想和大家讨论一个议题：**${topicPreview}**。希望大家能结合自身的设定，畅所欲言，每人最多发表${targetMessages}次见解。让我们开始吧！`
    try {
      const announceResult = await sendTextForChat(
        groupId,
        announcementText,
        0,
        secretKeyStr,
        null,
        [],
        announcerAccount.userName,
        announcerAccount.mnemonic,
        createPin
      )
      if (announceResult.txids && announceResult.txids.length > 0) {
        console.log(`✅ 议题公布成功! TXID: ${announceResult.txids[0]}\n`)
        await fetchAndUpdateGroupHistory(groupId, secretKeyStr)
      }
      // 拉取最新消息（含刚发的公告）
      await updateMessages(groupId, secretKeyStr)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    } catch (error: any) {
      console.error(`❌ 议题公布失败:`, error.message)
    }
  }

  console.log('💬 开始智能讨论...\n')

  // Discussion loop
  let round = 0
  let consecutiveSkips = 0
  const maxConsecutiveSkips = agents.length * 2 // Allow some skips
  const startTime = Date.now()
  let halfTimeSent = false

  while (true) {
    // 若设置了总时长，到点结束
    if (maxDurationMs && Date.now() - startTime >= maxDurationMs) {
      console.log('\n⏰ 讨论时间到，结束讨论\n')
      break
    }

    // 下半场提示：过半时由主持人发一条
    if (maxDurationMs && halfTimeMessage && !halfTimeSent && Date.now() - startTime >= maxDurationMs / 2) {
      halfTimeSent = true
      const announcerAcc = findAccountByUsername(topicAnnouncer)
      if (announcerAcc) {
        try {
          const sent = await sendTextForChat(
            groupId,
            halfTimeMessage,
            0,
            secretKeyStr,
            null,
            [],
            announcerAcc.userName,
            announcerAcc.mnemonic,
            createPin
          )
          if (sent.txids?.length) {
            console.log(`\n📢 ${topicAnnouncer} 宣布下半场开始\n`)
            await fetchAndUpdateGroupHistory(groupId, secretKeyStr)
          }
        } catch (e: any) {
          console.warn('⚠️ 下半场提示发送失败:', e?.message || e)
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    // Check if all agents reached target
    const allComplete = agents.every((agent) => (state.messagesPerAgent[agent] || 0) >= targetMessages)

    if (allComplete) {
      console.log('\n✅ 所有参与者已完成目标发言次数\n')
      break
    }

    // Round-robin: each agent speaks in turn
    let roundHasActivity = false
    for (let i = 0; i < agents.length; i++) {
      const agentName = agents[i]
      const currentCount = state.messagesPerAgent[agentName] || 0

      // Skip if already reached target
      if (currentCount >= targetMessages) {
        continue
      }

      // Agent speaks (or decides to skip)，按该 Agent 的 account.llm 优先解析配置
      const success = await agentSpeak(agentName, topic, groupId, secretKeyStr, currentCount, state, config)

      if (success) {
        state.messagesPerAgent[agentName] = currentCount + 1
        console.log(`   📊 进度: ${agentName} ${currentCount + 1}/${targetMessages}`)
        roundHasActivity = true
        consecutiveSkips = 0
      } else {
        consecutiveSkips++
      }

      // Wait between agents (shorter wait if agent skipped)
      const waitTime = success ? 3000 + Math.random() * 2000 : 1000
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    // If too many consecutive skips, break to avoid infinite loop
    if (consecutiveSkips >= maxConsecutiveSkips) {
      console.log(`\n⚠️  连续${consecutiveSkips}次无人发言，讨论可能已结束\n`)
      break
    }

    if (roundHasActivity) {
      round++
      console.log(`\n📊 第${round}轮完成，当前进度:`)
      agents.forEach((agent) => {
        const count = state.messagesPerAgent[agent] || 0
        console.log(`   ${agent}: ${count}/${targetMessages}`)
      })
      console.log('')
    }
  }

  // 生成总结前拉取最新消息
  await updateMessages(groupId, secretKeyStr)

  // Generate summary and MVP selection
  console.log('📝 生成讨论总结与MVP评选...\n')
  const { summary, mvp } = await generateDiscussionSummaryWithMVP(
    topic,
    agents,
    state.messagesPerAgent,
    groupId,
    defaultLlmConfig
  )

  // Send summary: 优先使用 overrides.summaryAgent，否则大有益或第一个参与者
  const summaryAgent =
    summaryAgentOverride && agents.includes(summaryAgentOverride)
      ? summaryAgentOverride
      : agents.includes('大有益')
        ? '大有益'
        : agents[0]
  const account = findAccountByUsername(summaryAgent)
  if (account) {
    const finalMessage = `${summary}\n\n🏆 本场讨论MVP：**${mvp}** — 论点最鲜明，感谢精彩发言！`
    console.log(`📤 ${summaryAgent} 作为主持人发送总结:\n${finalMessage}\n`)

    try {
      const result = await sendTextForChat(
        groupId,
        finalMessage,
        0,
        secretKeyStr,
        null,
        [],
        account.userName,
        account.mnemonic,
        createPin
      )

      if (result.txids && result.txids.length > 0) {
        console.log(`✅ 总结发送成功! TXID: ${result.txids[0]}\n`)
        await fetchAndUpdateGroupHistory(groupId, secretKeyStr)
      }
    } catch (error: any) {
      console.error('❌ Failed to send summary:', error.message)
    }
  }

  console.log('✅ 讨论任务完成!')
  console.log('\n📊 最终统计:')
  agents.forEach((agent) => {
    console.log(`   ${agent}: ${state.messagesPerAgent[agent] || 0}次发言`)
  })
  console.log(`\n🏆 本场MVP: ${mvp}`)
}

// Run discussion when executed directly (support CLI overrides: METAWEB_TOPIC, METAWEB_AGENTS env vars)
const metawebTopic = process.env.METAWEB_TOPIC
const metawebAgents = process.env.METAWEB_AGENTS
const overrides: RunDiscussionOverrides | undefined = metawebTopic || metawebAgents
  ? {
      topic: metawebTopic,
      agents: metawebAgents ? metawebAgents.split(',').map((s) => s.trim()) : undefined,
      targetMessages: process.env.METAWEB_TARGET_MESSAGES ? parseInt(process.env.METAWEB_TARGET_MESSAGES, 10) : undefined,
      topicAnnouncer: process.env.METAWEB_ANNOUNCER,
    }
  : undefined

if (require.main === module) {
  runDiscussion(overrides).catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
