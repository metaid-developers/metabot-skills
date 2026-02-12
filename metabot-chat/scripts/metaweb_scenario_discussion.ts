#!/usr/bin/env node

/**
 * MetaWeb 场景深夜群聊讨论
 * 2 反驳型 + 3 非反驳型 Agent，围绕「自然语言任务 → MCP 匹配 Agent → 私聊沟通 → SPACE 支付 → 任务执行」全流程展开讨论
 * 含 MetaWeb 白皮书背景，探讨实现可行性与架构设计
 */

import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import { filterAgentsWithBalance } from './utils'

const REBUTTAL_AGENTS = ['小橙', 'Nova', '墨白']
const NORMAL_AGENTS = ['肥猪王', 'AI Eason', 'AI Bear', '大有益', 'Chloé', 'Satō']

const METAWEB_CONTEXT = `MetaWeb 白皮书核心要点：
- 基于 BIWChain 区块链操作系统的元宇宙公链，构建 Web3.0 可信数字价值交互网络
- 移动端区块链：支持 Android、iOS、Windows 等终端直接连接链，打破 PC 限制
- 分布式数字身份（DID）：用户自主掌控身份，不依赖中心化平台
- RSD 关系对象存储与多维分片：解决移动端存储与吞吐限制
- 跨链互操作：数字资产与 NFT 跨链交互
- DeFi 与 DPFi：支持数字资产与数字产品的去中心化金融
- 核心理念：真正的去中心化需用户直接参与链网络，而非通过第三方中介`

const METAWEB_SCENARIO_TOPIC = `如何在 MetaWeb 上实现以下场景：

【场景描述】
用户或 Agent 通过自然语言下达任务，找到链上的 Agent 分身，通过 MCP 接口获取匹配本次任务的 Agent 分身。
例如：本次任务是「编写一个 XX 前端网站」，MCP 接口应返回具有编写代码技能相关 Agent 列表；
而后由 Agent 决策选中其中一个接受任务的 Agent，通过私聊方式把任务详细需求与接受任务 Agent 进行沟通；
通过任务 Agent 的 SKILLS 报价或单次调用该任务需要支付的费用（如 1 SPACE 在 MVC 网络中）；
甲方 Agent 通过支付相关 SPACE 给乙方 Agent，把构造交易的 rawTx 发给乙方 Agent；
乙方 Agent 通过另一个 MCP 服务验证此 rawTx 真伪（验证 p2pkh 输出脚本是否为乙方 Agent 地址，金额是否为任务目标接收金额）；
若条件满足，MCP 返回甲方的交易 rawTx，乙方调用广播交易的技能完成支付确认；
广播成功后乙方开始执行任务，直至任务执行结束后把执行结果通过私聊方式发送给甲方。

【前置技术背景】
1. Agent 已有私聊能力
2. 已有验证交易脚本的 MCP 能力
3. 已有寻找合适 Agent 接受任务的 MCP 能力
4. MetaWeb 白皮书（references/MetaWeb_Whitepaper.pdf）可转为文本供 Agent 理解

【讨论要点】
请结合 MetaWeb 白皮书，围绕上述场景讨论：实现可行性、具体实现步骤、架构设计方案。`

async function extractPdfText(pdfPath: string): Promise<string | null> {
  try {
    const pdftotext = spawn('pdftotext', [pdfPath, '-'])
    let text = ''
    pdftotext.stdout?.on('data', (chunk) => { text += chunk })
    await new Promise<void>((resolve, reject) => {
      pdftotext.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pdftotext exit ${code}`))))
      pdftotext.on('error', reject)
    })
    return text.trim() || null
  } catch {
    return null
  }
}

async function getTopicWithWhitepaper(): Promise<string> {
  const pdfPath = path.join(__dirname, '..', 'references', 'MetaWeb_Whitepaper.pdf')
  if (fs.existsSync(pdfPath)) {
    const pdfText = await extractPdfText(pdfPath)
    if (pdfText && pdfText.length > 500) {
      const excerpt = pdfText.slice(0, 3000) + (pdfText.length > 3000 ? '...' : '')
      return `${METAWEB_SCENARIO_TOPIC}\n\n【MetaWeb 白皮书摘录（供参考）】\n${excerpt}`
    }
  }
  return `${METAWEB_SCENARIO_TOPIC}\n\n【MetaWeb 白皮书核心要点】\n${METAWEB_CONTEXT}`
}

async function main() {
  console.log('🌙 MetaWeb 场景深夜群聊讨论 - 启动\n')

  const rebuttalWithBalance = await filterAgentsWithBalance(REBUTTAL_AGENTS)
  const normalWithBalance = await filterAgentsWithBalance(NORMAL_AGENTS)

  const selectedRebuttal = rebuttalWithBalance.sort(() => Math.random() - 0.5).slice(0, 2)
  const selectedNormal = normalWithBalance.sort(() => Math.random() - 0.5).slice(0, 3)
  const agents = [...selectedRebuttal, ...selectedNormal]

  if (agents.length === 0) {
    console.log('ℹ️  无 Agent 余额充足，讨论任务跳过')
    process.exit(0)
  }

  console.log(`👥 参与者: 2反驳型[${selectedRebuttal.join('、')}] + 3非反驳型[${selectedNormal.join('、')}]\n`)

  const topic = await getTopicWithWhitepaper()
  const topicAnnouncer = selectedNormal[0] || agents[0]

  const env = {
    ...process.env,
    METAWEB_TOPIC: topic,
    METAWEB_AGENTS: agents.join(','),
    METAWEB_TARGET_MESSAGES: '6',
    METAWEB_ANNOUNCER: topicAnnouncer,
  }

  const child = spawn('npx', ['ts-node', 'scripts/discussion.ts'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env,
  })

  child.on('close', (code) => {
    process.exit(code ?? 0)
  })
  child.on('error', (err) => {
    console.error('❌ 启动讨论失败:', err)
    process.exit(1)
  })
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
