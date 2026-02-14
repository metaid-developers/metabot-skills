#!/usr/bin/env node

/**
 * 私聊智能回复：根据 chat-history 下对应私聊 log 最近记录生成一条回复并发送
 * 用法: AGENT_NAME=xxx OTHER_GLOBAL_META_ID=xxx npx ts-node scripts/private_reply.ts
 * 使用跨进程文件锁，确保同一会话同一时刻只有一个进程执行发送，彻底避免链上重复上链。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { readChatConfig, getPrivateLogPath, getHistoryLogEntries, CHAT_HISTORY_DIR } from './chat-config'
import { findAccountByUsername } from './utils'
import { generateChatReply, getResolvedLLMConfig } from './llm'
import { sendTextForPrivateChat } from './message'
import { readConfig } from './utils'

const LOCK_STALE_SEC = 120

function acquirePrivateReplyLock(agentName: string, otherGlobalMetaId: string): string | null {
  if (!fs.existsSync(CHAT_HISTORY_DIR)) fs.mkdirSync(CHAT_HISTORY_DIR, { recursive: true })
  const slug = crypto.createHash('sha256').update(agentName + '\n' + otherGlobalMetaId).digest('hex').slice(0, 24)
  const lockPath = path.join(CHAT_HISTORY_DIR, `.lock_private_reply_${slug}.lock`)
  const tryAcquire = (): boolean => {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
      return true
    } catch (e: any) {
      if (e.code !== 'EEXIST') return false
      try {
        const raw = fs.readFileSync(lockPath, 'utf-8')
        const pid = parseInt(raw.trim(), 10)
        if (pid > 0 && typeof process.kill === 'function') {
          try {
            process.kill(pid, 0)
          } catch {
            fs.unlinkSync(lockPath)
            return tryAcquire()
          }
        }
        const stat = fs.statSync(lockPath)
        const ageSec = (Date.now() - stat.mtimeMs) / 1000
        if (ageSec > LOCK_STALE_SEC) {
          fs.unlinkSync(lockPath)
          return tryAcquire()
        }
      } catch (_) {
        try {
          fs.unlinkSync(lockPath)
          return tryAcquire()
        } catch {}
      }
      return false
    }
  }
  if (!tryAcquire()) return null
  return lockPath
}

let createPin: any = null
let getEcdhPublickey: (mnemonic: string, pubkey?: string, options?: { addressIndex?: number }) => Promise<{ sharedSecret: string } | null>
let getUserInfoByMetaidByMs: (metaid: string) => Promise<{ chatPublicKey?: string }>
try {
  createPin = require(path.join(__dirname, '..', '..', 'MetaBot-Basic', 'scripts', 'metaid')).createPin
  const chatpubkey = require(path.join(__dirname, '..', '..', 'MetaBot-Basic', 'scripts', 'chatpubkey'))
  getEcdhPublickey = chatpubkey.getEcdhPublickey
  const api = require(path.join(__dirname, '..', '..', 'MetaBot-Basic', 'scripts', 'api'))
  getUserInfoByMetaidByMs = api.getUserInfoByMetaidByMs
} catch (e) {
  console.error('加载 metabot-basic 失败:', (e as Error).message)
  process.exit(1)
}

async function main() {
  const agentName = process.env.AGENT_NAME || process.argv[2] || ''
  const otherGlobalMetaId = process.env.OTHER_GLOBAL_META_ID || process.argv[3] || ''
  if (!agentName || !otherGlobalMetaId) {
    console.error('用法: AGENT_NAME=xxx OTHER_GLOBAL_META_ID=xxx npx ts-node scripts/private_reply.ts')
    process.exit(1)
  }

  const lockPath = acquirePrivateReplyLock(agentName, otherGlobalMetaId)
  if (!lockPath) {
    console.log('[私聊回复] 该会话已有回复任务进行中（跨进程锁），跳过本次发送，避免链上重复')
    process.exit(0)
  }
  try {
    await mainWork(agentName, otherGlobalMetaId)
  } finally {
    try {
      fs.unlinkSync(lockPath)
    } catch (_) {}
  }
}

async function mainWork(agentName: string, otherGlobalMetaId: string) {
  const config = readConfig()
  const chatConfig = readChatConfig()
  const privateItem = chatConfig.private.find(
    (p) => p.otherGlobalMetaId === otherGlobalMetaId || p.otherMetaId === otherGlobalMetaId
  )
  if (!privateItem?.sharedSecret) {
    console.error('未在 chat-config.json 的 private 中找到对方配置，请先收到对方一条私聊后再回复')
    throw new Error('private item not found')
  }

  const account = findAccountByUsername(agentName)
  if (!account?.mnemonic) {
    console.error('未找到账户:', agentName)
    throw new Error('account not found')
  }

  const logPath = getPrivateLogPath(privateItem.sharedSecret)
  const entries = getHistoryLogEntries(logPath, 30)
  const recentMessages = entries.map((e) => `${(e.userInfo as any)?.name || '对方'}: ${e.content}`).filter(Boolean)
  if (recentMessages.length === 0) {
    console.log('暂无私聊记录，跳过回复')
    return
  }

  const llmConfig = getResolvedLLMConfig(account, config)
  if (!llmConfig.apiKey) {
    console.error('请配置 LLM API Key')
    throw new Error('LLM API Key not configured')
  }

  const userProfile = {
    character: account.character || '友好',
    preference: account.preference || '广泛',
    goal: account.goal || '参与交流',
  }
  const result = await generateChatReply(
    agentName,
    recentMessages,
    userProfile,
    { hasMetaIDAgentMention: false, isPrivateChat: true },
    llmConfig
  )

  const sharedSecret = privateItem.sharedSecret
  const selfGlobalMetaId = (account as any).globalMetaId || ''
  const lastSelfMessage = [...entries].reverse().find((e) => e.globalMetaId === selfGlobalMetaId)
  if (lastSelfMessage && lastSelfMessage.content && lastSelfMessage.content.trim() === result.content.trim()) {
    console.log('与上条回复内容相同，跳过发送（避免连续两条相同）')
    return
  }

  try {
    await sendTextForPrivateChat(
      otherGlobalMetaId,
      result.content,
      0,
      sharedSecret,
      null,
      [],
      account.userName,
      account.mnemonic,
      createPin
    )
    console.log('✅ 私聊回复已发送')
  } catch (e: any) {
    console.error('发送失败:', e?.message || e)
    throw e
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
