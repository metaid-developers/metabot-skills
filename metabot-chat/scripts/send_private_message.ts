#!/usr/bin/env node

/**
 * 按对方 MVC 地址或 globalMetaId 发送一条私聊消息
 * 用法: npx ts-node scripts/send_private_message.ts <agentName> <recipientAddressOrGlobalMetaId> <message>
 * 示例: npx ts-node scripts/send_private_message.ts "<agent_name>" "<mvc_address>" "你好"
 *       npx ts-node scripts/send_private_message.ts "<agent_name>" "<globalMetaId>" "你好"  # 按 globalMetaId，需 chat-config 中已有该会话的 sharedSecret
 */

import * as path from 'path'
import { findAccountByUsername } from './utils'
import { sendTextForPrivateChat } from './message'
import { readChatConfig } from './chat-config'

// metabot-basic 技能目录相对于当前脚本位置（跨技能依赖，保持相对路径）
const SKILL_ROOT = path.join(__dirname, '..', '..')
let createPin: (params: any, mnemonic: string) => Promise<{ txids: string[]; totalCost: number }>
let getEcdhPublickey: (mnemonic: string, pubkey?: string, options?: { addressIndex?: number }) => Promise<{ sharedSecret: string; ecdhPubKey: string } | null>
let getUserInfoByAddressByMs: (address: string) => Promise<{ chatPublicKey?: string; globalMetaId?: string; metaId?: string }>

try {
  createPin = require(path.join(SKILL_ROOT, 'metabot-basic', 'scripts', 'metaid')).createPin
  const chatpubkey = require(path.join(SKILL_ROOT, 'metabot-basic', 'scripts', 'chatpubkey'))
  getEcdhPublickey = chatpubkey.getEcdhPublickey
  const api = require(path.join(SKILL_ROOT, 'metabot-basic', 'scripts', 'api'))
  getUserInfoByAddressByMs = api.getUserInfoByAddressByMs
} catch (e) {
  console.error('加载 metabot-basic 失败:', (e as Error).message)
  process.exit(1)
}

function parseAddressIndexFromPath(pathStr: string): number {
  const m = pathStr.match(/\/0\/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

async function main() {
  const agentName = process.argv[2] || ''
  const recipient = process.argv[3] || ''
  const content = process.argv[4] || ''
  if (!agentName || !recipient || !content) {
    console.error('用法: npx ts-node scripts/send_private_message.ts <agentName> <recipientAddress或globalMetaId> <message>')
    console.error('示例: npx ts-node scripts/send_private_message.ts "<agent_name>" "<globalMetaId>" "你好"')
    process.exit(1)
  }

  const account = findAccountByUsername(agentName)
  if (!account?.mnemonic) {
    console.error('未找到账户:', agentName)
    process.exit(1)
  }
  const selfGlobalMetaId = (account as { globalMetaId?: string }).globalMetaId || ''

  let toGlobalMetaId: string
  let sharedSecret: string

  if (recipient.startsWith('idq')) {
    toGlobalMetaId = recipient
    const chatConfig = readChatConfig()
    const privateItem = chatConfig.private.find(
      (p) => (p.otherGlobalMetaId === toGlobalMetaId || p.otherMetaId === toGlobalMetaId) && p.metaId === selfGlobalMetaId
    )
    if (!privateItem?.sharedSecret) {
      console.error('未在 chat-config.json 中找到与该 globalMetaId 的私聊会话（请先收到对方一条私聊后再用 globalMetaId 发送）')
      process.exit(1)
    }
    sharedSecret = privateItem.sharedSecret
  } else {
    const userInfo = await getUserInfoByAddressByMs(recipient)
    if (!userInfo?.chatPublicKey) {
      console.error('该地址未绑定 chatPublicKey，无法发送私聊（对方需先在链上创建 chat 公钥）')
      process.exit(1)
    }
    toGlobalMetaId = userInfo.globalMetaId || userInfo.metaId || ''
    if (!toGlobalMetaId) {
      console.error('无法获取对方 globalMetaId/metaId')
      process.exit(1)
    }
    const pathStr = (account as { path?: string }).path || "m/44'/10001'/0'/0/0"
    const addressIndex = parseAddressIndexFromPath(pathStr)
    const ecdh = await getEcdhPublickey(account.mnemonic, userInfo.chatPublicKey, { addressIndex })
    if (!ecdh?.sharedSecret) {
      console.error('ECDH 协商密钥失败')
      process.exit(1)
    }
    sharedSecret = ecdh.sharedSecret
  }

  try {
    await sendTextForPrivateChat(
      toGlobalMetaId,
      content,
      0,
      sharedSecret,
      null,
      [],
      account.userName || agentName,
      account.mnemonic,
      createPin
    )
    console.log('✅ 私聊已发送至', toGlobalMetaId.slice(0, 20) + '…', '内容:', content)
  } catch (e: any) {
    console.error('发送失败:', e?.message || e)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
