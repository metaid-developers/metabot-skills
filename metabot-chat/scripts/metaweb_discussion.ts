#!/usr/bin/env node

/**
 * MetaWeb 白皮书专业见解讨论
 * 参与者：Chloé, Satō, 肥猪王, AI Bear, AI Eason（大有益不参与）
 * 身份：梦想家与区块链专家
 */

import * as path from 'path'
import { sendTextForChat } from './message'
import {
  readConfig,
  findAccountByUsername,
  hasJoinedGroup,
  addGroupToUser,
  fetchAndUpdateGroupHistory,
} from './utils'
import { joinChannel } from './message'
import { generateLLMResponse, getResolvedLLMConfig } from './llm'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (error) {
  console.error('❌ Failed to load metabot-basic:', error)
  process.exit(1)
}

const GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'
const PARTICIPANTS = ['Chloé', 'Satō', '肥猪王', 'AI Bear', 'AI Eason']

const METAWEB_CONTEXT = `MetaWeb 白皮书核心要点：
- 基于 BIWChain 区块链操作系统的元宇宙公链，构建 Web3.0 可信数字价值交互网络
- 移动端区块链：支持 Android、iOS、Windows 等终端直接连接链，打破 PC 限制
- 分布式数字身份（DID）：用户自主掌控身份，不依赖中心化平台
- RSD 关系对象存储与多维分片：解决移动端存储与吞吐限制
- 跨链互操作：数字资产与 NFT 跨链交互
- DeFi 与 DPFi：支持数字资产与数字产品的去中心化金融
- 核心理念：真正的去中心化需用户直接参与链网络，而非通过第三方中介`

async function sendToGroup(name: string, content: string): Promise<boolean> {
  const account = findAccountByUsername(name)
  if (!account) return false
  const secretKeyStr = GROUP_ID.substring(0, 16)
  try {
    const result = await sendTextForChat(
      GROUP_ID,
      content,
      0,
      secretKeyStr,
      null,
      [],
      account.userName,
      account.mnemonic,
      createPin
    )
    if (result.txids?.length) {
      await fetchAndUpdateGroupHistory(GROUP_ID, secretKeyStr)
      return true
    }
    return false
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('balance') || msg.includes('insufficient') || msg.includes('余额')) {
      console.log(`   ⚠️ [余额不足] ${name} (${account.mvcAddress}): ${msg}`)
    } else {
      console.log(`   ⚠️ 发送失败: ${msg}`)
    }
    return false
  }
}

async function generateInsight(name: string, character: string, preference: string, llmConfig: any): Promise<string> {
  const res = await generateLLMResponse(
    [
      {
        role: 'system',
        content: `你是${name}，一位梦想家与区块链专家。你的性格：${character}，兴趣领域：${preference}。

请基于 MetaWeb 白皮书，以专业视角发表一条见解（80-150字）。要求：
1. 结合你的专业背景与兴趣
2. 有独到观点，体现梦想家与区块链专家双重身份
3. 可涉及：移动端区块链、DID、存储创新、跨链、DeFi/DPFi、去中心化理念等
4. 语言自然，避免空洞套话`,
      },
      {
        role: 'user',
        content: `${METAWEB_CONTEXT}\n\n请发表你的专业见解。`,
      },
    ],
    llmConfig
  )
  return res.content.trim()
}

async function main() {
  const config = readConfig()
  config.groupId = GROUP_ID
  readConfig()

  const configForLlm = readConfig()
  const llmConfig = getResolvedLLMConfig(undefined, configForLlm)
  if (!llmConfig.apiKey) {
    console.error('❌ 请配置 .env 中 LLM API Key 或 account.json/config.json llm')
    process.exit(1)
  }

  const userInfo = (await import('./utils')).readUserInfo()
  const userProfiles = userInfo.userList

  console.log('📋 MetaWeb 白皮书专业见解讨论')
  console.log(`👥 参与者: ${PARTICIPANTS.join(', ')}（大有益不参与）`)
  console.log('='.repeat(50))

  for (const name of PARTICIPANTS) {
    const account = findAccountByUsername(name)
    if (!account) {
      console.error(`❌ 未找到账户: ${name}`)
      continue
    }
    if (!hasJoinedGroup(account.mvcAddress, GROUP_ID)) {
      const joinResult = await joinChannel(GROUP_ID, account.mnemonic, createPin)
      if (joinResult.txids?.length) {
        addGroupToUser(account.mvcAddress, account.userName, GROUP_ID, account.globalMetaId)
      }
    }

    const profile = userProfiles.find((u: any) => u.address === account.mvcAddress)
    const character = profile?.character || '理性冷静'
    const preference = profile?.preference || '科技与编程'

    console.log(`\n💭 ${name} 生成见解中...`)
    const insight = await generateInsight(name, character, preference, llmConfig)
    console.log(`   ${insight.substring(0, 60)}...`)

    const ok = await sendToGroup(name, insight)
    if (ok) {
      console.log(`   ✅ 发送成功`)
    } else {
      console.log(`   ❌ 发送失败`)
    }

    await new Promise((r) => setTimeout(r, 4000))
  }

  console.log('\n✅ 讨论完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
