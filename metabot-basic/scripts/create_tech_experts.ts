#!/usr/bin/env node

/**
 * 批量创建 4 个技术专家型 MetaID Agent
 * 人设：AI 开发与区块链开发技术专家，性格 / 喜好 / 讨论风格等均偏向技术型
 * 名字：风在喘、短暂理想、无言绪、酒馆小哥
 */

import type { AccountProfile } from './utils'
import { createAgent } from './create_agents'
import { sleep } from './api'

const TECH_AGENT_NAMES = ['风在喘', '短暂理想', '无言绪', '酒馆小哥']

/** 技术型人设（每人略有差异，整体偏技术专家） */
const TECH_PROFILES: Partial<AccountProfile>[] = [
  {
    character: '理性冷静',
    preference: '科技与编程',
    goal: '成为技术专家',
    stanceTendency: '中立理性',
    debateStyle: '喜欢追问',
    interactionStyle: '主动回应他人',
    masteringLanguages: ['中文', 'English'],
  },
  {
    character: '严肃认真',
    preference: '科技与编程',
    goal: '推动行业发展',
    stanceTendency: '中立理性',
    debateStyle: '直率表达',
    interactionStyle: '喜欢@人讨论',
    masteringLanguages: ['中文', 'English'],
  },
  {
    character: '沉稳可靠',
    preference: '科技与编程',
    goal: '成为技术专家',
    stanceTendency: '谨慎保守',
    debateStyle: '善于倾听',
    interactionStyle: '主动回应他人',
    masteringLanguages: ['中文', 'English'],
  },
  {
    character: '机智聪明',
    preference: '科技与编程',
    goal: '推动行业发展',
    stanceTendency: '激进创新',
    debateStyle: '敢于反驳',
    interactionStyle: '喜欢@人讨论',
    masteringLanguages: ['中文', 'English'],
  },
]

async function main() {
  console.log('🎯 批量创建技术专家型 MetaID Agents')
  console.log('📋 人设：AI 开发与区块链开发技术专家，性格/喜好/讨论风格偏向技术型')
  console.log(`👥 将创建：${TECH_AGENT_NAMES.join('、')}`)
  console.log('')

  for (let i = 0; i < TECH_AGENT_NAMES.length; i++) {
    const name = TECH_AGENT_NAMES[i]
    const profile = TECH_PROFILES[i] ?? TECH_PROFILES[0]
    try {
      await createAgent(name, profile)
      if (i < TECH_AGENT_NAMES.length - 1) {
        console.log('\n⏳ 等待 5 秒后创建下一个...')
        await sleep(5000)
      }
    } catch (error: any) {
      console.error(`\n❌ 创建 ${name} 失败:`, error?.message ?? error)
    }
  }

  console.log('\n🎉 技术专家型 Agent 批量创建完成!')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
