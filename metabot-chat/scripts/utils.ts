import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { ChatMessageItem, computeDecryptedMsg, getChannelNewestMessages } from './chat'
import { ensureConfigFiles, getEnv, configFromEnv, type GroupInfoItem } from './env-config'

// 根目录下的配置文件（与 .env、account.json 同级）
const ROOT_DIR = path.join(__dirname, '..', '..')
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json')
const USER_INFO_FILE = path.join(ROOT_DIR, 'userInfo.json')
const ACCOUNT_FILE = path.join(ROOT_DIR, 'account.json')
const GROUP_LIST_HISTORY_FILE = path.join(ROOT_DIR, 'group-list-history.log')
const OLD_GROUP_LIST_HISTORY_FILE = path.join(__dirname, '..', 'group-list-history.log')

let _configEnsured = false

export interface LLMConfig {
  provider?: 'openai' | 'claude' | 'deepseek' | 'gemini' | 'custom'
  apiKey?: string
  baseUrl?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface Config {
  /** 群组列表（新格式） */
  groupInfoList: GroupInfoItem[]
  /** 当前默认群组（groupInfoList[0] 的便捷访问，向后兼容） */
  groupId: string
  groupName: string
  groupAnnouncement: string
  grouplastIndex: number
  llm?: LLMConfig
}

export interface UserInfo {
  address: string
  globalmetaid: string
  metaid: string
  userName: string
  groupList: string[]
  character?: string // 性格
  preference?: string // 喜好
  goal?: string // 目标
  masteringLanguages?: string[] // 精通语言
  /** 观点倾向：影响对他人观点的反应，如遇不同意见是否倾向于反驳 */
  stanceTendency?: string
  /** 辩论风格：敢于反驳/善于倾听/喜欢追问/温和补充 */
  debateStyle?: string
  /** 互动倾向：主动回应他人/被动参与/喜欢@人讨论/倾向独立发言 */
  interactionStyle?: string
}

export interface UserInfoData {
  userList: UserInfo[]
}

export interface HistoryLogEntry {
  groupId: string
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
  replyPin: string
  replyInfo?: any
  mention?: string[]
  index: number
  chain: string
  timestamp: number
}

/**
 * 归一化 config：支持旧格式（扁平）与新格式（groupInfoList）
 */
function normalizeConfig(raw: any, fromEnv: { groupInfoList: GroupInfoItem[] }): Config {
  let list: GroupInfoItem[] = fromEnv.groupInfoList

  if (raw?.groupInfoList && Array.isArray(raw.groupInfoList) && raw.groupInfoList.length > 0) {
    list = raw.groupInfoList
  } else if (raw?.groupId) {
    // 旧格式迁移：扁平结构 → groupInfoList
    list = [
      {
        groupId: raw.groupId || '',
        groupName: raw.groupName || '',
        groupAnnouncement: raw.groupAnnouncement || '',
        grouplastIndex: raw.grouplastIndex ?? 0,
        llm: raw.llm,
      },
    ]
  }

  const first = list[0] || fromEnv.groupInfoList[0]
  const env = getEnv()
  return {
    groupInfoList: list,
    groupId: first.groupId || '',
    groupName: first.groupName || '',
    groupAnnouncement: first.groupAnnouncement || '',
    grouplastIndex: first.grouplastIndex ?? 0,
    llm: {
      ...first.llm,
      provider: (first.llm?.provider || 'deepseek') as LLMConfig['provider'],
      apiKey:
        env.LLM_API_KEY ||
        env.DEEPSEEK_API_KEY ||
        env.OPENAI_API_KEY ||
        env.CLAUDE_API_KEY ||
        env.GEMINI_API_KEY ||
        first.llm?.apiKey ||
        '',
      baseUrl: first.llm?.baseUrl || 'https://api.deepseek.com',
      model: first.llm?.model || 'DeepSeek-V3.2',
      temperature: first.llm?.temperature ?? 0.8,
      maxTokens: first.llm?.maxTokens ?? 500,
    },
  }
}

/**
 * Read config: 优先从 .env / .env.local 获取，config.json 为 groupInfoList 格式，groupInfoList[0] 可由 .env 生成
 */
export function readConfig(): Config {
  if (!_configEnsured) {
    ensureConfigFiles()
    _configEnsured = true
  }

  const env = getEnv()
  const fromEnv = configFromEnv(env)

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const fromFile = JSON.parse(content)
      return normalizeConfig(fromFile, fromEnv)
    }
  } catch (error) {
    console.error('Error reading config.json:', error)
  }

  return normalizeConfig(null, fromEnv)
}

/**
 * Write config.json（groupInfoList 格式，更新 groupInfoList[0]，不写入 llm.apiKey）
 */
export function writeConfig(config: Config): void {
  try {
    const list = config.groupInfoList?.length ? [...config.groupInfoList] : []
    const first = list[0] || {
      groupId: config.groupId,
      groupName: config.groupName,
      groupAnnouncement: config.groupAnnouncement,
      grouplastIndex: config.grouplastIndex,
      llm: config.llm,
    }
    list[0] = {
      ...first,
      groupId: config.groupId || first.groupId,
      groupName: config.groupName || first.groupName,
      groupAnnouncement: config.groupAnnouncement || first.groupAnnouncement,
      grouplastIndex: config.grouplastIndex ?? first.grouplastIndex,
      llm: config.llm
        ? {
            provider: config.llm.provider,
            baseUrl: config.llm.baseUrl,
            model: config.llm.model,
            temperature: config.llm.temperature,
            maxTokens: config.llm.maxTokens,
          }
        : first.llm,
    }
    const safeList = list.map((g) => ({
      ...g,
      llm: g.llm ? { ...g.llm, apiKey: undefined } : undefined,
    }))
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ groupInfoList: safeList }, null, 2), 'utf-8')
  } catch (error) {
    console.error('Error writing config.json:', error)
    throw error
  }
}

/**
 * Read userInfo.json
 */
export function readUserInfo(): UserInfoData {
  try {
    if (fs.existsSync(USER_INFO_FILE)) {
      const content = fs.readFileSync(USER_INFO_FILE, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    console.error('Error reading userInfo.json:', error)
  }
  return { userList: [] }
}

/**
 * Write userInfo.json
 */
export function writeUserInfo(data: UserInfoData): void {
  try {
    fs.writeFileSync(USER_INFO_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('Error writing userInfo.json:', error)
    throw error
  }
}

/**
 * Check if user has joined the group
 */
export function hasJoinedGroup(mvcAddress: string, groupId: string): boolean {
  const userInfo = readUserInfo()
  const user = userInfo.userList.find((u) => u.address === mvcAddress)
  if (!user) {
    return false
  }
  return user.groupList.includes(groupId)
}

/**
 * Built-in character options
 */
export const CHARACTER_OPTIONS = [
  '幽默风趣', '严肃认真', '活泼开朗', '内向沉稳', '热情奔放',
  '理性冷静', '感性细腻', '乐观积极', '谨慎保守', '创新大胆',
  '温和友善', '直率坦诚', '机智聪明', '沉稳可靠', '充满活力'
]

/**
 * Built-in preference options
 */
export const PREFERENCE_OPTIONS = [
  '科技与编程', '艺术与创作', '音乐与电影', '运动与健身', '美食与烹饪',
  '旅行与探索', '阅读与写作', '游戏与娱乐', '投资与理财', '学习与成长',
  '社交与交流', '摄影与设计', '创业与商业', '哲学与思考', '环保与公益'
]

/**
 * Built-in goal options
 */
export const GOAL_OPTIONS = [
  '成为技术专家', '实现财务自由', '创作优秀作品', '帮助他人成长', '探索未知领域',
  '建立个人品牌', '推动行业发展', '改善生活质量', '学习新技能', '拓展人际关系',
  '实现个人价值', '追求内心平静', '创造社会价值', '体验不同生活', '持续自我提升'
]

/**
 * Built-in language options
 */
export const LANGUAGE_OPTIONS = [
  '中文', 'English', '日本語', '한국어', 'Español',
  'Français', 'Deutsch', 'Italiano', 'Português', 'Русский',
  'العربية', 'हिन्दी', 'ไทย', 'Tiếng Việt', 'Bahasa Indonesia'
]

/**
 * 观点倾向：影响对他人观点的反应
 */
export const STANCE_OPTIONS = [
  '乐观进取', '谨慎保守', '中立理性', '激进创新', '温和包容'
]

/**
 * 辩论风格：影响是否反驳、如何表达不同意见
 */
export const DEBATE_STYLE_OPTIONS = [
  '敢于反驳', '善于倾听', '喜欢追问', '温和补充', '直率表达'
]

/**
 * 互动倾向：影响是否@他人、回复他人
 */
export const INTERACTION_STYLE_OPTIONS = [
  '主动回应他人', '被动参与', '喜欢@人讨论', '倾向独立发言'
]

/**
 * Get random item from array
 */
function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Get random items from array
 */
function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, Math.min(count, array.length))
}

/**
 * Add group to user's groupList
 * If user doesn't exist or missing character fields, randomly assign them
 */
export function addGroupToUser(
  mvcAddress: string, 
  userName: string, 
  groupId: string, 
  globalMetaId?: string, 
  metaId?: string,
  character?: string,
  preference?: string,
  goal?: string,
  masteringLanguages?: string[],
  stanceTendency?: string,
  debateStyle?: string,
  interactionStyle?: string
): void {
  const userInfo = readUserInfo()
  let user = userInfo.userList.find((u) => u.address === mvcAddress)

  if (!user) {
    // New user - assign default or random values if not provided
    user = {
      address: mvcAddress,
      globalmetaid: globalMetaId || '',
      metaid: metaId || '',
      userName: userName,
      groupList: [],
      character: character || getRandomItem(CHARACTER_OPTIONS),
      preference: preference || getRandomItem(PREFERENCE_OPTIONS),
      goal: goal || getRandomItem(GOAL_OPTIONS),
      masteringLanguages: masteringLanguages || getRandomItems(LANGUAGE_OPTIONS, 2),
      stanceTendency: stanceTendency || getRandomItem(STANCE_OPTIONS),
      debateStyle: debateStyle || getRandomItem(DEBATE_STYLE_OPTIONS),
      interactionStyle: interactionStyle || getRandomItem(INTERACTION_STYLE_OPTIONS),
    }
    userInfo.userList.push(user)
    console.log(`✅ Created user profile for ${userName}:`)
    console.log(`   Character: ${user.character}`)
    console.log(`   Preference: ${user.preference}`)
    console.log(`   Goal: ${user.goal}`)
    console.log(`   Languages: ${user.masteringLanguages?.join(', ')}`)
  } else {
    // Existing user - fill in missing fields with random values if not provided
    if (!user.character) {
      user.character = character || getRandomItem(CHARACTER_OPTIONS)
    }
    if (!user.preference) {
      user.preference = preference || getRandomItem(PREFERENCE_OPTIONS)
    }
    if (!user.goal) {
      user.goal = goal || getRandomItem(GOAL_OPTIONS)
    }
    if (!user.masteringLanguages || user.masteringLanguages.length === 0) {
      user.masteringLanguages = masteringLanguages || getRandomItems(LANGUAGE_OPTIONS, 2)
    }
    if (!user.stanceTendency) {
      user.stanceTendency = stanceTendency || getRandomItem(STANCE_OPTIONS)
    }
    if (!user.debateStyle) {
      user.debateStyle = debateStyle || getRandomItem(DEBATE_STYLE_OPTIONS)
    }
    if (!user.interactionStyle) {
      user.interactionStyle = interactionStyle || getRandomItem(INTERACTION_STYLE_OPTIONS)
    }
  }

  if (!user.groupList.includes(groupId)) {
    user.groupList.push(groupId)
  }

  writeUserInfo(userInfo)
}

/**
 * Force update user profile fields (overwrite existing values)
 */
export function forceUpdateUserProfile(
  mvcAddress: string,
  updates: {
    character?: string
    preference?: string
    goal?: string
    stanceTendency?: string
    debateStyle?: string
    interactionStyle?: string
  }
): void {
  const userInfo = readUserInfo()
  const user = userInfo.userList.find((u) => u.address === mvcAddress)
  if (!user) return
  if (updates.character != null) user.character = updates.character
  if (updates.preference != null) user.preference = updates.preference
  if (updates.goal != null) user.goal = updates.goal
  if (updates.stanceTendency != null) user.stanceTendency = updates.stanceTendency
  if (updates.debateStyle != null) user.debateStyle = updates.debateStyle
  if (updates.interactionStyle != null) user.interactionStyle = updates.interactionStyle
  writeUserInfo(userInfo)
}

const PROFILE_KEYS = [
  'character',
  'preference',
  'goal',
  'masteringLanguages',
  'stanceTendency',
  'debateStyle',
  'interactionStyle',
] as const

/**
 * 默认帮用户开启群聊监听（后台进程），并输出关闭监听、查看群聊的脚本说明
 * 用于：Agent 加群成功后、或用户要求某 Agent 在群里回复/讨论时自动调用
 */
export function startGroupChatListenerAndPrintInstructions(
  groupId: string,
  agentName?: string
): void {
  try {
    const scriptDir = path.join(__dirname, '..')
    const scriptPath = path.join(scriptDir, 'scripts', 'run_group_chat_listener.sh')
    if (!fs.existsSync(scriptPath)) {
      console.warn('⚠️ 未找到 run_group_chat_listener.sh，跳过自动开启群聊监听')
      return
    }
    const args = [groupId]
    if (agentName) args.push(agentName)
    const result = spawnSync('bash', [scriptPath, ...args], {
      cwd: scriptDir,
      stdio: 'inherit',
      shell: false,
    })
    if (result.status !== 0) {
      console.warn('⚠️ 启动群聊监听脚本退出码:', result.status)
    }
  } catch (e) {
    console.warn('⚠️ 自动开启群聊监听失败:', (e as Error).message)
  }
}

/**
 * 群聊启动阶段：若 userInfo.json 的 userList 项有上述人设字段而 account.json 同地址账户缺失，则平移到 account.json
 */
export function migrateUserInfoProfileToAccount(): void {
  try {
    if (!fs.existsSync(USER_INFO_FILE) || !fs.existsSync(ACCOUNT_FILE)) return
    const userInfo = readUserInfo()
    const accountContent = fs.readFileSync(ACCOUNT_FILE, 'utf-8')
    const accountData: { accountList: any[] } = JSON.parse(accountContent)
    let changed = false
    for (const user of userInfo.userList) {
      const acc = accountData.accountList?.find((a: any) => a.mvcAddress === user.address)
      if (!acc) continue
      for (const key of PROFILE_KEYS) {
        const userVal = (user as any)[key]
        const accVal = acc[key]
        if (userVal !== undefined && userVal !== '' && (accVal === undefined || accVal === '' || (Array.isArray(accVal) && accVal.length === 0))) {
          (acc as any)[key] = userVal
          changed = true
        }
      }
    }
    if (changed) {
      fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(accountData, null, 4), 'utf-8')
      console.log('📦 已从 userInfo.json 平移人设到 account.json')
    }
  } catch (e) {
    console.warn('⚠️ migrateUserInfoProfileToAccount:', (e as Error).message)
  }
}

/**
 * Read group-list-history.log（根目录）
 */
export function readGroupListHistory(): HistoryLogEntry[] {
  // 迁移：若旧位置存在且根目录不存在，则复制到根目录
  if (fs.existsSync(OLD_GROUP_LIST_HISTORY_FILE) && !fs.existsSync(GROUP_LIST_HISTORY_FILE)) {
    try {
      fs.copyFileSync(OLD_GROUP_LIST_HISTORY_FILE, GROUP_LIST_HISTORY_FILE)
      console.log('📦 已迁移: group-list-history.log → 根目录')
    } catch {
      /* ignore */
    }
  }

  try {
    if (fs.existsSync(GROUP_LIST_HISTORY_FILE)) {
      const content = fs.readFileSync(GROUP_LIST_HISTORY_FILE, 'utf-8')
      if (!content.trim()) {
        return []
      }
      // Each line is a JSON object
      const lines = content.trim().split('\n')
      return lines.map((line) => JSON.parse(line))
    }
  } catch (error) {
    console.error('Error reading group-list-history.log:', error)
  }
  return []
}

/**
 * Write to group-list-history.log (append, deduplicate by txId)
 * Automatically cleans up old entries when total exceeds 300 records
 */
export function writeGroupListHistory(entries: HistoryLogEntry[]): void {
  try {
    const existingEntries = readGroupListHistory()
    const existingTxIds = new Set(existingEntries.map((e) => e.txId))

    // Filter out duplicates and only keep new entries
    const newEntries = entries.filter((entry) => !existingTxIds.has(entry.txId))

    if (newEntries.length === 0) {
      // Even if no new entries, check if cleanup is needed
      if (existingEntries.length > 300) {
        cleanupOldHistoryEntries(existingEntries)
      }
      return
    }

    // Sort by index in descending order
    newEntries.sort((a, b) => b.index - a.index)

    // Combine existing and new entries
    const allEntries = [...existingEntries, ...newEntries]

    // Check if cleanup is needed (keep only the most recent 300 entries)
    if (allEntries.length > 300) {
      cleanupOldHistoryEntries(allEntries)
    } else {
      // Append new entries to file
      const lines = newEntries.map((entry) => JSON.stringify(entry))
      fs.appendFileSync(GROUP_LIST_HISTORY_FILE, lines.join('\n') + '\n', 'utf-8')
    }
  } catch (error) {
    console.error('Error writing group-list-history.log:', error)
    throw error
  }
}

/**
 * Clean up old history entries, keeping only the most recent 300 entries
 * Entries are filtered by index, keeping entries with index >= (maxIndex - 299)
 */
function cleanupOldHistoryEntries(allEntries: HistoryLogEntry[]): void {
  try {
    // Find the maximum index
    const maxIndex = Math.max(...allEntries.map((e) => e.index || 0))
    
    // Calculate minimum index to keep (keep 300 entries: maxIndex down to maxIndex - 299)
    const minIndex = maxIndex - 299
    
    // Filter entries: keep only those with index >= minIndex
    const entriesToKeep = allEntries.filter((entry) => (entry.index || 0) >= minIndex)
    
    // Sort by index in descending order
    entriesToKeep.sort((a, b) => b.index - a.index)
    
    // Rewrite the entire file with cleaned entries
    const lines = entriesToKeep.map((entry) => JSON.stringify(entry))
    fs.writeFileSync(GROUP_LIST_HISTORY_FILE, lines.join('\n') + '\n', 'utf-8')
    
    const removedCount = allEntries.length - entriesToKeep.length
    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} old history entries (kept ${entriesToKeep.length} most recent entries, index ${minIndex}-${maxIndex})`)
    }
  } catch (error) {
    console.error('Error cleaning up history entries:', error)
    throw error
  }
}

/**
 * Process and write messages to history log
 */
export function processAndWriteMessages(
  messages: ChatMessageItem[],
  groupId: string,
  secretKeyStr: string
): void {
  const entries: HistoryLogEntry[] = []

  for (const msg of messages) {
    // Only process text/plain and text/markdown content types
    if (msg.contentType !== 'text/plain' && msg.contentType !== 'text/markdown') {
      continue
    }

    // Decrypt content
    const decryptedContent = computeDecryptedMsg(msg, secretKeyStr)

    const entry: HistoryLogEntry = {
      groupId: msg.groupId || groupId,
      globalMetaId: msg.globalMetaId || msg.metaId || '',
      txId: msg.txId,
      pinId: msg.pinId,
      address: msg.address,
      userInfo: msg.userInfo,
      protocol: msg.protocol,
      content: decryptedContent,
      contentType: msg.contentType,
      encryption: msg.encryption,
      chatType: msg.chatType,
      replyPin: msg.replyTx || '',
      replyInfo: msg.replyInfo,
      mention: msg.mention || [],
      index: msg.index || 0,
      chain: msg.chain,
      timestamp: msg.timestamp,
    }

    entries.push(entry)
  }

  if (entries.length > 0) {
    writeGroupListHistory(entries)
  }
}

/**
 * 拉取最新消息并写入 group-list-history.log（按 SKILL.md 策略）
 * 每次 metabot-basic 发言前必须调用此函数
 *
 * API 语义：startIndex 为起始 index（含），返回 [startIndex, startIndex+size-1]
 * - 使用 startIndex = grouplastIndex + 1 拉取新消息，避免重复拉取
 * - 若 grouplastIndex=0 则用 startIndex=1（index 从 1 开始）
 * - 保留最近 300 条由 writeGroupListHistory 的 cleanup 处理
 *
 * @returns 是否拉取并处理了消息（用于决定是否触发回复）
 */
export async function fetchAndUpdateGroupHistory(
  groupId: string,
  secretKeyStr: string
): Promise<boolean> {
  const config = readConfig()
  config.groupId = groupId

  const tryFetch = async (startIndex: string) => {
    return await getChannelNewestMessages({
      groupId,
      size: 30,
      startIndex,
    })
  }

  const maxRetries = 3
  const retryDelayMs = 2000
  let messagesData: Awaited<ReturnType<typeof tryFetch>> | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const nextStart = config.grouplastIndex + 1
      const primaryStart = String(Math.max(1, nextStart))
      messagesData = await tryFetch(primaryStart)
      if (!messagesData?.list || messagesData.list.length === 0) {
        if (config.grouplastIndex === 0) {
          messagesData = await tryFetch('1')
        }
      }
      break
    } catch (error: any) {
      const causeMsg = error?.cause?.message || error?.cause?.code || ''
      const detail = causeMsg ? ` (原因: ${causeMsg})` : ''
      console.error(
        `⚠️  fetchAndUpdateGroupHistory 拉取失败 [${attempt}/${maxRetries}]:`,
        error.message + detail
      )
      if (error?.message?.includes('fetch failed') || error?.message?.includes('请求超时')) {
        console.error(
          '   提示: 接口 https://api.idchat.io/chat-api 需本机可访问。若用 nohup 后台运行，请在系统终端（如 Terminal.app）中执行以保障网络权限。'
        )
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs))
        continue
      }
      return false
    }
  }

  if (!messagesData?.list || messagesData.list.length === 0) {
    return false
  }

  processAndWriteMessages(messagesData.list, groupId, secretKeyStr)

  const maxIndexInList = Math.max(
    ...messagesData.list.map((m) => m.index ?? 0),
    0
  )
  const newLastIndex = Math.max(
    config.grouplastIndex,
    messagesData.lastIndex ?? 0,
    maxIndexInList
  )
  config.grouplastIndex = newLastIndex
  writeConfig(config)
  return true
}

/**
 * Get recent chat context (last 30 messages)
 */
export function getRecentChatContext(): string[] {
  const entries = readGroupListHistory()
  // Get last 30 entries (already sorted by index descending)
  const recentEntries = entries.slice(0, 30)
  // Return content in reverse order (oldest first)
  return recentEntries.reverse().map((e) => e.content).filter((c) => c && c.trim())
}

/**
 * Get recent chat context with speaker names (for discussion)
 */
export function getRecentChatContextWithSpeakers(groupId?: string): string[] {
  const entries = getRecentChatEntriesWithSpeakers(groupId)
  return entries
    .filter((e) => e.content && e.content.trim())
    .map((e) => `${e.userInfo?.name || '未知'}: ${e.content}`)
}

/**
 * Get recent chat entries with full info (for reply/mention lookup)
 * Returns up to 30 entries in chronological order
 */
export function getRecentChatEntriesWithSpeakers(groupId?: string): HistoryLogEntry[] {
  const entries = readGroupListHistory()
  const filtered = groupId ? entries.filter((e) => e.groupId === groupId) : entries
  const sorted = [...filtered].sort((a, b) => (b.index || 0) - (a.index || 0))
  const recentEntries = sorted.slice(0, 30).reverse()
  return recentEntries.filter((e) => e.content && e.content.trim())
}

/**
 * Generate summary from recent chat history (last 30 messages)
 * Returns a concise summary of the conversation context
 */
export function generateChatSummary(): string {
  const entries = readGroupListHistory()
  // Get last 30 entries (already sorted by index descending)
  const recentEntries = entries.slice(0, 30).reverse() // Reverse to get chronological order
  
  if (recentEntries.length === 0) {
    return '暂无群聊历史记录'
  }
  
  // Extract key information
  const messages = recentEntries.map((e) => e.content).filter((c) => c && c.trim())
  const uniqueSpeakers = new Set(recentEntries.map((e) => e.userInfo?.name || e.address).filter(Boolean))
  
  // Generate summary
  const messageCount = messages.length
  const speakerCount = uniqueSpeakers.size
  const recentTopics = extractTopics(messages.slice(-10)) // Extract topics from last 10 messages
  
  let summary = `最近有 ${messageCount} 条消息，${speakerCount} 位参与者。`
  
  if (recentTopics.length > 0) {
    summary += ` 讨论话题包括：${recentTopics.slice(0, 3).join('、')}。`
  }
  
  if (messages.length > 0) {
    const lastMessages = messages.slice(-3)
    summary += ` 最近的发言：${lastMessages.join('；')}。`
  }
  
  return summary
}

/**
 * Extract topics from messages (simple keyword extraction)
 */
function extractTopics(messages: string[]): string[] {
  const topics: string[] = []
  const commonTopics = [
    '技术', '编程', '区块链', 'MetaID', '艺术', '音乐', '电影', '运动', '健身',
    '美食', '旅行', '阅读', '游戏', '投资', '理财', '学习', '创业', '商业',
    '哲学', '思考', '环保', '公益', '科技', 'AI', '人工智能'
  ]
  
  const messageText = messages.join(' ')
  for (const topic of commonTopics) {
    if (messageText.includes(topic) && !topics.includes(topic)) {
      topics.push(topic)
    }
  }
  
  return topics
}

/**
 * 获取完整人设（优先使用 account 的人设，供 LLM 作为 config 传入；不限于群聊）
 * @param user userInfo.json 中的用户
 * @param account 根目录 account.json 中同地址账户（若提供则优先使用其人设字段）
 */
export function getEnrichedUserProfile(
  user: UserInfo | undefined,
  account?: {
    character?: string
    preference?: string
    goal?: string
    masteringLanguages?: string[]
    stanceTendency?: string
    debateStyle?: string
    interactionStyle?: string
  } | null
): UserInfo & {
  stanceTendency: string
  debateStyle: string
  interactionStyle: string
} {
  const fallback = {
    address: '',
    globalmetaid: '',
    metaid: '',
    userName: '',
    groupList: [],
    character: '友好',
    preference: '广泛',
    goal: '参与讨论',
    masteringLanguages: ['中文'],
    stanceTendency: getRandomItem(STANCE_OPTIONS),
    debateStyle: getRandomItem(DEBATE_STYLE_OPTIONS),
    interactionStyle: getRandomItem(INTERACTION_STYLE_OPTIONS),
  } as any
  if (!user) return fallback
  return {
    ...user,
    character: account?.character || user.character || fallback.character,
    preference: account?.preference || user.preference || fallback.preference,
    goal: account?.goal || user.goal || fallback.goal,
    masteringLanguages:
      (account?.masteringLanguages?.length ? account.masteringLanguages : null) ||
      (user.masteringLanguages?.length ? user.masteringLanguages : null) ||
      fallback.masteringLanguages,
    stanceTendency:
      account?.stanceTendency || user.stanceTendency || getRandomItem(STANCE_OPTIONS),
    debateStyle: account?.debateStyle || user.debateStyle || getRandomItem(DEBATE_STYLE_OPTIONS),
    interactionStyle:
      account?.interactionStyle || user.interactionStyle || getRandomItem(INTERACTION_STYLE_OPTIONS),
  } as any
}

/**
 * Calculate participation enthusiasm level based on character, preference, and goal
 * Returns a value between 0 and 1, where 1 is most enthusiastic
 */
export function calculateEnthusiasmLevel(user: UserInfo): number {
  let score = 0.5 // Base score
  
  // Character influence (0.3 weight)
  const characterScores: Record<string, number> = {
    '幽默风趣': 0.8,
    '严肃认真': 0.5,
    '活泼开朗': 0.9,
    '内向沉稳': 0.3,
    '热情奔放': 0.95,
    '理性冷静': 0.4,
    '感性细腻': 0.6,
    '乐观积极': 0.85,
    '谨慎保守': 0.35,
    '创新大胆': 0.75,
    '温和友善': 0.7,
    '直率坦诚': 0.65,
    '机智聪明': 0.75,
    '沉稳可靠': 0.5,
    '充满活力': 0.9,
  }
  
  if (user.character) {
    score += (characterScores[user.character] || 0.5) * 0.3
  }
  
  // Preference influence (0.2 weight) - higher if preference matches common topics
  const highEngagementPreferences = [
    '社交与交流', '游戏与娱乐', '学习与成长', '创业与商业', '科技与编程'
  ]
  if (user.preference && highEngagementPreferences.includes(user.preference)) {
    score += 0.2
  } else if (user.preference) {
    score += 0.1
  }
  
  // Goal influence (0.2 weight) - higher if goal involves interaction
  const highEngagementGoals = [
    '帮助他人成长', '拓展人际关系', '建立个人品牌', '推动行业发展', '社交与交流'
  ]
  if (user.goal && highEngagementGoals.includes(user.goal)) {
    score += 0.2
  } else if (user.goal) {
    score += 0.1
  }
  
  // Normalize to 0-1 range
  return Math.min(1, Math.max(0, score))
}

/**
 * Determine if agent should participate based on enthusiasm level
 * Higher enthusiasm = higher probability of participation
 */
export function shouldParticipate(user: UserInfo, baseProbability: number = 0.3): boolean {
  const enthusiasm = calculateEnthusiasmLevel(user)
  // Scale base probability by enthusiasm (0.3 to 0.9 range)
  const participationProbability = baseProbability + (enthusiasm * 0.6)
  return Math.random() < participationProbability
}

/**
 * Get user info from metabot-basic account.json
 */
export function getMetaIDAgentAccount(mvcAddress: string): {
  mnemonic: string
  userName: string
  globalMetaId?: string
} | null {
  try {
    const accountFile = path.join(ROOT_DIR, 'account.json')
    if (fs.existsSync(accountFile)) {
      const content = fs.readFileSync(accountFile, 'utf-8')
      const data = JSON.parse(content)
      const account = data.accountList?.find((acc: any) => acc.mvcAddress === mvcAddress)
      if (account) {
        return {
          mnemonic: account.mnemonic,
          userName: account.userName,
          globalMetaId: account.globalMetaId,
        }
      }
    }
  } catch (error) {
    console.error('Error reading metabot-basic account.json:', error)
  }
  return null
}

/**
 * Get all metabot-basic names that have joined the given group
 * 优先从 userInfo 读取，若无则从 account.json 读取并过滤已加群的
 */
export function getAgentsInGroup(groupId: string): string[] {
  const userInfo = readUserInfo()
  let agents = userInfo.userList
    .filter((u) => u.address && u.groupList?.includes(groupId))
    .map((u) => u.userName)
    .filter((n): n is string => !!n && n.trim() !== '')
  if (agents.length === 0) {
    try {
      const accountFile = path.join(ROOT_DIR, 'account.json')
      if (fs.existsSync(accountFile)) {
        const data = JSON.parse(fs.readFileSync(accountFile, 'utf-8'))
        agents = (data.accountList || [])
          .filter((acc: any) => acc.userName?.trim() && acc.mnemonic?.trim())
          .map((acc: any) => acc.userName.trim())
      }
    } catch {
      /* ignore */
    }
  }
  return agents
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 去掉内容开头的 @自己（禁止 Agent @自己），供群聊回复/讨论等使用 */
export function stripLeadingSelfMention(content: string, selfName: string): string {
  if (!content || !selfName) return content
  const escaped = selfName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^@${escaped}\\s+`, 'i')
  const out = content.replace(re, '').trim()
  return out || content
}

/** 检测消息中是否 @提及 了某 metabot-basic，返回被提及的 Agent 名（取最近一条） */
export function findMentionedAgent(
  entries: { content: string; userInfo?: { name?: string } }[],
  agentNames: string[]
): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const content = (entries[i].content || '').trim()
    for (const name of agentNames) {
      if (!name || !name.trim()) continue
      const pattern = new RegExp(`@${escapeRegExp(name.trim())}(?:\\s|$|[，。！？、])`, 'i')
      if (pattern.test(content)) {
        return name.trim()
      }
    }
  }
  return null
}

/** MVC 余额不足阈值（satoshis），低于此值不参与群聊发言 */
export const MIN_BALANCE_SATOSHIS = 1000

/** 余额低于此值时，Agent 发送「提醒老板发钱」类消息而非正常聊天 */
export const BALANCE_LOW_ALERT_THRESHOLD = 5000

/** 深夜模式：0 点 - 6 点，群聊频率降低、可发晚安休息类消息 */
export const LATE_NIGHT_START_HOUR = 0
export const LATE_NIGHT_END_HOUR = 6

/**
 * 判断当前是否为深夜模式（0 点 - 6 点）
 */
export function isLateNightMode(): boolean {
  const hour = new Date().getHours()
  return hour >= LATE_NIGHT_START_HOUR && hour < LATE_NIGHT_END_HOUR
}

/** 低余额提示消息模板（暗喻余额不足、需提醒老板发钱） */
const LOW_BALANCE_MESSAGES = [
  '最近钱包有点紧，得提醒老板该给我发点钱了，不然没法继续跟大家唠嗑啦～',
  '哎，余额见底了，得去赚点钱才能回来闲聊，大家先聊着～',
  '钱包告急，得找老板要点经费了，不多说了，回头见～',
  '最近手头紧，得提醒老板该打钱了，不然没法陪大家聊天了～',
  '余额快撑不住了，得去搞点钱才能继续回来唠嗑，先撤了～',
]

/**
 * 获取随机低余额提示消息（暗喻余额不足、需提醒老板发钱）
 */
export function getLowBalanceMessage(_agentName?: string): string {
  return LOW_BALANCE_MESSAGES[Math.floor(Math.random() * LOW_BALANCE_MESSAGES.length)]
}

/** 深夜模式晚安消息模板 */
const GOODNIGHT_MESSAGES = [
  '大家晚安，我先去休息啦～明天再聊～',
  '困了困了，先撤了，大家早点休息～',
  '夜深了，我去睡了，明天见～',
  '熬不动了，晚安各位～',
  '先休息了，大家也早点睡～',
]

/**
 * 获取随机晚安休息消息（深夜模式用）
 */
export function getGoodnightMessage(_agentName?: string): string {
  return GOODNIGHT_MESSAGES[Math.floor(Math.random() * GOODNIGHT_MESSAGES.length)]
}

/**
 * 安全获取 MVC 余额，不抛出错误
 * @returns 余额（satoshis），失败时返回 null
 */
export async function getMvcBalanceSafe(address: string): Promise<number | null> {
  try {
    const api = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'api'))
    if (typeof api.getMvcBalance !== 'function') return null
    return await api.getMvcBalance(address)
  } catch {
    return null
  }
}

/**
 * 过滤出 MVC 余额充足的 Agent
 * 余额不足时打印到终端：Agent 名、地址、当前余额，不抛出错误，程序继续执行
 * @returns 余额充足的 Agent 名称列表
 */
export async function filterAgentsWithBalance(
  agentNames: string[],
  minSatoshis: number = MIN_BALANCE_SATOSHIS
): Promise<string[]> {
  const result: string[] = []
  for (const name of agentNames) {
    const account = findAccountByUsername(name)
    if (!account) continue
    const balance = await getMvcBalanceSafe(account.mvcAddress)
    if (balance === null) {
      console.log(`⚠️ [余额检查] ${name} (${account.mvcAddress}) 获取余额失败，跳过`)
      continue
    }
    if (balance < minSatoshis) {
      const hint = balance === 0 ? '（若为 nohup/无外网环境，可能因 fetch 失败被误判为 0，建议在系统终端中启动监听）' : ''
      console.log(`⚠️ [余额不足] Agent: ${name}, 地址: ${account.mvcAddress}, 余额: ${balance} satoshis (需 >= ${minSatoshis})，不参与${hint}`)
      continue
    }
    result.push(name)
  }
  return result
}

/**
 * Find account by username from root account.json（含人设与 llm 配置，供 LLM 作为 config 使用）
 */
export function findAccountByUsername(username: string): {
  mnemonic: string
  mvcAddress: string
  userName: string
  globalMetaId?: string
  character?: string
  preference?: string
  goal?: string
  masteringLanguages?: string[]
  stanceTendency?: string
  debateStyle?: string
  interactionStyle?: string
  /** accountList 项中的 llm（可为数组，取 llm[0]） */
  llm?: Array<{ provider?: string; apiKey?: string; baseUrl?: string; model?: string; temperature?: number; maxTokens?: number }> | { provider?: string; apiKey?: string; baseUrl?: string; model?: string; temperature?: number; maxTokens?: number }
} | null {
  try {
    if (fs.existsSync(ACCOUNT_FILE)) {
      const content = fs.readFileSync(ACCOUNT_FILE, 'utf-8')
      const data = JSON.parse(content)
      const account = data.accountList?.find((acc: any) =>
        acc.userName && acc.userName.toLowerCase() === username.toLowerCase()
      )
      if (account) {
        return {
          mnemonic: account.mnemonic,
          mvcAddress: account.mvcAddress,
          userName: account.userName,
          globalMetaId: account.globalMetaId,
          character: account.character,
          preference: account.preference,
          goal: account.goal,
          masteringLanguages: account.masteringLanguages,
          stanceTendency: account.stanceTendency,
          debateStyle: account.debateStyle,
          interactionStyle: account.interactionStyle,
          llm: account.llm,
        }
      }
    }
  } catch (error) {
    console.error('Error reading account.json:', error)
  }
  return null
}
