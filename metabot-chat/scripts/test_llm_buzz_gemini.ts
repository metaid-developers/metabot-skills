#!/usr/bin/env node

/**
 * 测试指定 Agent 的 LLM 配置并发送 Buzz（内容由 LLM 总结生成）
 * 用于验证该 Agent 是否使用了预期模型（如 gemini-2.0-flash）
 * Usage: npx ts-node scripts/test_llm_buzz_gemini.ts [agentName]
 */

import * as path from 'path'
import * as fs from 'fs'
import { readConfig, findAccountByUsername } from './utils'
import { getResolvedLLMConfig, generateLLMResponse } from './llm'

const ROOT_DIR = path.join(__dirname, '..', '..')
const ACCOUNT_FILE = path.join(ROOT_DIR, 'account.json')

function getAccountWithPath(userName: string): { mnemonic: string; path: string; userName: string; llm?: any } | null {
  if (!fs.existsSync(ACCOUNT_FILE)) return null
  const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf-8'))
  const acc = data.accountList?.find(
    (a: any) => a.userName && a.userName.trim().toLowerCase() === userName.trim().toLowerCase()
  )
  if (!acc) return null
  return {
    mnemonic: acc.mnemonic,
    path: acc.path || "m/44'/10001'/0'/0/0",
    userName: acc.userName,
    llm: acc.llm,
  }
}

async function main() {
  const agentName = (process.argv[2] || process.env.AGENT_NAME || '酒馆小哥').trim()

  console.log('='.repeat(60))
  console.log(`🧪 测试 Agent「${agentName}」的 LLM 配置并发送 LLM 总结内容作为 Buzz`)
  console.log('='.repeat(60))

  const account = findAccountByUsername(agentName)
  const accountFull = getAccountWithPath(agentName)
  if (!account || !accountFull) {
    console.error(`❌ 未找到账户: ${agentName}`)
    process.exit(1)
  }

  const config = readConfig()
  const llmConfig = getResolvedLLMConfig(account, config)

  console.log('\n📋 【1】解析到的 LLM 配置（用于本次调用）')
  console.log('   provider:', llmConfig.provider)
  console.log('   model:   ', llmConfig.model || '(默认)')
  console.log('   baseUrl: ', llmConfig.baseUrl || '(默认)')
  if (!llmConfig.apiKey) {
    console.error('❌ 无 API Key，请在该 Agent 的 account.json llm 或 .env 中配置')
    process.exit(1)
  }
  console.log('   apiKey:  ', llmConfig.apiKey ? `${llmConfig.apiKey.slice(0, 8)}...` : '(未设置)')

  const promptForSummary = '请用一句话总结：今天天气不错，适合出门。只输出这一句话，不要引号、不要其他内容。'
  console.log('\n📋 【2】调用 LLM 生成 Buzz 内容')
  console.log('   输入:', promptForSummary)

  let summaryContent: string
  try {
    const response = await generateLLMResponse(
      [
        { role: 'system', content: '你是一个简洁总结助手。只输出用户要求的那一句话，不要任何多余内容。' },
        { role: 'user', content: promptForSummary },
      ],
      { ...llmConfig, maxTokens: 100, temperature: 0.3 }
    )
    summaryContent = (response.content || '').trim()
    if (!summaryContent) {
      console.error('❌ LLM 返回内容为空')
      process.exit(1)
    }
    console.log('   输出:', summaryContent)
    if (response.usage) {
      console.log('   usage:', response.usage)
    }
  } catch (e: any) {
    console.error('❌ LLM 调用失败:', e?.message || e)
    process.exit(1)
  }

  console.log('\n📋 【3】使用 metabot-basic 发送 Buzz（内容为上一步 LLM 输出）')
  let createBuzz: (mnemonic: string, content: string, feeRate: number, opts?: { addressIndex?: number }) => Promise<{ txids: string[]; totalCost: number }>
  let parseAddressIndexFromPath: (path: string) => number
  try {
    const metaidPath = path.join(__dirname, '..', '..', 'metabot-basic', 'scripts')
    createBuzz = (await import(path.join(metaidPath, 'buzz'))).createBuzz
    parseAddressIndexFromPath = (await import(path.join(metaidPath, 'wallet'))).parseAddressIndexFromPath
  } catch (e) {
    console.error('❌ 无法加载 metabot-basic (buzz/wallet)，请确保 metabot-basic 在 ../metabot-basic')
    process.exit(1)
  }

  const addressIndex = parseAddressIndexFromPath(accountFull.path)
  try {
    const result = await createBuzz(accountFull.mnemonic, summaryContent, 1, { addressIndex })
    if (result.txids?.length) {
      console.log('   ✅ Buzz 发送成功')
      console.log('   TXID:', result.txids[0])
      console.log('   消耗:', result.totalCost, 'satoshis')
    } else {
      console.error('❌ Buzz 未返回 txid')
      process.exit(1)
    }
  } catch (e: any) {
    console.error('❌ Buzz 发送失败:', e?.message || e)
    process.exit(1)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ 测试完成。本次 LLM 调用使用的模型:', llmConfig.provider, '/', llmConfig.model)
  console.log('='.repeat(60))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
