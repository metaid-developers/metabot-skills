#!/usr/bin/env node

/**
 * 混合群聊 - 畅聊模式
 * 随机选 2 个反驳型 + 3 个非反驳型 Agent，基于最近聊天记录持续畅聊
 * 不依赖新消息，每隔 2-4 分钟主动让一个 Agent 发言，保持对话持续进行
 * 深夜模式(0-6点)：间隔 4-6 分钟，30% 发言概率
 */

import { readConfig, writeConfig, isLateNightMode } from './utils'

const GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'
const CHAT_MIN_INTERVAL_MS = 2 * 60 * 1000   // 畅聊模式：2 分钟
const CHAT_MAX_INTERVAL_MS = 4 * 60 * 1000   // 畅聊模式：4 分钟
const LATE_NIGHT_MIN_INTERVAL_MS = 4 * 60 * 1000   // 深夜：4 分钟
const LATE_NIGHT_MAX_INTERVAL_MS = 6 * 60 * 1000   // 深夜：6 分钟
const LATE_NIGHT_CHAT_PROBABILITY = 0.3             // 深夜：30% 发言概率

function getRandomIntervalMs(): number {
  if (isLateNightMode()) {
    return Math.floor(LATE_NIGHT_MIN_INTERVAL_MS + Math.random() * (LATE_NIGHT_MAX_INTERVAL_MS - LATE_NIGHT_MIN_INTERVAL_MS))
  }
  return Math.floor(CHAT_MIN_INTERVAL_MS + Math.random() * (CHAT_MAX_INTERVAL_MS - CHAT_MIN_INTERVAL_MS))
}

async function runMixedChat(): Promise<void> {
  const { spawn } = await import('child_process')
  const path = await import('path')
  const cwd = path.join(__dirname, '..')
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['ts-node', 'scripts/mixed_chat.ts'], {
      cwd,
      stdio: 'inherit',
      shell: true,
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`mixed_chat exited with ${code}`))
    })
    child.on('error', reject)
  })
}

async function chatOnce(): Promise<void> {
  // 深夜模式：降低发言概率
  if (isLateNightMode() && Math.random() > LATE_NIGHT_CHAT_PROBABILITY) {
    console.log(`\n[${new Date().toLocaleTimeString('zh-CN')}] 🌙 深夜模式，跳过本次发言（保持安静）`)
    return
  }
  console.log(`\n[${new Date().toLocaleTimeString('zh-CN')}] 💬 畅聊模式 - 2反驳型+3非反驳型 Agent 发言...`)
  try {
    await runMixedChat()
  } catch (e: any) {
    console.error('⚠️  畅聊发言失败:', e?.message || e)
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

  console.log('🔄 混合群聊 - 畅聊模式已启动')
  console.log(`   2 反驳型 + 3 非反驳型 Agent 持续畅聊`)
  console.log(`   发言间隔: 2-4 分钟随机`)
  console.log(`   深夜模式(0-6点): 4-6 分钟间隔，30% 发言概率`)
  console.log(`   群组: ${GROUP_ID}`)
  console.log('   按 Ctrl+C 停止\n')

  await chatOnce()
  scheduleNext()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
