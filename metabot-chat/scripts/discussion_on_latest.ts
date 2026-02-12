#!/usr/bin/env node

/**
 * 基于群聊最新消息发起话题讨论
 * - 话题来自最近几条消息内容
 * - 优先由被 @ 的 Agent 开场（话题公布者）
 * - 所有群内 Agent 参与讨论，每人有限次数发言
 *
 * 用法: npx ts-node scripts/discussion_on_latest.ts [groupId]
 *       环境变量 PRIORITY_AGENT 可指定优先开场者（与“被 @ 的 Agent”一致时由监听传入）
 */

import {
  readConfig,
  writeConfig,
  fetchAndUpdateGroupHistory,
  getRecentChatEntriesWithSpeakers,
  getAgentsInGroup,
  filterAgentsWithBalance,
  findMentionedAgent,
} from './utils'
import { runDiscussion } from './discussion'

const DEFAULT_GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'
const LATEST_MESSAGES_FOR_TOPIC = 5  // 用最近几条消息组成话题
const TARGET_MESSAGES_PER_AGENT = 2  // 每人最多发言次数（短讨论）

async function main() {
  const config = readConfig()
  const groupId = process.env.GROUP_ID || process.argv[2] || config.groupId || DEFAULT_GROUP_ID
  config.groupId = groupId
  writeConfig(config)

  const secretKeyStr = groupId.substring(0, 16)
  await fetchAndUpdateGroupHistory(groupId, secretKeyStr)

  const entries = getRecentChatEntriesWithSpeakers(groupId)
  if (entries.length === 0) {
    console.log('ℹ️  暂无群聊记录，跳过话题讨论')
    return
  }

  const agents = getAgentsInGroup(groupId)
  if (agents.length === 0) {
    console.error('❌ 群组中无 MetaBot，请先执行加群')
    process.exit(1)
  }

  const agentsWithBalance = await filterAgentsWithBalance(agents)
  if (agentsWithBalance.length === 0) {
    console.log('ℹ️  无 Agent 余额充足，跳过话题讨论')
    return
  }

  // 优先回复提及到 Agent 的消息：被 @ 的 Agent 作为话题公布者/开场
  const mentionedAgent = findMentionedAgent(entries, agents)
  const priorityAgent = process.env.PRIORITY_AGENT?.trim() || mentionedAgent
  const topicAnnouncer =
    priorityAgent && agentsWithBalance.includes(priorityAgent)
      ? priorityAgent
      : mentionedAgent && agentsWithBalance.includes(mentionedAgent)
        ? mentionedAgent
        : agentsWithBalance[0]

  const latestEntries = entries.slice(-LATEST_MESSAGES_FOR_TOPIC)
  const topicLines = latestEntries.map(
    (e) => `${e.userInfo?.name || '未知'}: ${(e.content || '').trim()}`
  )
  const topic = topicLines.length > 0
    ? `【群聊最新消息】\n${topicLines.join('\n')}`
    : '大家最近在聊什么？一起来聊聊吧。'

  console.log('🎯 基于最新群聊消息发起话题讨论')
  console.log(`   群组: ${groupId}`)
  console.log(`   话题来源: 最近 ${latestEntries.length} 条消息`)
  console.log(`   开场/优先: ${topicAnnouncer}${mentionedAgent ? `（检测到 @${mentionedAgent}）` : ''}`)
  console.log(`   参与者: ${agentsWithBalance.join(', ')}`)
  console.log(`   每人最多: ${TARGET_MESSAGES_PER_AGENT} 次发言\n`)

  await runDiscussion({
    topic,
    agents: agentsWithBalance,
    groupId,
    targetMessages: TARGET_MESSAGES_PER_AGENT,
    topicAnnouncer,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
