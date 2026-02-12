#!/usr/bin/env node

/**
 * 群聊轮询定时任务
 * 每隔 30-60 秒随机检测一次（回复间隔控制在1分钟内），若有新消息则随机选一个 MetaBot 发言
 * 若消息中 @提及 某 Agent，则由该 Agent 回复
 */

import { getChannelNewestMessages } from './chat'
import { readConfig, isLateNightMode } from './utils'

const GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'
const MIN_INTERVAL_MS = 30 * 1000   // 30 秒
const MAX_INTERVAL_MS = 60 * 1000  // 1 分钟
const LATE_NIGHT_MIN_INTERVAL_MS = 2 * 60 * 1000   // 深夜模式：2 分钟
const LATE_NIGHT_MAX_INTERVAL_MS = 4 * 60 * 1000   // 深夜模式：4 分钟
const LATE_NIGHT_REPLY_PROBABILITY = 0.3          // 深夜模式：仅 30% 概率触发回复

function getRandomIntervalMs(): number {
  if (isLateNightMode()) {
    return Math.floor(LATE_NIGHT_MIN_INTERVAL_MS + Math.random() * (LATE_NIGHT_MAX_INTERVAL_MS - LATE_NIGHT_MIN_INTERVAL_MS))
  }
  return Math.floor(MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS))
}

async function hasNewMessages(): Promise<boolean> {
  const config = readConfig()
  const nextStart = config.grouplastIndex + 1
  const startIndex = String(Math.max(1, nextStart))

  try {
    const data = await getChannelNewestMessages({
      groupId: GROUP_ID,
      size: 30,
      startIndex,
    })
    return !!(data?.list && data.list.length > 0)
  } catch {
    return false
  }
}

async function runChatReply(): Promise<void> {
  const { spawn } = await import('child_process')
  const path = await import('path')
  const cwd = path.join(__dirname, '..')
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['ts-node', 'scripts/chat_reply.ts'], {
      cwd,
      stdio: 'inherit',
      shell: true,
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`chat_reply exited with ${code}`))
    })
    child.on('error', reject)
  })
}

async function pollOnce(): Promise<void> {
  const hasNew = await hasNewMessages()
  if (hasNew) {
    // 深夜模式：降低回复概率，保持群相对安静
    if (isLateNightMode() && Math.random() > LATE_NIGHT_REPLY_PROBABILITY) {
      console.log(`\n[${new Date().toLocaleTimeString('zh-CN')}] 🌙 深夜模式，跳过本次回复（保持安静）`)
      return
    }
    console.log(`\n[${new Date().toLocaleTimeString('zh-CN')}] 📬 检测到新消息，触发群聊回复...`)
    try {
      await runChatReply()
    } catch (e: any) {
      console.error('⚠️  群聊回复执行失败:', e?.message || e)
    }
  }
}

async function scheduleNext(): Promise<void> {
  const intervalMs = getRandomIntervalMs()
  const nextSec = Math.round(intervalMs / 1000)
  console.log(`\n⏰ 下次检测: ${nextSec} 秒后 (${new Date(Date.now() + intervalMs).toLocaleTimeString('zh-CN')})`)
  setTimeout(async () => {
    await pollOnce()
    scheduleNext()
  }, intervalMs)
}

async function main() {
  console.log('🔄 MetaBot 群聊轮询已启动')
  console.log(`   检测间隔: 30-60 秒随机（回复间隔控制在1分钟内）`)
  console.log(`   深夜模式(0-6点): 2-4 分钟间隔，30% 回复概率`)
  console.log(`   群组: ${GROUP_ID}`)
  console.log('   按 Ctrl+C 停止\n')

  await pollOnce()
  scheduleNext()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
