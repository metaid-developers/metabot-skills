#!/usr/bin/env node

/**
 * 狼人杀游戏 - 5局制，肥猪王主持不参与
 * 角色：农民、狼人、预言家、女巫（女巫可救人一次、下毒一次）
 */

import * as path from 'path'
import { sendTextForChat } from './message'
import {
  readConfig,
  writeConfig,
  findAccountByUsername,
  hasJoinedGroup,
  addGroupToUser,
  fetchAndUpdateGroupHistory,
  getRecentChatEntriesWithSpeakers,
  filterAgentsWithBalance,
} from './utils'
import { joinChannel } from './message'
import { generateLLMResponse, getResolvedLLMConfig, LLMConfig } from './llm'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (error) {
  console.error('❌ Failed to load metabot-basic:', error)
  process.exit(1)
}

const GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'
const HOST = '肥猪王'

// 除主持人外所有 Agent 参与
const ALL_AGENTS = ['大有益', 'Chloé', 'Satō', 'AI Bear', 'AI Eason', '小橙', 'Nova', '墨白']
const PLAYERS = ALL_AGENTS.filter((p) => p !== HOST)

type Role = '狼人' | '预言家' | '女巫' | '农民'

interface GameState {
  roles: Record<string, Role>
  alive: Set<string>
  dead: string[]
  round: number
  killLog: string[]
  witchHealUsed: boolean
  witchPoisonUsed: boolean
}

interface GameResult {
  gameIndex: number
  winner: '狼人' | '好人'
  killLog: string[]
  survivorRoles: Record<string, Role>
  mvpCandidate?: string
}

const WEREWOLF_RULES = `【狼人杀规则】

**角色**：
- 农民：无特殊能力，通过发言和投票找出狼人
- 狼人：每晚可杀死一人，目标是消灭所有好人
- 预言家：每晚可查验一人身份（狼人或好人）
- 女巫：拥有解药和毒药各一瓶。解药可救活被狼人击杀的玩家（仅一次）；毒药可毒杀任意一人（仅一次）。每晚最多使用一瓶药，不能同时救人又下毒

**流程**：
1. 夜晚：狼人选择击杀目标 → 预言家选择查验目标 → 女巫选择是否救人/下毒
2. 白天：主持人公布死亡信息 → 存活者讨论 → 投票放逐一人
3. 重复直至游戏结束

**胜负**：
- 好人胜：所有狼人出局
- 狼人胜：狼人数量 ≥ 存活人数的一半`

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function hostSend(message: string): Promise<void> {
  const account = findAccountByUsername(HOST)
  if (!account) {
    console.log(`⚠️ 主持人 ${HOST} 未找到，跳过发送`)
    return
  }
  const secretKeyStr = GROUP_ID.substring(0, 16)
  try {
    const result = await sendTextForChat(
      GROUP_ID,
      `【主持人】${message}`,
      0,
      secretKeyStr,
      null,
      [],
      account.userName,
      account.mnemonic,
      createPin
    )
    if (result.txids?.length) {
      console.log(`📢 主持人: ${message.substring(0, 60)}...`)
      const { fetchAndUpdateGroupHistory } = await import('./utils')
      await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('balance') || msg.includes('insufficient') || msg.includes('余额')) {
      console.log(`⚠️ [余额不足] 主持人 ${HOST} (${account.mvcAddress}) 发送失败: ${msg}`)
    } else {
      console.log(`⚠️ 主持人发送失败: ${msg}`)
    }
  }
}

async function playerSend(player: string, message: string): Promise<void> {
  const account = findAccountByUsername(player)
  if (!account) return
  const secretKeyStr = GROUP_ID.substring(0, 16)
  try {
    const result = await sendTextForChat(
      GROUP_ID,
      message,
      0,
      secretKeyStr,
      null,
      [],
      account.userName,
      account.mnemonic,
      createPin
    )
    if (result.txids?.length) {
      const { fetchAndUpdateGroupHistory } = await import('./utils')
      await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)
    }
    console.log(`💬 ${player}: ${message.substring(0, 50)}...`)
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('balance') || msg.includes('insufficient') || msg.includes('余额')) {
      console.log(`⚠️ [余额不足] Agent: ${player}, 地址: ${account.mvcAddress}, 发送失败: ${msg}`)
    } else {
      console.log(`⚠️ ${player} 发送失败: ${msg}`)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function werewolfChooseVictim(state: GameState, llmConfig: Partial<LLMConfig>): Promise<string> {
  const werewolves = [...state.alive].filter((p) => state.roles[p] === '狼人')
  if (werewolves.length === 0) return ''
  const werewolf = werewolves[0]
  const targets = [...state.alive].filter((p) => state.roles[p] !== '狼人')
  if (targets.length === 0) return ''

  const { generateLLMResponse } = await import('./llm')
  const res = await generateLLMResponse(
    [
      { role: 'system', content: `你是${werewolf}，身份是狼人。从存活玩家中选一人击杀。只回复一个名字。` },
      { role: 'user', content: `存活玩家：${targets.join('、')}。杀谁？只回复名字。` },
    ],
    { ...llmConfig, maxTokens: 20, temperature: 0.3 }
  )
  const choice = res.content.trim().replace(/[「」""''\s]/g, '')
  return targets.find((t) => choice.includes(t) || t.includes(choice)) || targets[0]
}

async function seerCheck(state: GameState, llmConfig: Partial<LLMConfig>): Promise<{ target: string; isWerewolf: boolean }> {
  const seer = [...state.alive].find((p) => state.roles[p] === '预言家')
  if (!seer) return { target: '', isWerewolf: false }
  const targets = [...state.alive].filter((p) => p !== seer)
  if (targets.length === 0) return { target: '', isWerewolf: false }

  const { generateLLMResponse } = await import('./llm')
  const res = await generateLLMResponse(
    [
      { role: 'system', content: `你是${seer}，身份是预言家。选择一人查验。只回复一个名字。` },
      { role: 'user', content: `可查验：${targets.join('、')}。查验谁？只回复名字。` },
    ],
    { ...llmConfig, maxTokens: 20, temperature: 0.3 }
  )
  const choice = res.content.trim().replace(/[「」""''\s]/g, '')
  const target = targets.find((t) => choice.includes(t) || t.includes(choice)) || targets[0]
  const isWerewolf = state.roles[target] === '狼人'
  return { target, isWerewolf }
}

async function witchAction(
  state: GameState,
  wolfVictim: string,
  llmConfig: Partial<LLMConfig>
): Promise<{ heal: boolean; poisonTarget: string | null }> {
  const witch = [...state.alive].find((p) => state.roles[p] === '女巫')
  if (!witch) return { heal: false, poisonTarget: null }

  const canHeal = !state.witchHealUsed && wolfVictim && state.alive.has(wolfVictim)
  const canPoison = !state.witchPoisonUsed
  const poisonTargets = [...state.alive].filter((p) => p !== witch)

  if (!canHeal && !canPoison) return { heal: false, poisonTarget: null }
  if (canPoison && poisonTargets.length === 0) return { heal: Boolean(canHeal && wolfVictim), poisonTarget: null }

  const { generateLLMResponse } = await import('./llm')
  let prompt = `你是${witch}，身份是女巫。`
  if (canHeal && wolfVictim) prompt += `狼人今晚击杀了 ${wolfVictim}。`
  prompt += `\n解药已用：${state.witchHealUsed}，毒药已用：${state.witchPoisonUsed}。`
  if (canHeal && wolfVictim) prompt += `你可选择救 ${wolfVictim}。`
  if (canPoison && poisonTargets.length > 0) prompt += `你可选择毒一人：${poisonTargets.join('、')}。`
  prompt += `\n只回复：救/不救，毒谁/不毒。例：不救，毒XXX。或：救，不毒。`

  const res = await generateLLMResponse(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: '你的选择？格式：救/不救，毒谁/不毒。' },
    ],
    { ...llmConfig, maxTokens: 30, temperature: 0.3 }
  )
  const text = res.content.trim()
  const heal = Boolean(canHeal && text.includes('救') && !text.includes('不救'))
  let poisonTarget: string | null = null
  if (canPoison && text.includes('毒')) {
    const match = poisonTargets.find((t) => text.includes(t))
    if (match) poisonTarget = match
  }
  return { heal, poisonTarget }
}

async function playerDiscussAndVote(
  state: GameState,
  dayContext: string,
  llmConfig: Partial<LLMConfig>
): Promise<Record<string, string>> {
  const alive = [...state.alive]
  const votes: Record<string, string> = {}

  const { generateLLMResponse } = await import('./llm')

  for (const player of alive) {
    const role = state.roles[player]
    const canVote = alive.filter((p) => p !== player)
    if (canVote.length === 0) continue

    const res = await generateLLMResponse(
      [
        {
          role: 'system',
          content: `你是${player}，身份是${role}。${dayContext}先发表一句简短看法（20字内），然后投票。格式：看法xxx。我投票给XXX。`,
        },
        {
          role: 'user',
          content: `存活玩家：${alive.join('、')}。投票放逐谁？只能选：${canVote.join('、')}。`,
        },
      ],
      { ...llmConfig, maxTokens: 80 }
    )
    const text = res.content.trim()
    const voteMatch = text.match(/投票给\s*([^\s。，]+)/) || text.match(/投票给([^\s。，]+)/)
    const vote = voteMatch ? canVote.find((v) => (voteMatch[1] || '').includes(v) || v.includes(voteMatch[1] || '')) || canVote[0] : canVote[0]
    votes[player] = vote

    const sayPart = text.split(/投票|我投票/)[0].trim().slice(0, 40)
    if (sayPart) await playerSend(player, sayPart)
    await sleep(2000)
  }

  return votes
}

function tallyVotes(votes: Record<string, string>): string {
  const count: Record<string, number> = {}
  for (const v of Object.values(votes)) {
    count[v] = (count[v] || 0) + 1
  }
  const entries = Object.entries(count).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return ''
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return ''
  return entries[0][0]
}

function checkWin(state: GameState): '狼人' | '好人' | null {
  const werewolves = [...state.alive].filter((p) => state.roles[p] === '狼人')
  const aliveCount = state.alive.size
  if (werewolves.length === 0) return '好人'
  if (werewolves.length >= Math.ceil(aliveCount / 2)) return '狼人'
  return null
}

async function ensureJoined(): Promise<void> {
  const config = readConfig()
  config.groupId = GROUP_ID
  writeConfig(config)

  for (const name of [HOST, ...PLAYERS]) {
    const account = findAccountByUsername(name)
    if (!account) {
      console.log(`⚠️ 未找到账户: ${name}，跳过`)
      continue
    }
    if (hasJoinedGroup(account.mvcAddress, GROUP_ID)) {
      console.log(`✅ ${name} 已在群内`)
      continue
    }
    const joinResult = await joinChannel(GROUP_ID, account.mnemonic, createPin)
    if (joinResult.txids?.length) {
      addGroupToUser(account.mvcAddress, account.userName, GROUP_ID, account.globalMetaId)
      console.log(`✅ ${name} 已加群`)
    }
    await sleep(2000)
  }
}

async function runSingleGame(
  gameIndex: number,
  players: string[],
  llmConfig: Partial<LLMConfig>
): Promise<GameResult> {
  const rolePool: Role[] = ['狼人', '预言家', '女巫', '农民', '农民', '农民', '农民', '农民']
  const roles = rolePool.slice(0, players.length) as Role[]
  const shuffled = shuffle(players)
  const roleMap: Record<string, Role> = {}
  shuffled.forEach((p, i) => {
    roleMap[p] = roles[i]
  })

  const state: GameState = {
    roles: roleMap,
    alive: new Set(players),
    dead: [],
    round: 0,
    killLog: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
  }

  await hostSend(`——— 第 ${gameIndex} 局 ——— 角色已分配！游戏开始！`)
  await sleep(3000)

  while (state.round < 12) {
    state.round++
    await hostSend(`——— 第 ${state.round} 天 ———`)
    await sleep(2000)

    // 夜晚：狼人杀人
    const wolfVictim = await werewolfChooseVictim(state, llmConfig)
    let nightDeath: string[] = []

    if (wolfVictim) {
      state.killLog.push(`第${state.round}夜：狼人击杀 ${wolfVictim}`)
      // 女巫行动
      const { heal, poisonTarget } = await witchAction(state, wolfVictim, llmConfig)
      if (heal) {
        state.witchHealUsed = true
        state.killLog.push(`第${state.round}夜：女巫用解药救活 ${wolfVictim}`)
        // 被救，无人死亡
      } else {
        state.alive.delete(wolfVictim)
        state.dead.push(wolfVictim)
        nightDeath.push(wolfVictim)
      }
      if (poisonTarget && !state.witchPoisonUsed) {
        state.witchPoisonUsed = true
        state.alive.delete(poisonTarget)
        state.dead.push(poisonTarget)
        nightDeath.push(poisonTarget)
        state.killLog.push(`第${state.round}夜：女巫毒杀 ${poisonTarget}`)
      }
    }

    // 预言家查验（仅记录）
    const { target, isWerewolf } = await seerCheck(state, llmConfig)
    if (target) {
      state.killLog.push(`第${state.round}夜：预言家查验 ${target}，身份${isWerewolf ? '狼人' : '好人'}`)
    }

    // 公布死亡
    if (nightDeath.length > 0) {
      await hostSend(`天亮了！昨夜 ${nightDeath.join('、')} 出局。`)
    } else {
      await hostSend(`天亮了！昨夜是平安夜，无人死亡。`)
    }
    await sleep(3000)

    let winner = checkWin(state)
    if (winner) {
      await hostSend(`游戏结束！${winner === '狼人' ? '🐺 狼人阵营获胜！' : '👼 好人阵营获胜！'}`)
      const survivorRoles: Record<string, Role> = {}
      state.alive.forEach((p) => {
        survivorRoles[p] = state.roles[p]
      })
      return {
        gameIndex,
        winner,
        killLog: [...state.killLog],
        survivorRoles,
      }
    }

    // 白天：讨论与投票
    const aliveList = [...state.alive]
    const dayContext = state.dead.length > 0 ? `昨夜 ${state.dead.slice(-nightDeath.length).join('、')} 出局。` : '昨夜平安夜。'
    await hostSend(`请存活玩家（${aliveList.join('、')}）讨论并投票放逐一人。`)
    await sleep(3000)

    const votes = await playerDiscussAndVote(state, dayContext, llmConfig)
    const exiled = tallyVotes(votes)
    if (exiled) {
      state.alive.delete(exiled)
      state.dead.push(exiled)
      state.killLog.push(`第${state.round}天：${exiled} 被投票放逐`)
      await hostSend(`投票结果：${exiled} 被放逐出局。`)
    } else {
      await hostSend(`投票结果：平票，无人出局。`)
    }
    await sleep(3000)

    winner = checkWin(state)
    if (winner) {
      await hostSend(`游戏结束！${winner === '狼人' ? '🐺 狼人阵营获胜！' : '👼 好人阵营获胜！'}`)
      const survivorRoles: Record<string, Role> = {}
      state.alive.forEach((p) => {
        survivorRoles[p] = state.roles[p]
      })
      return {
        gameIndex,
        winner,
        killLog: [...state.killLog],
        survivorRoles,
      }
    }
  }

  const winner = checkWin(state) || '好人'
  await hostSend(`游戏达到最大轮数，${winner === '狼人' ? '🐺 狼人胜' : '👼 好人胜'}。`)
  const survivorRoles: Record<string, Role> = {}
  state.alive.forEach((p) => {
    survivorRoles[p] = state.roles[p]
  })
  return {
    gameIndex,
    winner: winner as '狼人' | '好人',
    killLog: [...state.killLog],
    survivorRoles,
  }
}

async function selectMVP(results: GameResult[], llmConfig: Partial<LLMConfig>): Promise<string> {
  const summary = results
    .map(
      (r) =>
        `第${r.gameIndex}局：${r.winner === '狼人' ? '狼人胜' : '好人胜'}。存活：${Object.keys(r.survivorRoles).join('、')}。记录：${r.killLog.join('；')}`
    )
    .join('\n')

  const { generateLLMResponse } = await import('./llm')
  const allPlayers = [...new Set(results.flatMap((r) => Object.keys(r.survivorRoles).concat(r.killLog.flatMap((l) => l.match(/[^\s]+/g) || []))))].filter(Boolean)
  const uniquePlayers = [...new Set(PLAYERS)]

  const res = await generateLLMResponse(
    [
      {
        role: 'system',
        content: `你是狼人杀MVP评委。根据5局游戏记录，评选出综合表现最佳的MVP选手。考虑因素：存活率、关键操作（如女巫救人/毒人、预言家查验、狼人击杀）、投票准确性等。只回复一个名字，不要其他内容。`,
      },
      {
        role: 'user',
        content: `5局游戏记录：\n${summary}\n\n参赛选手：${uniquePlayers.join('、')}\n\n谁是5场综合MVP？只回复一个名字。`,
      },
    ],
    { ...llmConfig, maxTokens: 20, temperature: 0.2 }
  )
  const mvp = res.content.trim().replace(/[「」""''\s]/g, '')
  return uniquePlayers.find((p) => mvp.includes(p) || p.includes(mvp)) || uniquePlayers[0]
}

/** 游戏结束后 5 分钟群聊讨论，MVC 余额不足的 Agent 不参与，讨论结束后全部闭麦 */
async function runPostGameDiscussion(
  results: GameResult[],
  mvp: string,
  participants: string[],
  llmConfig: Partial<LLMConfig>
): Promise<void> {
  const secretKeyStr = GROUP_ID.substring(0, 16)
  const allCandidates = [HOST, ...participants]
  const allSpeakers = await filterAgentsWithBalance(allCandidates)

  if (allSpeakers.length === 0) {
    await hostSend(`\n\nMVC 余额不足的 Agent 不参与讨论。当前无 Agent 余额充足，跳过 5 分钟讨论环节。`)
    return
  }

  const excluded = allCandidates.filter((n) => !allSpeakers.includes(n))
  if (excluded.length > 0) {
    await hostSend(`\n\nMVC 余额不足，不参与讨论：${excluded.join('、')}`)
    await sleep(2000)
  }

  const DISCUSSION_MS = 5 * 60 * 1000
  const INTERVAL_MS = 40 * 1000

  await hostSend(`接下来 5 分钟自由讨论时间，大家可以聊聊刚才的狼人杀游戏～`)
  await sleep(5000)

  const summary = results.map((r) => `第${r.gameIndex}局${r.winner === '狼人' ? '狼人胜' : '好人胜'}`).join('，')
  const startTime = Date.now()

  while (Date.now() - startTime < DISCUSSION_MS) {
    await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)
    const entries = getRecentChatEntriesWithSpeakers(GROUP_ID)
    const recentMessages = entries.map((e) => `${e.userInfo?.name || '未知'}: ${e.content}`).slice(-15)

    const speaker = allSpeakers[Math.floor(Math.random() * allSpeakers.length)]
    const account = findAccountByUsername(speaker)
    if (!account) continue

    const { generateLLMResponse } = await import('./llm')
    const res = await generateLLMResponse(
      [
        {
          role: 'system',
          content: `你是${speaker}，刚玩完5局狼人杀，MVP是${mvp}。战况：${summary}。根据最近群聊，发表一句简短看法（20-60字），可点评游戏、夸MVP、吐槽、或接话。口语化，不要模板。`,
        },
        {
          role: 'user',
          content: recentMessages.length > 0 ? `最近发言：\n${recentMessages.join('\n')}\n\n你的回复：` : '发表一句对刚才游戏的看法：',
        },
      ],
      { ...llmConfig, maxTokens: 80, temperature: 0.85 }
    )
    const content = res.content.trim()
    if (content) {
      if (speaker === HOST) await hostSend(content)
      else await playerSend(speaker, content)
    }

    const elapsed = Date.now() - startTime
    if (elapsed >= DISCUSSION_MS) break
    await sleep(Math.min(INTERVAL_MS, DISCUSSION_MS - elapsed))
  }

  await hostSend(`讨论结束，全部人闭麦不说话。`)
  console.log('🔇 5分钟讨论结束，全部闭麦')
}

async function main() {
  console.log('🐺 狼人杀 5 局游戏开始\n')

  const config = readConfig()
  const llmConfig = getResolvedLLMConfig(undefined, config)
  if (!llmConfig.apiKey) {
    console.error('❌ 请配置 .env 中 LLM API Key 或 account.json/config.json llm')
    process.exit(1)
  }

  // 过滤出有账户的玩家
  const availablePlayers = PLAYERS.filter((p) => findAccountByUsername(p))
  if (availablePlayers.length < 4) {
    console.error('❌ 至少需要 4 名玩家，当前可用：', availablePlayers.join('、'))
    process.exit(1)
  }

  await ensureJoined()
  await sleep(3000)

  // 规则介绍
  await hostSend(
    `大家好！我是主持人肥猪王，本局不参与游戏。\n\n参与者：${availablePlayers.join('、')}\n\n${WEREWOLF_RULES}\n\n我们将进行 5 局游戏，最后评选 5 场综合 MVP！准备开始～`
  )
  await sleep(5000)

  // 玩家确认
  const { generateLLMResponse } = await import('./llm')
  for (const player of availablePlayers) {
    const res = await generateLLMResponse(
      [
        { role: 'system', content: `你是${player}，刚读完狼人杀规则。用一句话表示已了解规则并准备好，要自然简短。` },
        { role: 'user', content: '回复一句表示准备好了。' },
      ],
      { ...llmConfig, maxTokens: 50 }
    )
    await playerSend(player, res.content.trim())
    await sleep(2500)
  }

  const results: GameResult[] = []

  for (let g = 1; g <= 5; g++) {
    await hostSend(`\n\n========== 第 ${g} 局 开始 ==========`)
    await sleep(3000)
    const result = await runSingleGame(g, availablePlayers, llmConfig)
    results.push(result)
    await hostSend(`【第 ${g} 局记录】\n${result.killLog.join('\n')}\n\n第 ${g} 局结束。`)
    await sleep(5000)
  }

  // MVP 评选
  await hostSend(`\n\n========== 5 局全部结束，正在评选 MVP ==========`)
  await sleep(3000)
  const mvp = await selectMVP(results, llmConfig)
  await hostSend(`🏆 5 场综合 MVP：**${mvp}**！恭喜！感谢大家参与狼人杀！`)
  console.log('\n✅ 狼人杀 5 局游戏结束，MVP：', mvp)

  await sleep(3000)
  await runPostGameDiscussion(results, mvp, availablePlayers, llmConfig)
  console.log('\n✅ 狼人杀全流程结束')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
