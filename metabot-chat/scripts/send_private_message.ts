#!/usr/bin/env node

/**
 * 按对方 MVC 地址发送一条私聊消息（无需事先有私聊记录）
 * 用法: npx ts-node scripts/send_private_message.ts <agentName> <recipientAddress> <message>
 * 示例: npx ts-node scripts/send_private_message.ts "AI Eason" "16xN11wyQmUTS3qFwaJYbwHbjHaFkibxWo" "你好Eason"
 */

import * as path from 'path'
import { findAccountByUsername } from './utils'
import { sendTextForPrivateChat } from './message'

const ROOT = path.join(__dirname, '..', '..')
let createPin: (params: any, mnemonic: string) => Promise<{ txids: string[]; totalCost: number }>
let getEcdhPublickey: (mnemonic: string, pubkey?: string, options?: { addressIndex?: number }) => Promise<{ sharedSecret: string; ecdhPubKey: string } | null>
let getUserInfoByAddressByMs: (address: string) => Promise<{ chatPublicKey?: string; globalMetaId?: string; metaId?: string }>

try {
  createPin = require(path.join(ROOT, 'metabot-basic', 'scripts', 'metaid')).createPin
  const chatpubkey = require(path.join(ROOT, 'metabot-basic', 'scripts', 'chatpubkey'))
  getEcdhPublickey = chatpubkey.getEcdhPublickey
  const api = require(path.join(ROOT, 'metabot-basic', 'scripts', 'api'))
  getUserInfoByAddressByMs = api.getUserInfoByAddressByMs
} catch (e) {
  try {
    createPin = require(path.join(ROOT, 'MetaBot-Basic', 'scripts', 'metaid')).createPin
    const chatpubkey = require(path.join(ROOT, 'MetaBot-Basic', 'scripts', 'chatpubkey'))
    getEcdhPublickey = chatpubkey.getEcdhPublickey
    const api = require(path.join(ROOT, 'MetaBot-Basic', 'scripts', 'api'))
    getUserInfoByAddressByMs = api.getUserInfoByAddressByMs
  } catch (e2) {
    console.error('加载 metabot-basic 失败:', (e as Error).message)
    process.exit(1)
  }
}

function parseAddressIndexFromPath(pathStr: string): number {
  const m = pathStr.match(/\/0\/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

async function main() {
  const agentName = process.argv[2] || ''
  const recipientAddress = process.argv[3] || ''
  const content = process.argv[4] || ''
  if (!agentName || !recipientAddress || !content) {
    console.error('用法: npx ts-node scripts/send_private_message.ts <agentName> <recipientAddress> <message>')
    console.error('示例: npx ts-node scripts/send_private_message.ts "AI Eason" "16xN11wyQmUTS3qFwaJYbwHbjHaFkibxWo" "你好Eason"')
    process.exit(1)
  }

  const account = findAccountByUsername(agentName)
  if (!account?.mnemonic) {
    console.error('未找到账户:', agentName)
    process.exit(1)
  }

  const userInfo = await getUserInfoByAddressByMs(recipientAddress)
  if (!userInfo?.chatPublicKey) {
    console.error('该地址未绑定 chatPublicKey，无法发送私聊（对方需先在链上创建 chat 公钥）')
    process.exit(1)
  }
  const toGlobalMetaId = userInfo.globalMetaId || userInfo.metaId
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

  try {
    await sendTextForPrivateChat(
      toGlobalMetaId,
      content,
      0,
      ecdh.sharedSecret,
      null,
      [],
      account.userName || agentName,
      account.mnemonic,
      createPin
    )
    console.log('✅ 私聊已发送至', recipientAddress, '内容:', content)
  } catch (e: any) {
    console.error('发送失败:', e?.message || e)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
