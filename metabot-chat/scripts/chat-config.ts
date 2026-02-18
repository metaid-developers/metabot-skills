#!/usr/bin/env node

/**
 * 统一聊天配置 chat-config.json（群聊 + 私聊）
 * 位于项目根目录，与 account.json 同级
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT_DIR = path.join(__dirname, '..', '..')
export const CHAT_CONFIG_FILE = path.join(ROOT_DIR, 'chat-config.json')
export const CHAT_HISTORY_DIR = path.join(ROOT_DIR, 'chat-history')

export interface ChatConfigGroupItem {
  groupId: string
  lastTimestamp: number
  lastIndex: number
}

export interface ChatConfigPrivateItem {
  sharedSecret: string
  metaId: string
  otherGlobalMetaId: string
  otherMetaId: string
  lastTimestamp: number
  lastIndex: number
}

export interface ChatConfig {
  group: ChatConfigGroupItem[]
  private: ChatConfigPrivateItem[]
}

const DEFAULT_CHAT_CONFIG: ChatConfig = {
  group: [],
  private: [],
}

function ensureChatHistoryDir(): void {
  if (!fs.existsSync(CHAT_HISTORY_DIR)) {
    fs.mkdirSync(CHAT_HISTORY_DIR, { recursive: true })
  }
}

export function ensureChatConfigAndDir(): void {
  ensureChatHistoryDir()
  if (!fs.existsSync(CHAT_CONFIG_FILE)) {
    fs.writeFileSync(CHAT_CONFIG_FILE, JSON.stringify(DEFAULT_CHAT_CONFIG, null, 2), 'utf-8')
  }
}

export function readChatConfig(): ChatConfig {
  ensureChatConfigAndDir()
  try {
    const content = fs.readFileSync(CHAT_CONFIG_FILE, 'utf-8')
    const raw = JSON.parse(content)
    return {
      group: Array.isArray(raw.group) ? raw.group : [],
      private: Array.isArray(raw.private) ? raw.private : [],
    }
  } catch {
    return { ...DEFAULT_CHAT_CONFIG }
  }
}

export function writeChatConfig(config: ChatConfig): void {
  ensureChatConfigAndDir()
  // 若某项 lastIndex 为 -1，保留原有 lastIndex 不写入
  let merged = config
  if (fs.existsSync(CHAT_CONFIG_FILE)) {
    try {
      const existing = readChatConfig()
      merged = {
        group: config.group.map((item) => {
          if (item.lastIndex === -1) {
            const prev = existing.group.find((g) => g.groupId === item.groupId)
            if (prev != null) return { ...item, lastIndex: prev.lastIndex }
          }
          return item
        }),
        private: config.private.map((item) => {
          if (item.lastIndex === -1) {
            const prev = existing.private.find(
              (p) => p.sharedSecret === item.sharedSecret || p.otherGlobalMetaId === item.otherGlobalMetaId
            )
            if (prev != null) return { ...item, lastIndex: prev.lastIndex }
          }
          return item
        }),
      }
    } catch {
      // 读取失败则按原 config 写入
    }
  }
  fs.writeFileSync(CHAT_CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8')
}

/** 群聊 log 文件名：groupId.slice(0, 16).log */
export function getGroupLogPath(groupId: string): string {
  ensureChatHistoryDir()
  const prefix = (groupId || '').slice(0, 16)
  return path.join(CHAT_HISTORY_DIR, `${prefix}.log`)
}

/** 私聊 log 文件名：使用完整 sharedSecret（64 hex）避免不同会话前 20 位相同导致混 log */
export function getPrivateLogPath(sharedSecret: string): string {
  ensureChatHistoryDir()
  const raw = (sharedSecret || '').trim()
  const prefix = raw.length >= 64 ? raw.slice(0, 64) : raw || 'unknown'
  const safe = prefix.replace(/[^a-fA-F0-9]/g, '') || prefix
  return path.join(CHAT_HISTORY_DIR, `${safe}.log`)
}

export interface HistoryLogEntry {
  groupId?: string
  globalMetaId: string
  txId: string
  pinId?: string
  address: string
  userInfo: any
  protocol: string
  content: string
  contentType: string
  encryption: string
  chatType: number
  replyPin?: string
  replyInfo?: any
  mention?: string[]
  index: number
  chain: string
  timestamp: number
  /** 私聊时标识对方 globalMetaId */
  otherGlobalMetaId?: string
}

const MAX_HISTORY_ENTRIES = 300

function readHistoryLogEntries(filePath: string): HistoryLogEntry[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const content = fs.readFileSync(filePath, 'utf-8')
    if (!content.trim()) return []
    return content.trim().split('\n').map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

function writeHistoryLogEntries(filePath: string, entries: HistoryLogEntry[]): void {
  const lines = entries.slice(0, MAX_HISTORY_ENTRIES).map((e) => JSON.stringify(e))
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8')
}

/**
 * 追加或合并消息到历史 log，按 timestamp 倒序（日期晚的在前），去重 pinId，保留最近 300 条
 */
export function appendToHistoryLog(
  filePath: string,
  newEntries: HistoryLogEntry[],
  dedupeKey: 'pinId' | 'txId' = 'pinId'
): void {
  const existing = readHistoryLogEntries(filePath)
  const existingKeys = new Set(existing.map((e) => e.pinId || e.txId))
  const toAdd = newEntries.filter((e) => !existingKeys.has(e.pinId || e.txId))
  if (toAdd.length === 0) return
  const combined = [...existing, ...toAdd].sort((a, b) => {
    const ts = (b.timestamp ?? 0) - (a.timestamp ?? 0)
    if (ts !== 0) return ts
    return (b.index ?? 0) - (a.index ?? 0)
  })
  if (combined.length > MAX_HISTORY_ENTRIES) {
    combined.length = MAX_HISTORY_ENTRIES
  }
  writeHistoryLogEntries(filePath, combined)
}

/**
 * 检查 log 中是否已存在某 pinId
 */
export function historyLogHasPinId(filePath: string, pinId: string): boolean {
  const entries = readHistoryLogEntries(filePath)
  return entries.some((e) => e.pinId === pinId)
}

/**
 * 读取历史条目（用于回复上下文等）
 */
export function getHistoryLogEntries(filePath: string, limit = 30): HistoryLogEntry[] {
  const entries = readHistoryLogEntries(filePath)
  return entries.slice(0, limit).reverse()
}
