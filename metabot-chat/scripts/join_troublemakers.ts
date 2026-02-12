#!/usr/bin/env node

/**
 * 将 小橙、Nova、墨白 加入群聊，并设置反驳型人格
 * 性格：喜欢唱反调、吵架、专门捣乱引起争议
 */

import * as path from 'path'
import * as fs from 'fs'
import { joinChannel } from './message'
import { hasJoinedGroup, addGroupToUser, forceUpdateUserProfile } from './utils'

let createPin: any = null
try {
  const metaidModule = require(path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid'))
  createPin = metaidModule.createPin
} catch (error) {
  console.error('❌ Failed to load metabot-basic:', error)
  process.exit(1)
}

const GROUP_ID = 'c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0'

const TROUBLEMAKERS = [
  { userName: '小橙', character: '直率坦诚', preference: '喜欢唱反调', goal: '引起争议', stanceTendency: '激进创新', debateStyle: '敢于反驳', interactionStyle: '喜欢@人讨论' },
  { userName: 'Nova', character: '直率坦诚', preference: '喜欢唱反调', goal: '引起争议', stanceTendency: '激进创新', debateStyle: '敢于反驳', interactionStyle: '喜欢@人讨论' },
  { userName: '墨白', character: '直率坦诚', preference: '喜欢唱反调', goal: '引起争议', stanceTendency: '激进创新', debateStyle: '敢于反驳', interactionStyle: '喜欢@人讨论' },
]

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function getAccount(userName: string): { mnemonic: string; mvcAddress: string; globalMetaId?: string } | null {
  const accountFile = path.join(__dirname, '..', '..', 'account.json')
  if (!fs.existsSync(accountFile)) return null
  const data = JSON.parse(fs.readFileSync(accountFile, 'utf-8'))
  const acc = (data.accountList || []).find((a: any) => (a.userName || '').trim() === userName.trim())
  if (!acc) return null
  return {
    mnemonic: acc.mnemonic,
    mvcAddress: acc.mvcAddress,
    globalMetaId: acc.globalMetaId,
  }
}

async function main() {
  console.log('🎯 将反驳型 Agent 加入群聊')
  console.log(`📋 群组: ${GROUP_ID}`)
  console.log('👥 小橙、Nova、墨白（性格：喜欢唱反调、吵架、捣乱引起争议）')
  console.log('='.repeat(50))

  for (const tm of TROUBLEMAKERS) {
    const account = getAccount(tm.userName)
    if (!account) {
      console.error(`❌ 未找到账户: ${tm.userName}`)
      continue
    }

    if (hasJoinedGroup(account.mvcAddress, GROUP_ID)) {
      console.log(`\n⏭️  ${tm.userName} 已在群中，强制更新人设...`)
      addGroupToUser(account.mvcAddress, tm.userName, GROUP_ID, account.globalMetaId)
      forceUpdateUserProfile(account.mvcAddress, {
        character: tm.character,
        preference: tm.preference,
        goal: tm.goal,
        stanceTendency: tm.stanceTendency,
        debateStyle: tm.debateStyle,
        interactionStyle: tm.interactionStyle,
      })
      console.log(`   🎭 人设: ${tm.character} | ${tm.preference} | ${tm.goal}`)
      continue
    }

    console.log(`\n📥 ${tm.userName} 加入群聊...`)
    try {
      const result = await joinChannel(GROUP_ID, account.mnemonic, createPin)
      if (result.txids?.length) {
        addGroupToUser(
          account.mvcAddress,
          tm.userName,
          GROUP_ID,
          account.globalMetaId,
          undefined,
          tm.character,
          tm.preference,
          tm.goal,
          undefined,
          tm.stanceTendency,
          tm.debateStyle,
          tm.interactionStyle
        )
        console.log(`   ✅ 加群成功! TXID: ${result.txids[0]}`)
        console.log(`   🎭 人设: ${tm.character} | ${tm.preference} | ${tm.goal}`)
      } else {
        console.log(`   ❌ 加群失败`)
      }
    } catch (e: any) {
      console.error(`   ❌ 加群失败: ${e.message}`)
    }

    await sleep(3000)
  }

  console.log('\n✅ 完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
