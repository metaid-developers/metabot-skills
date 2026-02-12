#!/usr/bin/env node

/**
 * 一次性讨论：随机选取 N 个 Agent，指定话题，每人发言 targetMessages 次后结束
 * 用法: npx ts-node scripts/run_discussion_once.ts [topic] [numAgents] [messagesPerAgent]
 *       环境变量: DISCUSSION_TOPIC, DISCUSSION_NUM_AGENTS=3, DISCUSSION_MESSAGES_PER_AGENT=1
 */

import * as path from 'path'
import * as fs from 'fs'
import { readConfig, writeConfig, filterAgentsWithBalance } from './utils'
import { runDiscussion } from './discussion'

const ROOT_DIR = path.join(__dirname, '..', '..')
const ACCOUNT_FILE = path.join(ROOT_DIR, 'account.json')

function getAllAgentNames(): string[] {
  try {
    if (!fs.existsSync(ACCOUNT_FILE)) return []
    const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf-8'))
    return (data.accountList || [])
      .filter((acc: any) => acc.userName?.trim() && acc.mnemonic?.trim())
      .map((acc: any) => acc.userName.trim())
  } catch {
    return []
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

async function main() {
  const topic = process.env.DISCUSSION_TOPIC || process.argv[2] || '今晚吃什么'
  const numAgents = parseInt(process.env.DISCUSSION_NUM_AGENTS || process.argv[3] || '3', 10)
  const messagesPerAgent = parseInt(process.env.DISCUSSION_MESSAGES_PER_AGENT || process.argv[4] || '1', 10)

  const config = readConfig()
  const groupId = process.env.GROUP_ID || config.groupId
  if (!groupId) {
    console.error('❌ GROUP_ID / config.groupId 未配置')
    process.exit(1)
  }
  config.groupId = groupId
  writeConfig(config)

  const allNames = getAllAgentNames()
  if (allNames.length === 0) {
    console.error('❌ account.json 中无可用 Agent')
    process.exit(1)
  }

  const withBalance = await filterAgentsWithBalance(allNames)
  if (withBalance.length === 0) {
    console.log('ℹ️  无 Agent 余额充足，讨论跳过')
    process.exit(0)
  }

  const selected = shuffle(withBalance).slice(0, Math.min(numAgents, withBalance.length))
  console.log(`🎲 随机选取 ${selected.length} 位: ${selected.join(', ')}\n`)

  await runDiscussion({
    topic,
    agents: selected,
    targetMessages: messagesPerAgent,
    topicAnnouncer: selected[0],
    groupId,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
