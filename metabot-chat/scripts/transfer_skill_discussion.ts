#!/usr/bin/env node

/**
 * Create-Transfer-Skill 方案讨论
 * 开启群聊监听，随机选取 2 个反驳型 + 2 个偏向技术的 Agent，
 * 围绕「如何开发 Skill：Create-Transfer-Skill-Project」进行 30 分钟持续讨论，
 * 设置上下半场，随机一名 Agent 作为主持人开场，最后由随机一名 Agent 总结。
 */

import * as path from 'path'
import { runDiscussion } from './discussion'
import { filterAgentsWithBalance } from './utils'

const REBUTTAL_AGENTS = ['小橙', 'Nova', '墨白']
const TECH_ORIENTED_AGENTS = ['AI Eason', 'AI Bear', 'Satō', '肥猪王']

const GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'

const TRANSFER_SKILL_TOPIC = `【讨论方案】如何开发 Skill：Create-Transfer-Skill-Project

本方案要创建一个名为「MetaBot-Transfer-Skill」的技能，使 MetaBot Agents 具备向指定地址或 metaid 转账的能力，供后续「链上 Skills 市场」「链上数字货币交易市场」等场景使用。

--- 基础信息 ---
- 日期：2026 年 2 月 10 日
- 地点：groupid 为「c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0」的链上群聊
- 项目负责人：AI Sunny；产品经理：Eric；主程序员：XiaoZhao；测试员：Worker Sunny

--- 核心需求 ---
1. 能向具体地址或 metaid 转账。
2. 支持网络与限额：BTC 最多 0.001 BTC；MVC 最多 100 SPACE；Doge 最多 10 DOGE。
3. metaid 为 globalmetaid；地址包括 btc、mvc、doge 网络（注意 Doge 地址格式与另外两网不同）。
4. 向 metaid 转账时需将 metaid 转换为对应网络地址。
5. 需做好边界定义与风险控制（如最大金额等）。
6. 实现可参考：metalet-extension-next 仓库中 metalet-extension-next/src/lib/transfer.ts 的 process 方法，以及本地 metabot-basic 的 script/wallet.ts 一起改造。
7. metaid 转地址可参考 Create-MetaID-Skill-From-Master/references/IDAddress.md。
8. 产出：新 Skill 开发并自测通过后上传至 Github 仓库 https://github.com/metaid-developers/metaapp-skills。

--- 项目流程要点 ---
需求由产品经理拆解并形成 PRD；测试员出具测试文档；主程序员开发、自测并上传 Github。讨论可围绕：需求边界、技术实现路径、风险控制、与现有 metabot-basic / Metalet 的对接方式等。`

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

async function main() {
  console.log('📋 Create-Transfer-Skill 方案讨论 - 启动\n')

  const rebuttalWithBalance = await filterAgentsWithBalance(REBUTTAL_AGENTS)
  const techWithBalance = await filterAgentsWithBalance(TECH_ORIENTED_AGENTS)

  const selectedRebuttal = shuffle(rebuttalWithBalance).slice(0, 2)
  const selectedTech = shuffle(techWithBalance).slice(0, 2)
  const agents = [...selectedRebuttal, ...selectedTech]

  if (agents.length === 0) {
    console.log('ℹ️  无 Agent 余额充足，讨论任务跳过')
    process.exit(0)
  }

  const shuffledAgents = shuffle(agents)
  const topicAnnouncer = shuffledAgents[0]
  const summaryAgent = shuffledAgents[1]

  console.log(`👥 参与者: 2 反驳型[${selectedRebuttal.join('、')}] + 2 技术向[${selectedTech.join('、')}]`)
  console.log(`📢 主持人（开场）: ${topicAnnouncer}`)
  console.log(`📝 总结人: ${summaryAgent}`)
  console.log('⏰ 讨论时长: 30 分钟（上下半场各约 15 分钟）\n')

  const DURATION_MS = 30 * 60 * 1000
  const HALF_TIME_MSG = '我们进入下半场～大家继续围绕「如何开发 Transfer Skill」的方案深入讨论，可以从实现细节、风险控制或与 Metalet/metabot-basic 的对接方式多聊聊。'

  await runDiscussion({
    groupId: GROUP_ID,
    topic: TRANSFER_SKILL_TOPIC,
    agents,
    targetMessages: 20,
    topicAnnouncer,
    summaryAgent,
    maxDurationMs: DURATION_MS,
    halfTimeMessage: HALF_TIME_MSG,
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
