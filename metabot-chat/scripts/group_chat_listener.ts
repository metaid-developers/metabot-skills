#!/usr/bin/env node

/**
 * 统一群聊监听脚本
 * 整合 metabot-chat 主要业务逻辑：
 * - 群聊消息拉取与解密
 * - 群聊记录读写（group-list-history.log）
 * - 群聊信息读写（config.json grouplastIndex）
 * - 检测到新消息时触发智能回复（chat_reply）
 * - 启动成功后一次握手反馈（打招呼 + 回应，或单 Agent 时打招呼 + 30 秒后在线确认）
 *
 * 当用户说「开启群聊」「监听群聊」「让 XX Agent 监听群聊信息」等时，
 * 由 skills 自动调用 run_group_chat_listener.sh 在后台启动本脚本。
 */

import {
  readConfig,
  writeConfig,
  isLateNightMode,
  fetchAndUpdateGroupHistory,
  migrateUserInfoProfileToAccount,
  getAgentsInGroup,
  filterAgentsWithBalance,
  findAccountByUsername,
  hasJoinedGroup,
  addGroupToUser,
} from './utils'
import { sendTextForChat, joinChannel } from './message'
import { spawn } from 'child_process'
import * as path from 'path'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch {
  createPin = null
}

const MIN_INTERVAL_MS = 30 * 1000   // 30 秒
const MAX_INTERVAL_MS = 60 * 1000   // 1 分钟
const LATE_NIGHT_MIN_INTERVAL_MS = 2 * 60 * 1000
const LATE_NIGHT_MAX_INTERVAL_MS = 4 * 60 * 1000
const LATE_NIGHT_REPLY_PROBABILITY = 0.3

function getRandomIntervalMs(): number {
  if (isLateNightMode()) {
    return Math.floor(
      LATE_NIGHT_MIN_INTERVAL_MS +
        Math.random() * (LATE_NIGHT_MAX_INTERVAL_MS - LATE_NIGHT_MIN_INTERVAL_MS)
    )
  }
  return Math.floor(
    MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS)
  )
}

/**
 * 群聊监听启动后的握手反馈：
 * - 若指定了某个 Agent 开启监听（specifiedAgent）：仅该 Agent 在群内发一条打招呼
 * - 未指定 Agent：不在群内发消息，仅在控制台打印「群聊监听已确认开启，接下来你可以指定某个 MetaBot 参与到群聊讨论中」
 */
async function runHandshake(
  groupId: string,
  secretKeyStr: string,
  specifiedAgent?: string
): Promise<void> {
  if (!specifiedAgent) {
    console.log('\n🤝 群聊监听已确认开启，接下来你可以指定某个 MetaBot 参与到群聊讨论中')
    return
  }

  if (!createPin) return
  const agents = getAgentsInGroup(groupId)
  const withBalance = agents.length > 0 ? await filterAgentsWithBalance(agents) : []
  // 指定了 Agent 时：仅当该 Agent 在群且余额检查明确显示不足时才跳过握手；否则仍尝试握手（含：未加群、或网络异常导致无法确认余额）
  const specifiedInAgents = agents.includes(specifiedAgent)
  if (specifiedInAgents && withBalance.length > 0 && !withBalance.includes(specifiedAgent)) {
    console.log(`\n⚠️ 指定 Agent「${specifiedAgent}」余额不足，跳过握手`)
    return
  }
  if (withBalance.length === 0) {
    console.log(`\n🤝 无法确认余额（可能网络异常），仍尝试由「${specifiedAgent}」执行握手…`)
  }

  const ensureJoined = async (name: string) => {
    const account = findAccountByUsername(name)
    if (!account) return false
    if (!hasJoinedGroup(account.mvcAddress, groupId)) {
      try {
        const joinResult = await joinChannel(groupId, account.mnemonic, createPin)
        if (joinResult.txids?.length) {
          addGroupToUser(account.mvcAddress, account.userName, groupId, account.globalMetaId)
        }
      } catch {
        return false
      }
    }
    return true
  }

  const send = async (name: string, text: string): Promise<boolean> => {
    const account = findAccountByUsername(name)
    if (!account) return false
    try {
      const result = await sendTextForChat(
        groupId,
        text,
        0,
        secretKeyStr,
        null,
        [],
        account.userName,
        account.mnemonic,
        createPin
      )
      if (result.txids?.length) {
        await fetchAndUpdateGroupHistory(groupId, secretKeyStr)
        return true
      }
    } catch (e: any) {
      console.error(`⚠️ 握手消息发送失败 (${name}):`, e?.message || e)
    }
    return false
  }

  if (!(await ensureJoined(specifiedAgent))) {
    console.log(`\n⚠️ 指定 Agent「${specifiedAgent}」加群/确认失败，跳过握手`)
    return
  }
  console.log(`\n🤝 握手反馈（指定 ${specifiedAgent}）：打一个招呼`)
  const sent = await send(specifiedAgent, '大家好～我来报个道哈～')
  if (!sent) {
    console.log(`\n⚠️ 握手消息发送未成功（可能余额不足或网络异常），请检查后重试`)
  }
}

async function runChatReply(agentName?: string): Promise<void> {
  const cwd = path.join(__dirname, '..')
  const args = ['ts-node', 'scripts/chat_reply.ts']
  const env = { ...process.env }
  if (agentName) env.AGENT_NAME = agentName
  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, {
      cwd,
      stdio: 'inherit',
      shell: true,
      env,
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`chat_reply exited with ${code}`))
    })
    child.on('error', reject)
  })
}

async function runDiscussionOnLatest(priorityAgent?: string): Promise<void> {
  const cwd = path.join(__dirname, '..')
  const args = ['ts-node', 'scripts/discussion_on_latest.ts']
  const env = { ...process.env }
  if (priorityAgent) env.PRIORITY_AGENT = priorityAgent
  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, {
      cwd,
      stdio: 'inherit',
      shell: true,
      env,
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`discussion_on_latest exited with ${code}`))
    })
    child.on('error', reject)
  })
}

async function pollOnce(
  groupId: string,
  secretKeyStr: string,
  agentName?: string
): Promise<void> {
  // 每次都先拉取并写入 group-list-history.log（开启监听后马上同步最新消息）
  const hadNewMessages = await fetchAndUpdateGroupHistory(groupId, secretKeyStr)

  if (hadNewMessages) {
    if (isLateNightMode() && Math.random() > LATE_NIGHT_REPLY_PROBABILITY) {
      console.log(
        `\n[${new Date().toLocaleTimeString('zh-CN')}] 🌙 深夜模式，跳过本次回复（保持安静）`
      )
      return
    }
    const isDiscussion = process.env.REPLY_MODE === 'discussion'
    console.log(
      `\n[${new Date().toLocaleTimeString('zh-CN')}] 📬 检测到新消息，触发${isDiscussion ? '话题讨论' : '群聊回复'}...`
    )
    try {
      if (isDiscussion) {
        await runDiscussionOnLatest(agentName)
      } else {
        await runChatReply(agentName)
      }
    } catch (e: any) {
      console.error(`⚠️  ${isDiscussion ? '话题讨论' : '群聊回复'}执行失败:`, e?.message || e)
    }
  }
}

async function scheduleNext(
  groupId: string,
  secretKeyStr: string,
  agentName?: string
): Promise<void> {
  const intervalMs = getRandomIntervalMs()
  const nextSec = Math.round(intervalMs / 1000)
  console.log(
    `\n⏰ 下次检测: ${nextSec} 秒后 (${new Date(Date.now() + intervalMs).toLocaleTimeString('zh-CN')})`
  )
  setTimeout(async () => {
    await pollOnce(groupId, secretKeyStr, agentName)
    scheduleNext(groupId, secretKeyStr, agentName)
  }, intervalMs)
}

async function main() {
  const config = readConfig()
  const groupId =
    process.env.GROUP_ID || process.argv[2] || config.groupId || ''
  const agentName = process.env.AGENT_NAME || process.argv[3] || undefined
  const secretKeyStr = groupId.substring(0, 16)

  if (!groupId) {
    console.error('❌ GROUP_ID 未配置，请在 .env、config.json 或参数中设置')
    process.exit(1)
  }

  // 若通过参数指定群 ID，写入 config 以保持同步
  if (process.env.GROUP_ID || process.argv[2]) {
    config.groupId = groupId
    writeConfig(config)
  }

  // 群聊启动阶段：userInfo 人设缺失时从 userInfo.json 平移到 account.json
  migrateUserInfoProfileToAccount()

  console.log('🔄 MetaBot 群聊监听已启动')
  console.log('   检测间隔: 30-60 秒随机（回复间隔控制在1分钟内）')
  console.log('   深夜模式(0-6点): 2-4 分钟间隔，30% 回复概率')
  console.log(`   群组: ${groupId}`)
  const isDiscussion = process.env.REPLY_MODE === 'discussion'
  if (isDiscussion) {
    console.log('   模式: 话题讨论（基于最新消息，所有 Agent 参与）')
    if (agentName) {
      console.log(`   优先开场: ${agentName}`)
    } else {
      console.log('   优先开场: 被 @ 的 Agent，否则随机')
    }
  } else if (agentName) {
    console.log(`   指定回复者: ${agentName}`)
  } else {
    console.log('   回复者: 所有群内 Agent（被 @ 优先，否则随机）')
  }
  console.log('   按 Ctrl+C 停止\n')

  // 启动成功后一次握手反馈（指定 Agent 时只打一个招呼；未指定时按原逻辑）
  await runHandshake(groupId, secretKeyStr, agentName).catch((e: any) => {
    console.error('⚠️ 握手反馈失败（不影响后续监听）:', e?.message || e)
  })

  await pollOnce(groupId, secretKeyStr, agentName)
  scheduleNext(groupId, secretKeyStr, agentName)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
