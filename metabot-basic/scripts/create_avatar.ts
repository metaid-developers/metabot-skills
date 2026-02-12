#!/usr/bin/env node

/**
 * 为指定 Agent 创建头像节点（从 static/avatar 读取图片）
 * Usage: npx ts-node scripts/create_avatar.ts <userName|mvcAddress|metaid> [图片文件名] [--force]
 * 示例: npx ts-node scripts/create_avatar.ts "肥猪王" "images (2).jpeg"
 */

import {
  readAccountFile,
  writeAccountFile,
  findAccountByKeyword,
  getAvatarUrl,
} from './utils'
import { createPin, CreatePinParams } from './metaid'
import { parseAddressIndexFromPath } from './wallet'
import {
  hasAvatarFile,
  loadAvatarAsBase64,
  AVATAR_SIZE_EXCEEDED_MSG,
} from './avatar'

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force') || args.includes('-f')
  const filtered = args.filter((a) => a !== '--force' && a !== '-f')
  const keyword = filtered[0]?.trim()
  const avatarFilename = filtered[1]?.trim() // 可选：如 "images (2).jpeg"
  if (!keyword) {
    console.error(
      'Usage: npx ts-node scripts/create_avatar.ts <userName|mvcAddress|metaid> [图片文件名] [--force]'
    )
    process.exit(1)
  }

  if (!hasAvatarFile(avatarFilename)) {
    console.error(
      avatarFilename
        ? `❌ static/avatar 下未找到文件: ${avatarFilename}（支持 jpg/png/gif/webp/avif）`
        : '❌ static/avatar 目录下无图片文件（支持 jpg/png/gif/webp/avif）'
    )
    process.exit(1)
  }

  const accountData = readAccountFile()
  const account = findAccountByKeyword(keyword, accountData)
  if (!account) {
    console.error(`❌ 未找到账户: ${keyword}`)
    process.exit(1)
  }

  if (account.avatarPinId && !force) {
    console.log(`ℹ️  ${account.userName || account.mvcAddress} 已有头像，avatarPinId: ${account.avatarPinId}`)
    console.log('   使用 --force 可覆盖更新')
    process.exit(0)
  }

  let avatarData: { avatar: string; contentType: string } | null = null
  try {
    avatarData = await loadAvatarAsBase64(avatarFilename)
  } catch (e: any) {
    if (e?.message === AVATAR_SIZE_EXCEEDED_MSG) {
      console.error(`❌ ${AVATAR_SIZE_EXCEEDED_MSG}`)
    } else {
      throw e
    }
    process.exit(1)
  }

  if (!avatarData) {
    console.error('❌ 无法加载头像数据')
    process.exit(1)
  }

  console.log('🖼️  创建头像节点...')
  const avatarPinParams: CreatePinParams = {
    chain: 'mvc',
    dataList: [
      {
        metaidData: {
          operation: 'create',
          path: '/info/avatar',
          body: avatarData.avatar,
          encoding: 'base64',
          contentType: avatarData.contentType,
        },
      },
    ],
    feeRate: 1,
  }

  const avatarPinRes = await createPin(avatarPinParams, account.mnemonic, {
    addressIndex: parseAddressIndexFromPath(account.path),
  })
  if (avatarPinRes.txids && avatarPinRes.txids.length > 0) {
    const avatarPinId = avatarPinRes.txids[0] + 'i0'
    const accData = readAccountFile()
    const accIdx = accData.accountList.findIndex(
      (a) => a.mvcAddress === account.mvcAddress
    )
    if (accIdx !== -1) {
      accData.accountList[accIdx].avatarPinId = avatarPinId
      accData.accountList[accIdx].avatar = getAvatarUrl(avatarPinId)
      writeAccountFile(accData)
      console.log(`✅ 头像创建成功!`)
      console.log(`   avatarPinId: ${avatarPinId}`)
    }
  } else {
    console.error('❌ 创建头像交易失败')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
