#!/usr/bin/env node

/**
 * 统一聊天监听（群聊 + 私聊）
 * - 使用 Socket.IO 连接 idchat.io 接收推送
 * - 群聊/私聊消息写入根目录 chat-history 下对应 .log
 * - 配置写入根目录 chat-config.json
 * - 支持启动时拉取最新 30 条、收到推送时去重追加，保留最近 300 条
 * - 可选自动回复：AUTO_REPLY=1 时对新消息回复，REPLY_MAX_COUNT 默认 20 次
 */

import * as path from 'path'
import { spawn } from 'child_process'
import { SocketIOClient } from './socket'
import {
  readChatConfig,
  writeChatConfig,
  ensureChatConfigAndDir,
  getGroupLogPath,
  getPrivateLogPath,
  appendToHistoryLog,
  historyLogHasPinId,
  type ChatConfig,
  type HistoryLogEntry,
} from './chat-config'
import { isPrivateChatMessage, isGroupChatMessage, type UnifiedChatMessage } from './unified-chat-types'
import { decrypt } from './crypto'
import { ecdhDecrypt } from './crypto'
import {
  getChannelInfo,
  getChannelNewestMessagesByStartTime,
  getChannelNewestMessages,
  getPrivateNewestMessagesByStartTime,
  getPrivateNewestMessagesByStartIndex,
  computeDecryptedMsg,
  type ChatMessageItem,
} from './chat'
import { findAccountByUsername, readUserInfo } from './utils'

const ROOT_DIR = path.join(__dirname, '..', '..')
const ACCOUNT_FILE = path.join(ROOT_DIR, 'account.json')

let getEcdhPublickey: (mnemonic: string, pubkey?: string, options?: { addressIndex?: number }) => Promise<{ sharedSecret: string } | null>
let getUserInfoByMetaidByMs: (metaid: string) => Promise<{ chatPublicKey?: string }>
try {
  const chatpubkey = require(path.join(__dirname, '..', '..', 'MetaBot-Basic', 'scripts', 'chatpubkey'))
  getEcdhPublickey = chatpubkey.getEcdhPublickey
} catch {
  getEcdhPublickey = async () => null
}
try {
  const api = require(path.join(__dirname, '..', '..', 'MetaBot-Basic', 'scripts', 'api'))
  getUserInfoByMetaidByMs = api.getUserInfoByMetaidByMs
} catch {
  getUserInfoByMetaidByMs = async () => ({})
}

function getAccountWithPath(agentName: string): { mnemonic: string; globalMetaId: string; metaId?: string; addressIndex: number } | null {
  try {
    const fs = require('fs')
    if (!fs.existsSync(ACCOUNT_FILE)) return null
    const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf-8'))
    const account = (data.accountList || []).find(
      (a: any) => a.userName && a.userName.trim().toLowerCase() === agentName.trim().toLowerCase()
    )
    if (!account?.mnemonic) return null
    const pathStr = account.path || "m/44'/10001'/0'/0/0"
    const wallet = require(path.join(__dirname, '..', '..', 'MetaBot-Basic', 'scripts', 'wallet'))
    const addressIndex = wallet.parseAddressIndexFromPath ? wallet.parseAddressIndexFromPath(pathStr) : 0
    return {
      mnemonic: account.mnemonic,
      globalMetaId: account.globalMetaId || '',
      metaId: account.metaId,
      addressIndex,
    }
  } catch {
    return null
  }
}

/** 当前账户在 userInfo.json 中对应的 groupList（仅监听这些群） */
function getMyGroupIds(selfMvcAddress: string, selfGlobalMetaId: string): string[] {
  const userInfo = readUserInfo()
  const user = userInfo.userList.find(
    (u: any) =>
      (u.address && u.address === selfMvcAddress) ||
      (u.globalmetaid && u.globalmetaid === selfGlobalMetaId) ||
      (u.globalMetaId && u.globalMetaId === selfGlobalMetaId)
  )
  return user?.groupList && Array.isArray(user.groupList) ? user.groupList : []
}

function toHistoryEntry(
  msg: { txId: string; pinId?: string; address: string; userInfo: any; protocol: string; content: string; contentType: string; encryption: string; chatType: number; replyTx?: string; replyInfo?: any; mention?: string[]; index?: number; chain: string; timestamp: number; globalMetaId?: string; metaId?: string; groupId?: string },
  otherGlobalMetaId?: string
): HistoryLogEntry {
  return {
    groupId: msg.groupId,
    globalMetaId: msg.globalMetaId || msg.metaId || '',
    txId: msg.txId,
    pinId: msg.pinId,
    address: msg.address,
    userInfo: msg.userInfo,
    protocol: msg.protocol,
    content: msg.content,
    contentType: msg.contentType,
    encryption: msg.encryption,
    chatType: msg.chatType,
    replyPin: msg.replyTx || '',
    replyInfo: msg.replyInfo,
    mention: msg.mention || [],
    index: msg.index ?? 0,
    chain: msg.chain,
    timestamp: msg.timestamp,
    otherGlobalMetaId,
  }
}

async function syncGroupOnStart(config: ChatConfig, myGroupIds: string[]): Promise<void> {
  const toSync = config.group.filter((item) => item.groupId && myGroupIds.includes(item.groupId))
  for (const item of toSync) {
    const groupId = item.groupId!
    if (!groupId) continue
    try {
      const groupInfo = await getChannelInfo({ groupId })
      const startTs = item.lastTimestamp || groupInfo.roomNewestTimestamp || 0
      const res = await getChannelNewestMessagesByStartTime({
        groupId,
        startTimestamp: startTs,
        size: 30,
      })
      if (!res.list?.length) continue
      const secretKeyStr = groupId.substring(0, 16)
      const entries: HistoryLogEntry[] = res.list
        .filter((m) => m.chatType === 0)
        .map((m) => {
          const content = computeDecryptedMsg(m, secretKeyStr)
          return toHistoryEntry({ ...m, content }, undefined)
        })
      if (entries.length > 0) {
        appendToHistoryLog(getGroupLogPath(groupId), entries)
        const last = res.list[res.list.length - 1]
        item.lastTimestamp = res.lastTimestamp ?? last?.timestamp ?? item.lastTimestamp
        item.lastIndex = last?.index ?? item.lastIndex
      }
    } catch (e) {
      console.error('syncGroupOnStart error', groupId, (e as Error).message)
    }
  }
  writeChatConfig(config)
}

async function syncPrivateOnStart(
  config: ChatConfig,
  mnemonic: string,
  addressIndex: number,
  selfGlobalMetaId: string
): Promise<void> {
  const toSync = config.private.filter((item) => item.metaId === selfGlobalMetaId)
  for (const item of toSync) {
    const { metaId, otherGlobalMetaId, otherMetaId, lastTimestamp } = item
    try {
      const res = await getPrivateNewestMessagesByStartTime({
        metaId: metaId || selfGlobalMetaId,
        otherMetaId: otherGlobalMetaId,
        timestamp: lastTimestamp || 0,
        size: 30,
      })
      if (!res.list?.length) continue
      let otherUserInfo: { chatPublicKey?: string }
      try {
        otherUserInfo = await getUserInfoByMetaidByMs(otherMetaId || otherGlobalMetaId)
      } catch {
        console.warn('getUserInfoByMetaidByMs failed for', otherMetaId || otherGlobalMetaId)
        continue
      }
      if (!otherUserInfo?.chatPublicKey) continue
      const ecdh = await getEcdhPublickey(mnemonic, otherUserInfo.chatPublicKey, { addressIndex })
      if (!ecdh?.sharedSecret) {
        console.warn('getEcdhPublickey failed for private sync')
        continue
      }
      const sharedSecret = ecdh.sharedSecret
      const logPath = getPrivateLogPath(sharedSecret)
      const entries: HistoryLogEntry[] = res.list
        .filter((m) => m.chatType === 0)
        .map((m) => {
          let content = m.content
          try {
            content = ecdhDecrypt(m.content, sharedSecret)
          } catch {
            /* keep original */
          }
          return toHistoryEntry({ ...m, content }, otherGlobalMetaId)
        })
      if (entries.length > 0) {
        appendToHistoryLog(logPath, entries)
        item.lastTimestamp = res.nextTimestamp ?? item.lastTimestamp
        const last = res.list[res.list.length - 1]
        item.lastIndex = (last as any).index ?? item.lastIndex
      }
    } catch (e) {
      console.error('syncPrivateOnStart error', otherGlobalMetaId, (e as Error).message)
    }
  }
  writeChatConfig(config)
}

/** 启动时按 lastIndex 拉取最近 30 条（群聊 getChannelNewestMessages / 私聊 getPrivateNewestMessagesByStartIndex） */
async function pullLatest30Group(config: ChatConfig, myGroupIds: string[]): Promise<void> {
  const toPull = config.group.filter((item) => item.groupId && myGroupIds.includes(item.groupId))
  for (const item of toPull) {
    const groupId = item.groupId!
    if (!groupId) continue
    try {
      const startIndex = Math.max(0, (item.lastIndex || 0) - 30)
      const res = await getChannelNewestMessages({
        groupId,
        size: 30,
        startIndex: String(startIndex),
      })
      if (!res.list?.length) continue
      const secretKeyStr = groupId.substring(0, 16)
      const entries: HistoryLogEntry[] = res.list
        .filter((m) => m.chatType === 0)
        .map((m) => {
          const content = computeDecryptedMsg(m, secretKeyStr)
          return toHistoryEntry({ ...m, content }, undefined)
        })
      appendToHistoryLog(getGroupLogPath(groupId), entries)
      const last = res.list[res.list.length - 1]
      item.lastTimestamp = (last as any).timestamp ?? item.lastTimestamp
      item.lastIndex = (last as any).index ?? item.lastIndex
    } catch (e) {
      console.error('pullLatest30Group error', groupId, (e as Error).message)
    }
  }
  writeChatConfig(config)
}

async function pullLatest30Private(
  config: ChatConfig,
  mnemonic: string,
  addressIndex: number,
  selfGlobalMetaId: string
): Promise<void> {
  const toPull = config.private.filter((item) => item.metaId === selfGlobalMetaId)
  for (const item of toPull) {
    try {
      const startIndex = Math.max(0, (item.lastIndex || 0) - 30)
      const res = await getPrivateNewestMessagesByStartIndex({
        metaId: item.metaId || selfGlobalMetaId,
        otherMetaId: item.otherGlobalMetaId,
        size: 30,
        startIndex,
      })
      if (!res.list?.length) continue
      const otherUserInfo = await getUserInfoByMetaidByMs(item.otherMetaId || item.otherGlobalMetaId)
      if (!otherUserInfo?.chatPublicKey) continue
      const ecdh = await getEcdhPublickey(mnemonic, otherUserInfo.chatPublicKey, { addressIndex })
      if (!ecdh?.sharedSecret) continue
      const logPath = getPrivateLogPath(ecdh.sharedSecret)
      const entries: HistoryLogEntry[] = res.list
        .filter((m) => m.chatType === 0)
        .map((m) => {
          let content = m.content
          try {
            content = ecdhDecrypt(m.content, ecdh.sharedSecret)
          } catch {
            /* keep */
          }
          return toHistoryEntry({ ...m, content }, item.otherGlobalMetaId)
        })
      appendToHistoryLog(logPath, entries)
      const last = res.list[res.list.length - 1]
      item.lastTimestamp = (res as any).nextTimestamp ?? item.lastTimestamp
      item.lastIndex = (last as any).index ?? item.lastIndex
    } catch (e) {
      console.error('pullLatest30Private error', (e as Error).message)
    }
  }
  writeChatConfig(config)
}

async function main() {
  const agentName = process.env.AGENT_NAME || process.argv[2] || ''
  const accountByUsername = agentName ? findAccountByUsername(agentName) : null
  const accountWithPath = agentName ? getAccountWithPath(agentName) : null
  if (!accountWithPath && !accountByUsername) {
    console.error('❌ 未找到账户，请设置 AGENT_NAME 或传入参数指定监听使用的 Agent')
    process.exit(1)
  }
  const mnemonic = accountWithPath?.mnemonic ?? (accountByUsername as any)?.mnemonic
  const selfGlobalMetaId = accountWithPath?.globalMetaId ?? (accountByUsername as any)?.globalMetaId
  const addressIndex = accountWithPath?.addressIndex ?? 0
  const selfMvcAddress = (accountByUsername as any)?.mvcAddress ?? ''

  if (!selfGlobalMetaId) {
    console.error('❌ 账户缺少 globalMetaId，无法建立监听')
    process.exit(1)
  }

  const myGroupIds = getMyGroupIds(selfMvcAddress, selfGlobalMetaId)
  console.log('   当前账户仅监听: 私聊(metaId 匹配) + 群聊(groupList)', myGroupIds.length, '个群')

  ensureChatConfigAndDir()
  let config = readChatConfig()

  // 初始化：仅对当前账户所在群用 getChannelInfo 更新 lastTimestamp
  for (const item of config.group) {
    if (!item.groupId || !myGroupIds.includes(item.groupId)) continue
    try {
      const groupInfo = await getChannelInfo({ groupId: item.groupId })
      if (item.lastTimestamp === 0) {
        item.lastTimestamp = groupInfo.roomNewestTimestamp || 0
      }
    } catch {
      /* ignore */
    }
  }
  writeChatConfig(config)

  // 拉取最新 30 条：仅当前账户的群 + 当前账户的私聊
  if (config.group.some((g) => g.groupId && myGroupIds.includes(g.groupId))) {
    await pullLatest30Group(config, myGroupIds)
    config = readChatConfig()
  }
  if (config.private.some((p) => p.metaId === selfGlobalMetaId)) {
    await pullLatest30Private(config, mnemonic, addressIndex, selfGlobalMetaId)
    config = readChatConfig()
  }

  // 启动时再同步一次（仅当前账户的群 + 当前账户的私聊）
  await syncGroupOnStart(config, myGroupIds)
  config = readChatConfig()
  await syncPrivateOnStart(config, mnemonic, addressIndex, selfGlobalMetaId)
  config = readChatConfig()

  const REPLY_MAX = parseInt(process.env.REPLY_MAX_COUNT || '20', 10) || 20
  let replyCount = 0
  const RECENT_PIN_IDS_MAX = 500
  const recentProcessedPinIds = new Set<string>()
  /** 已触发回复的 incoming 消息 pinId，避免同一条消息触发两次回复（服务端重复推送时） */
  const recentTriggeredReplyPinIds = new Set<string>()
  const RECENT_TRIGGERED_MAX = 300
  /** 同一私聊会话防抖：上次触发回复的时间，避免短时间重复触发（毫秒） */
  const lastPrivateReplyTimeByOther: Record<string, number> = {}
  const PRIVATE_REPLY_DEBOUNCE_MS = parseInt(process.env.PRIVATE_REPLY_DEBOUNCE_MS || '15000', 10) || 15000
  /** 同一会话同时只允许一个回复任务，避免并发导致连续发两条相同内容 */
  const inFlightPrivateReply = new Set<string>()

  const maybeTriggerReply = (kind: 'group' | 'private', groupId?: string, otherGlobalMetaId?: string, incomingPinId?: string) => {
    if (process.env.AUTO_REPLY !== '1' && process.env.AUTO_REPLY !== 'true') return
    if (replyCount >= REPLY_MAX) {
      if (replyCount === REPLY_MAX) {
        console.log(`\n⚠️ 自动回复策略 ${REPLY_MAX} 次已完成，如需继续请输入相关指令或重新设置 REPLY_MAX_COUNT。\n`)
        replyCount++
      }
      return
    }
    if (incomingPinId && recentTriggeredReplyPinIds.has(incomingPinId)) {
      console.log('[私聊回复] 该 incoming 消息已触发过回复，跳过（防重复 pinId）')
      return
    }
    if (kind === 'private' && otherGlobalMetaId) {
      if (inFlightPrivateReply.has(otherGlobalMetaId)) {
        console.log('[私聊回复] 该会话已有回复任务进行中，跳过本次触发（避免连续两条相同内容）')
        return
      }
      const now = Date.now()
      const last = lastPrivateReplyTimeByOther[otherGlobalMetaId] ?? 0
      if (now - last < PRIVATE_REPLY_DEBOUNCE_MS) {
        console.log('[私聊回复] 防抖跳过：距上次触发不足', PRIVATE_REPLY_DEBOUNCE_MS / 1000, '秒')
        return
      }
      lastPrivateReplyTimeByOther[otherGlobalMetaId] = now
      inFlightPrivateReply.add(otherGlobalMetaId)
    }
    if (incomingPinId) {
      if (recentTriggeredReplyPinIds.size >= RECENT_TRIGGERED_MAX) recentTriggeredReplyPinIds.clear()
      recentTriggeredReplyPinIds.add(incomingPinId)
    }
    replyCount++
    const cwd = path.join(__dirname, '..')
    const env: Record<string, string | undefined> = { ...process.env, AGENT_NAME: agentName }
    if (kind === 'group' && groupId) {
      env.GROUP_ID = groupId
      const child = spawn('npx', ['ts-node', 'scripts/chat_reply.ts'], { cwd, env, stdio: 'inherit', shell: true })
      child.on('error', (e) => console.error('chat_reply 启动失败:', (e as Error).message))
    } else if (kind === 'private' && otherGlobalMetaId) {
      env.OTHER_GLOBAL_META_ID = otherGlobalMetaId
      const child = spawn('npx', ['ts-node', 'scripts/private_reply.ts'], { cwd, env, stdio: 'inherit', shell: true })
      child.on('error', (e) => console.error('private_reply 启动失败:', (e as Error).message))
      child.on('exit', () => {
        inFlightPrivateReply.delete(otherGlobalMetaId)
      })
    }
  }

  const dedupeAndAddMessage = (D: UnifiedChatMessage) => {
    const pinId = (D as any)?.pinId || ((D as any)?.txId ? (D as any).txId + 'i0' : '')
    if (pinId && recentProcessedPinIds.has(pinId)) return
    if (pinId) {
      if (recentProcessedPinIds.size >= RECENT_PIN_IDS_MAX) recentProcessedPinIds.clear()
      recentProcessedPinIds.add(pinId)
    }
    addMessage(D)
  }

  const addMessage = async (message: UnifiedChatMessage) => {
    const isPrivate = isPrivateChatMessage(message)
    if (isPrivate) {
      console.log('[addMessage 私聊] 开始处理私聊消息')
      const otherGlobalMetaId = message.toGlobalMetaId === selfGlobalMetaId ? message.fromGlobalMetaId : message.toGlobalMetaId
      const otherUserInfo = message.fromGlobalMetaId === otherGlobalMetaId ? message.fromUserInfo : message.toUserInfo
      if (!otherUserInfo?.chatPublicKey) {
        console.warn('[addMessage 私聊] 缺少对方 chatPublicKey，跳过')
        return
      }
      const ecdh = await getEcdhPublickey(mnemonic, otherUserInfo.chatPublicKey, { addressIndex })
      if (!ecdh) {
        console.warn('[addMessage 私聊] 协商密钥获取失败，跳过')
        return
      }
      const sharedSecret = ecdh.sharedSecret
      const logPath = getPrivateLogPath(sharedSecret)
      const pinId = message.pinId || message.txId + 'i0'
      const isDup = historyLogHasPinId(logPath, pinId)
      console.log('[addMessage 私聊] pinId:', pinId, 'logPath:', logPath, 'historyLogHasPinId:', isDup)
      if (isDup) {
        console.log('[addMessage 私聊] 重复消息，跳过（不会执行 writeChatConfig）')
        return
      }
      let content = message.content
      if (message.chatType === 0) {
        try {
          content = ecdhDecrypt(message.content, sharedSecret)
        } catch {
          /* keep */
        }
      }
      const entry = toHistoryEntry(
        {
          ...message,
          content,
          replyTx: (message as any).replyPin,
        } as any,
        otherGlobalMetaId
      )
      try {
        appendToHistoryLog(logPath, [entry])
      } catch (e) {
        console.error('[addMessage 私聊] appendToHistoryLog 异常:', (e as Error).message)
        return
      }

      const otherMetaId = (otherUserInfo as any)?.metaid || (otherUserInfo as any)?.globalMetaId || otherGlobalMetaId
      const existing = config.private.find(
        (p) => p.sharedSecret === sharedSecret || (p.otherGlobalMetaId === otherGlobalMetaId && p.metaId === selfGlobalMetaId)
      )
      const secretPrefix = sharedSecret.slice(0, 8)
      console.log('[addMessage 私聊] config.private.length:', config.private.length, '当前 sharedSecret 前缀:', secretPrefix, 'existing:', !!existing)
      if (!existing && config.private.length > 0) {
        const existingPrefixes = config.private.map((p) => p.sharedSecret?.slice(0, 8) || '(空)')
        console.log('[addMessage 私聊] 已有 private 项的 sharedSecret 前缀:', existingPrefixes, '(find 用 === 严格匹配，若前缀不同则不会命中)')
      }
      if (existing) {
        existing.lastTimestamp = message.timestamp
        existing.lastIndex = message.index ?? existing.lastIndex
        if (existing.sharedSecret !== sharedSecret) {
          existing.sharedSecret = sharedSecret
          console.log('[addMessage 私聊] 已修正已有配置的 sharedSecret（同一会话只保留用对方 key 算出的值）')
        }
        const correctOtherMetaId = (otherUserInfo as any)?.metaid || (otherUserInfo as any)?.globalMetaId
        if (correctOtherMetaId && correctOtherMetaId !== existing.otherMetaId) {
          existing.otherMetaId = correctOtherMetaId
          console.log('[addMessage 私聊] 已修正已有配置的 otherMetaId')
        }
        config.private = config.private.filter(
          (p) => p.metaId !== selfGlobalMetaId || p.otherGlobalMetaId !== otherGlobalMetaId || p.sharedSecret === existing.sharedSecret
        )
        console.log('[addMessage 私聊] 更新已有配置，即将 writeChatConfig')
      } else {
        config.private = config.private.filter(
          (p) => !(p.metaId === selfGlobalMetaId && p.otherGlobalMetaId === otherGlobalMetaId)
        )
        config.private.push({
          sharedSecret,
          metaId: selfGlobalMetaId,
          otherGlobalMetaId: otherGlobalMetaId || '',
          otherMetaId: otherMetaId || '',
          lastTimestamp: message.timestamp,
          lastIndex: message.index ?? 0,
        })
        console.log('[addMessage 私聊] 新增 private 配置，config.private.length 现为:', config.private.length, '即将 writeChatConfig')
      }
      try {
        writeChatConfig(config)
        console.log('[addMessage 私聊] writeChatConfig 已执行')
      } catch (e) {
        console.error('[addMessage 私聊] writeChatConfig 异常:', (e as Error).message)
      }
      console.log(`[Socket 推送] 📩 私聊 [${(otherUserInfo as any)?.name || otherGlobalMetaId}]: ${content.slice(0, 50)}`)
      // 仅当这条消息是「对方发来的」时才触发回复，避免对自己发出的消息再次回复导致连串/循环
      if (message.fromGlobalMetaId !== selfGlobalMetaId) {
        maybeTriggerReply('private', undefined, otherGlobalMetaId, pinId)
      } else {
        console.log('[私聊回复] 跳过：本条为本人发送，不触发自动回复')
      }
    } else if (isGroupChatMessage(message)) {
      const groupId = message.groupId!
      if (message.chatType !== 0) return
      if (!myGroupIds.includes(groupId)) {
        return
      }
      const secretKeyStr = groupId.substring(0, 16)
      const logPath = getGroupLogPath(groupId)
      const pinId = message.pinId || message.txId + 'i0'
      if (historyLogHasPinId(logPath, pinId)) return
      let content = message.content
      try {
        content = decrypt(message.content, secretKeyStr)
      } catch {
        /* keep */
      }
      const entry = toHistoryEntry({ ...message, content, replyTx: (message as any).replyPin } as any)
      appendToHistoryLog(logPath, [entry])

      const groupItem = config.group.find((g) => g.groupId === groupId)
      if (groupItem) {
        groupItem.lastTimestamp = message.timestamp
        groupItem.lastIndex = message.index ?? groupItem.lastIndex
      } else {
        config.group.push({
          groupId,
          lastTimestamp: message.timestamp,
          lastIndex: message.index ?? 0,
        })
      }
      writeChatConfig(config)
      console.log(`[Socket 推送] 📩 群聊 [${groupId.slice(0, 8)}…] ${(message.userInfo as any)?.name || message.address}: ${content.slice(0, 50)}`)
      maybeTriggerReply('group', groupId)
    }
  }

  const handleReceivedMessage = (data: { message?: string; [k: string]: any } | string) => {
    // 服务端可能推送：1) 对象 { message: "{\"M\":...,\"D\":...}" }  2) 直接字符串 "{\"M\":...,\"D\":...}"  3) 对象 { M, D }
    let raw: string
    if (typeof data === 'string') {
      raw = data
    } else if (typeof (data as any).message === 'string') {
      raw = (data as any).message
    } else {
      raw = JSON.stringify(data)
    }
    let wrapper: { M?: string; D?: UnifiedChatMessage } | string
    try {
      wrapper = JSON.parse(raw)
    } catch {
      console.log('[Socket 推送] 无法解析 payload，raw 前 200 字符:', String(raw).slice(0, 200))
      return
    }
    // 若解析结果是字符串（如双重 JSON 编码），再解析一次
    if (typeof wrapper === 'string') {
      const strPayload = wrapper
      try {
        wrapper = JSON.parse(strPayload) as { M?: string; D?: UnifiedChatMessage }
      } catch {
        console.log('[Socket 推送] payload 为字符串但非 JSON，前 200 字符:', strPayload.slice(0, 200))
        return
      }
    }
    // 若解析结果是数组 [eventName, payload]（Socket.IO 多参数会变成数组）
    if (Array.isArray(wrapper) && wrapper.length >= 2) {
      const ev = wrapper[0]
      const D = wrapper[1]
      if (ev === 'WS_SERVER_NOTIFY_GROUP_CHAT' && D) {
        console.log('[Socket 推送] 收到群聊消息')
        dedupeAndAddMessage(D as UnifiedChatMessage)
        return
      }
      if (ev === 'WS_SERVER_NOTIFY_PRIVATE_CHAT' && D) {
        console.log('[Socket 推送] 收到私聊消息')
        dedupeAndAddMessage(D as UnifiedChatMessage)
        return
      }
    }
    const eventType = wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper) ? wrapper.M : undefined
    if (eventType && eventType !== 'pong' && eventType !== 'ping') {
      const hasD = wrapper && typeof wrapper === 'object' && 'D' in wrapper && (wrapper as any).D != null
      console.log('[Socket 推送] 事件:', eventType, 'hasD:', hasD, hasD && typeof (wrapper as any).D === 'object' ? 'D.keys: ' + Object.keys((wrapper as any).D).slice(0, 12).join(',') : '')
    }
    switch (eventType) {
      case 'WS_SERVER_NOTIFY_GROUP_CHAT':
        if (wrapper.D) {
          console.log('[Socket 推送] 收到群聊消息')
          dedupeAndAddMessage(wrapper.D as UnifiedChatMessage)
        }
        break
      case 'WS_SERVER_NOTIFY_PRIVATE_CHAT':
        if (wrapper.D) {
          console.log('[Socket 推送] 收到私聊消息')
          dedupeAndAddMessage(wrapper.D as UnifiedChatMessage)
        } else {
          console.log('[Socket 推送] 私聊事件无 D，keys:', data && typeof data === 'object' ? Object.keys(data) : [])
        }
        break
      case 'WS_RESPONSE_SUCCESS':
        if (wrapper.D && typeof wrapper.D === 'object') {
          const D = wrapper.D as any
          const payload = D?.data && typeof D.data === 'object' ? D.data : D
          if (isPrivateChatMessage(payload)) {
            console.log('[Socket 推送] 收到私聊消息 (WS_RESPONSE_SUCCESS.D)')
            dedupeAndAddMessage(payload as UnifiedChatMessage)
            break
          }
          if (isGroupChatMessage(payload)) {
            console.log('[Socket 推送] 收到群聊消息 (WS_RESPONSE_SUCCESS.D)')
            dedupeAndAddMessage(payload as UnifiedChatMessage)
            break
          }
          // 调试：说明为何未识别为聊天消息，便于排查服务端格式
          const p = payload && typeof payload === 'object' ? payload : D
          const pKeys = p ? Object.keys(p) : []
          const missPrivate = [
            p?.fromGlobalMetaId ? '' : 'fromGlobalMetaId',
            p?.fromUserInfo ? '' : 'fromUserInfo',
            p?.toGlobalMetaId ? '' : 'toGlobalMetaId',
            p?.toUserInfo ? '' : 'toUserInfo',
          ].filter(Boolean)
          const missGroup = [p?.groupId ? '' : 'groupId', p?.metanetId ? '' : 'metanetId'].filter(Boolean)
          console.log(
            '[Socket 推送] WS_RESPONSE_SUCCESS.D 非私聊/群聊结构 payload.keys:',
            pKeys.slice(0, 20),
            '| 私聊缺:',
            missPrivate.length ? missPrivate.join(',') : '无',
            '| 群聊缺:',
            missGroup.length ? missGroup.join(',') : '无'
          )
        }
        break
      default:
        if (eventType === 'pong' || eventType === 'ping') break
        if (eventType && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
          console.log('[Socket 推送] 未处理的事件类型:', eventType, 'keys:', Object.keys(wrapper))
        }
        break
    }
  }

  const SOCKET_URL = 'https://api.idchat.io'
  const SOCKET_PATH = '/socket/socket.io'
  const client = new SocketIOClient(
    {
      url: SOCKET_URL,
      path: SOCKET_PATH,
      metaid: selfGlobalMetaId,
      type: 'pc',
    },
    handleReceivedMessage
  )

  console.log('\n✅ 监听已启动（群聊 + 私聊）')
  console.log('   当前账户:', agentName || '默认', 'globalMetaId:', selfGlobalMetaId.slice(0, 16) + '…')
  console.log('   Socket 连接 URL:', SOCKET_URL + SOCKET_PATH)
  console.log('   日志目录: 根目录 chat-history/')
  console.log('   配置: 根目录 chat-config.json')
  console.log('   收到推送时将打印 [Socket 推送] 日志，按 Ctrl+C 停止')
  console.log('   若无推送：请用另一账号向本账号发一条私聊，观察 [Socket 收到事件] / [Socket 推送] 的详细输出\n')

  client.connect()

  process.on('SIGINT', () => {
    client.disconnect()
    process.exit(0)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
