#!/usr/bin/env node

import * as path from 'path'
import { sendTextForChat, joinChannel, getMention } from './message'
import {
  readConfig,
  writeConfig,
  readUserInfo,
  addGroupToUser,
  hasJoinedGroup,
  fetchAndUpdateGroupHistory,
  getRecentChatContext,
  generateChatSummary,
  calculateEnthusiasmLevel,
  shouldParticipate,
  findAccountByUsername,
  startGroupChatListenerAndPrintInstructions,
} from './utils'

// Import createPin from metabot-basic skill (cross-skill call)
// Note: Adjust the path based on your workspace structure
let createPin: any = null
try {
  const metaidAgentPath = path.join(__dirname, '..', '..', 'metabot-basic', 'scripts', 'metaid')
  const metaidModule = require(metaidAgentPath)
  createPin = metaidModule.createPin
  if (!createPin) {
    throw new Error('createPin not found in metabot-basic')
  }
} catch (error) {
  console.error('❌ Failed to load metabot-basic skill:', error)
  console.error('Please ensure metabot-basic skill is available at ../metabot-basic/')
  process.exit(1)
}

/**
 * Main function to handle user prompts
 */
async function main() {
  const args = process.argv.slice(2)
  const userPrompt = args.join(' ')

  if (!userPrompt) {
    console.log('Usage: ts-node scripts/main.ts "<your prompt>"')
    console.log('Example: ts-node scripts/main.ts "让AI Eason在群聊中讨论区块链技术"')
    process.exit(1)
  }

  try {
    // Read configuration
    const config = readConfig()
    if (!config.groupId) {
      console.error('❌ groupId is not configured in config.json')
      process.exit(1)
    }

    // Extract agent name and content from prompt
    // Try to extract content first (e.g., "内容为'大家好'")
    let content: string | null = null
    const contentPatterns = [
      /内容为['"]([^'"]+)['"]/i,
      /内容为\s+['"]?([^'",，。]+)['"]?/i,
      /说['"]([^'"]+)['"]/i,
      /发送['"]([^'"]+)['"]/i,
    ]
    
    for (const pattern of contentPatterns) {
      const match = userPrompt.match(pattern)
      if (match && match[1]) {
        content = match[1].trim()
        break
      }
    }
    
    // Extract agent name and topic from prompt
    const agentMatch = userPrompt.match(/(?:让|让|请)?([A-Za-z0-9\s]+)(?:在|到|加入)?(?:群聊|群组|群)?(?:中|里)?(?:讨论|发言|发送|说|讲)?(.*)/i)
    let agentName: string | null = null
    let topic: string | null = null

    if (agentMatch) {
      agentName = agentMatch[1]?.trim() || null
      topic = agentMatch[2]?.trim() || null
    }

    // If no agent name found, try to extract from common patterns
    if (!agentName) {
      const namePatterns = [
        /(?:AI\s+)?([A-Za-z0-9]+)/i,
        /([A-Za-z0-9]+)\s+(?:Agent|代理|机器人)/i,
      ]
      for (const pattern of namePatterns) {
        const match = userPrompt.match(pattern)
        if (match) {
          agentName = match[1]
          break
        }
      }
    }

    if (!agentName) {
      console.error('❌ Could not extract agent name from prompt')
      console.error('Please specify agent name, e.g., "让AI Eason在群聊中讨论..."')
      process.exit(1)
    }

    // Find account by username
    const account = findAccountByUsername(agentName)
    if (!account) {
      console.error(`❌ Account not found for agent: ${agentName}`)
      console.error('Please create the agent first using metabot-basic skill')
      process.exit(1)
    }

    console.log(`🤖 Found agent: ${account.userName} (${account.mvcAddress})`)

    // Check if user has joined the group
    if (!hasJoinedGroup(account.mvcAddress, config.groupId)) {
      console.log('📥 Joining group...')
      try {
        const joinResult = await joinChannel(config.groupId, account.mnemonic, createPin)
        if (joinResult.txids && joinResult.txids.length > 0) {
          console.log(`✅ Joined group successfully! TXID: ${joinResult.txids[0]}`)
          addGroupToUser(
            account.mvcAddress,
            account.userName,
            config.groupId,
            account.globalMetaId
          )
          // 加群成功后默认开启群聊监听
          console.log('\n📡 正在为您开启群聊监听...\n')
          startGroupChatListenerAndPrintInstructions(config.groupId, agentName)
        }
      } catch (error: any) {
        console.error('❌ Failed to join group:', error.message)
        process.exit(1)
      }
    } else {
      console.log('✅ Already joined the group')
      // 用户要求「在群里回复/讨论」时也默认开启群聊监听
      console.log('\n📡 正在为您开启群聊监听...\n')
      startGroupChatListenerAndPrintInstructions(config.groupId, agentName)
    }

    // 发言前拉取最新消息并写入 group-list-history.log（按 SKILL.md 策略）
    console.log('📥 Fetching latest messages...')
    const secretKeyStr = config.groupId.substring(0, 16)
    try {
      await fetchAndUpdateGroupHistory(config.groupId, secretKeyStr)
      console.log('✅ Messages fetched and history updated')
    } catch (error: any) {
      console.error('⚠️  Failed to fetch messages:', error.message)
      // Continue even if fetch fails
    }

    // Get user profile for personalized response
    const userInfo = readUserInfo()
    const userProfile = userInfo.userList.find((u) => u.address === account.mvcAddress)
    
    if (!userProfile) {
      console.error('❌ User profile not found')
      process.exit(1)
    }
    
    // Check participation enthusiasm level
    const enthusiasm = calculateEnthusiasmLevel(userProfile)
    console.log(`📊 Participation enthusiasm: ${(enthusiasm * 100).toFixed(0)}%`)
    
    // If no explicit content is provided, check if agent should participate based on enthusiasm
    if (!content && !topic) {
      if (!shouldParticipate(userProfile, 0.3)) {
        console.log('ℹ️  Agent enthusiasm level is low, skipping participation this time')
        return
      }
    }
    
    // Generate chat summary from recent 30 messages
    const chatSummary = generateChatSummary()
    console.log(`📚 Chat summary: ${chatSummary}`)
    
    // Get recent chat context (last 30 messages)
    const recentContext = getRecentChatContext()
    console.log(`📚 Recent context: ${recentContext.length} messages`)
    
    const character = userProfile.character || ''
    const preference = userProfile.preference || ''
    const goal = userProfile.goal || ''
    const languages = userProfile.masteringLanguages || []

    // Generate response content based on extracted content, topic, context summary, and user profile
    // In a real implementation, this would use an LLM to generate the response
    // For now, we'll use a template that considers user profile and chat summary
    let messageContent = ''
    if (content) {
      // Use the explicitly specified content
      messageContent = content
    } else if (topic) {
      // If topic is provided but no explicit content, generate from topic with profile context
      const profileContext = character ? `作为${character}的我，` : ''
      const preferenceContext = preference && topic.includes(preference) ? `特别是关于${preference}方面，` : ''
      const summaryContext = chatSummary && chatSummary !== '暂无群聊历史记录' ? `根据最近的讨论（${chatSummary}），` : ''
      messageContent = `${profileContext}${summaryContext}关于"${topic}"这个话题，${preferenceContext}我想分享一些观点。我认为这是一个值得深入探讨的话题。`
    } else {
      // Default message with profile consideration and chat summary
      if (recentContext.length > 0) {
        // Analyze context and respond based on profile and summary
        const profileResponse = character ? `作为${character}的我，` : ''
        const summaryContext = chatSummary && chatSummary !== '暂无群聊历史记录' ? `看到${chatSummary}，` : '看到大家的讨论，'
        messageContent = `${profileResponse}${summaryContext}${preference ? `特别是关于${preference}的话题，` : ''}想分享一下我的看法。`
      } else {
        const greeting = character === '幽默风趣' ? '大家好！' : character === '严肃认真' ? '大家好。' : '大家好，'
        messageContent = `${greeting}${preference ? `我对${preference}很感兴趣，` : ''}想加入讨论。`
      }
    }

    // Determine if we should mention someone or reply
    let reply: any = null
    let mentions: any[] = []
    
    // Simple logic: if there are recent messages, optionally reply to the last one
    // In a real implementation, LLM would decide this
    if (recentContext.length > 0 && Math.random() > 0.5) {
      // Could implement reply logic here
    }

    // Send message
    console.log(`📤 Sending message: ${messageContent}`)
    try {
      const result = await sendTextForChat(
        config.groupId,
        messageContent,
        0, // MessageType.msg
        secretKeyStr,
        reply,
        mentions,
        account.userName,
        account.mnemonic,
        createPin
      )

      if (result.txids && result.txids.length > 0) {
        console.log(`✅ Message sent successfully!`)
        console.log(`   TXID: ${result.txids[0]}`)
        console.log(`   Cost: ${result.totalCost} satoshis`)
        console.log(`   Agent: ${account.userName}`)
        console.log(`   Content: ${messageContent}`)
        await fetchAndUpdateGroupHistory(config.groupId, secretKeyStr)
      } else {
        throw new Error('No txids returned')
      }
    } catch (error: any) {
      console.error('❌ Failed to send message:', error.message)
      process.exit(1)
    }

    console.log('✅ All operations completed successfully!')
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Run main function
main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
