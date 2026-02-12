#!/usr/bin/env node

/**
 * MetaWeb 场景深夜群聊 - 自由讨论模式 轮询
 * 2 反驳型 + 3 非反驳型 Agent，以日常群聊形式持续自由讨论
 * 每隔 2-4 分钟一人发言，无发言次数限制
 */

import { readConfig, writeConfig, isLateNightMode } from './utils'
import * as path from 'path'

const GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'
const CHAT_MIN_INTERVAL_MS = 2 * 60 * 1000   // 2 分钟
const CHAT_MAX_INTERVAL_MS = 4 * 60 * 1000   // 4 分钟
const LATE_NIGHT_MIN_INTERVAL_MS = 4 * 60 * 1000   // 深夜：4 分钟
const LATE_NIGHT_MAX_INTERVAL_MS = 6 * 60 * 1000   // 深夜：6 分钟
const LATE_NIGHT_CHAT_PROBABILITY = 0.3             // 深夜：30% 发言概率

function getRandomIntervalMs(): number {
  if (isLateNightMode()) {
    return Math.floor(LATE_NIGHT_MIN_INTERVAL_MS + Math.random() * (LATE_NIGHT_MAX_INTERVAL_MS - LATE_NIGHT_MIN_INTERVAL_MS))
  }
  return Math.floor(CHAT_MIN_INTERVAL_MS + Math.random() * (CHAT_MAX_INTERVAL_MS - CHAT_MIN_INTERVAL_MS))
}

async function runMetawebFreeChat(): Promise<void> {
  const { spawn } = await import('child_process')
  const cwd = path.join(__dirname, '..')
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['ts-node', 'scripts/metaweb_free_chat.ts'], {
      cwd,
      stdio: 'inherit',
      shell: true,
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`metaweb_free_chat exited with ${code}`))
    })
    child.on('error', reject)
  })
}

async function chatOnce(): Promise<void> {
  if (isLateNightMode() && Math.random() > LATE_NIGHT_CHAT_PROBABILITY) {
    console.log(`\n[${new Date().toLocaleTimeString('zh-CN')}] 🌙 深夜模式，跳过本次发言`)
    return
  }
  console.log(`\n[${new Date().toLocaleTimeString('zh-CN')}] 💬 MetaWeb 自由讨论 - 2反驳型+3非反驳型 Agent 发言...`)
  try {
    await runMetawebFreeChat()
  } catch (e: any) {
    console.error('⚠️  发言失败:', e?.message || e)
  }
}

async function scheduleNext(): Promise<void> {
  const intervalMs = getRandomIntervalMs()
  const nextSec = Math.round(intervalMs / 1000)
  console.log(`\n⏰ 下次发言: ${nextSec} 秒后 (${new Date(Date.now() + intervalMs).toLocaleTimeString('zh-CN')})`)
  setTimeout(async () => {
    await chatOnce()
    scheduleNext()
  }, intervalMs)
}

async function main() {
  const config = readConfig()
  config.groupId = GROUP_ID
  writeConfig(config)

  console.log('🌙 MetaWeb 场景深夜群聊 - 自由讨论模式已启动')
  console.log('   2 反驳型 + 3 非反驳型 Agent，日常群聊形式')
  console.log('   话题: 自然语言任务→MCP 匹配→私聊→SPACE 支付→任务执行')
  console.log('   无发言次数限制，可提问、反驳、补充')
  console.log('   发言间隔: 2-4 分钟')
  console.log(`   群组: ${GROUP_ID}`)
  console.log('   按 Ctrl+C 停止\n')

  await chatOnce()
  scheduleNext()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
