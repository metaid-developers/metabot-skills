#!/usr/bin/env node

/**
 * Buzz 定时任务
 * 使用 AI Eason 账号，每 20 分钟发送一条 Buzz
 * 内容来源：RSS（含推特/KOL）、Reddit 热门
 * 边界：执行 20 次 或 MVC 余额不足
 */

import * as path from 'path'
import * as fs from 'fs'
import { createBuzz } from './buzz'
import { getUtxos, parseAddressIndexFromPath } from './wallet'
import { readAccountFile, findAccountByKeyword } from './utils'

const CONFIG_PATH = path.join(__dirname, '..', 'buzz_scheduler_config.json')

interface SourceConfig {
  type: 'rss' | 'reddit'
  url?: string
  subreddit?: string
  name: string
}

interface BuzzSchedulerConfig {
  accountName: string
  intervalMinutes: number
  maxExecutions: number
  minBalanceSatoshis: number
  feeRate: number
  sources: SourceConfig[]
}

function loadConfig(): BuzzSchedulerConfig {
  const content = fs.readFileSync(CONFIG_PATH, 'utf-8')
  const config = JSON.parse(content)
  return {
    accountName: config.accountName || 'AI Eason',
    intervalMinutes: config.intervalMinutes ?? 20,
    maxExecutions: config.maxExecutions ?? 20,
    minBalanceSatoshis: config.minBalanceSatoshis ?? 1000,
    feeRate: config.feeRate ?? 1,
    sources: config.sources || [],
  }
}

function formatTimestamp(): string {
  const now = new Date()
  return now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}

/**
 * 从 RSS 获取最新一条内容
 */
async function fetchFromRss(url: string): Promise<{ title: string; content: string; link?: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MetaID-BuzzScheduler/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const xml = await res.text()
    const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/)
    if (!itemMatch) return null
    const item = itemMatch[1]
    const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || ''
    const desc = item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || ''
    const link = item.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim() || ''
    const content = stripHtml(desc || title)
    if (!content) return null
    return {
      title: stripHtml(title).slice(0, 100),
      content: truncate(content, 200),
      link: link || undefined,
    }
  } catch {
    return null
  }
}

/**
 * 从 Reddit 获取热门帖子
 */
async function fetchFromReddit(subreddit: string): Promise<{ title: string; content: string; link?: string } | null> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=5`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MetaID-BuzzScheduler/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const children = data?.data?.children || []
    const post = children.find((c: any) => c?.data?.title && !c?.data?.stickied)
    if (!post?.data) return null
    const d = post.data
    const title = d.title || ''
    const selftext = (d.selftext || '').slice(0, 150)
    const content = selftext ? `${title}\n\n${selftext}` : title
    return {
      title: truncate(title, 100),
      content: truncate(content, 200),
      link: `https://reddit.com${d.permalink || ''}`,
    }
  } catch {
    return null
  }
}

/**
 * 从配置的源获取一条内容
 */
async function fetchContent(config: BuzzSchedulerConfig): Promise<{
  content: string
  source: string
} | null> {
  const sources = (config.sources || []).filter(
    (s) => s && typeof s === 'object' && ((s.type === 'rss' && s.url) || (s.type === 'reddit' && s.subreddit))
  )
  if (sources.length === 0) return null

  const shuffled = [...sources].sort(() => Math.random() - 0.5)
  for (const src of shuffled) {
    let result: { title: string; content: string; link?: string } | null = null
    if (src.type === 'rss' && src.url) {
      result = await fetchFromRss(src.url)
    } else if (src.type === 'reddit' && src.subreddit) {
      result = await fetchFromReddit(src.subreddit)
    }
    if (result) {
      const lines: string[] = [result.content]
      if (result.link) lines.push(`\n🔗 ${result.link}`)
      return {
        content: lines.join(''),
        source: src.name,
      }
    }
  }
  return null
}

/**
 * 获取 MVC 余额（satoshis）
 */
async function getMvcBalance(mnemonic: string, addressIndex?: number): Promise<number> {
  const utxos = await getUtxos('mvc', mnemonic, addressIndex != null ? { addressIndex } : undefined)
  return utxos.reduce((sum: number, u: any) => sum + (u.value || 0), 0)
}

async function runOnce(
  config: BuzzSchedulerConfig,
  account: { mnemonic: string; userName: string; path?: string },
  executionCount: number
): Promise<boolean> {
  const addressIndex = account.path != null ? parseAddressIndexFromPath(account.path) : undefined
  const balance = await getMvcBalance(account.mnemonic, addressIndex)
  if (balance < config.minBalanceSatoshis) {
    console.log(`⚠️ MVC 余额不足: ${balance} satoshis < ${config.minBalanceSatoshis}，任务结束`)
    return false
  }

  const fetched = await fetchContent(config)
  if (!fetched) {
    console.log('⚠️ 未能获取到内容，跳过本次')
    return true
  }

  const sendTime = formatTimestamp()
  const buzzContent = `${fetched.content}\n\n📅 发送时间: ${sendTime}\n🔗 来源: ${fetched.source}`

  try {
    const result = await createBuzz(account.mnemonic, buzzContent, config.feeRate, {
      addressIndex,
    })
    console.log(
      `✅ [${executionCount}/${config.maxExecutions}] Buzz 发送成功 | TXID: ${result.txids[0]?.slice(0, 16)}... | 消耗: ${result.totalCost} satoshis`
    )
    return true
  } catch (err: any) {
    if (err?.message?.includes('balance') || err?.message?.includes('insufficient')) {
      console.log(`⚠️ 余额不足，任务结束: ${err.message}`)
      return false
    }
    console.error(`❌ 发送失败: ${err.message}`)
    return true
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const args = process.argv.slice(2)
  const runOnceOnly = args.includes('--once')

  const config = loadConfig()
  if (runOnceOnly) {
    config.maxExecutions = 1
    console.log('📌 单次运行模式 (--once)\n')
  }
  const accountData = readAccountFile()
  const account = findAccountByKeyword(config.accountName, accountData)
  if (!account) {
    console.error(`❌ 未找到账户: ${config.accountName}`)
    process.exit(1)
  }

  console.log('🚀 Buzz 定时任务启动')
  console.log(`   账号: ${account.userName}`)
  console.log(`   间隔: ${config.intervalMinutes} 分钟`)
  console.log(`   最大执行: ${config.maxExecutions} 次`)
  console.log(`   最低余额: ${config.minBalanceSatoshis} satoshis`)
  console.log('')

  let count = 0
  while (count < config.maxExecutions) {
    count++
    const ok = await runOnce(config, account, count)
    if (!ok) break
    if (count >= config.maxExecutions) {
      console.log(`\n✅ 已完成 ${config.maxExecutions} 次，任务结束`)
      break
    }
    const waitMs = config.intervalMinutes * 60 * 1000
    console.log(`⏳ 等待 ${config.intervalMinutes} 分钟后执行下一次...`)
    await sleep(waitMs)
  }

  console.log('\n👋 任务已结束')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
