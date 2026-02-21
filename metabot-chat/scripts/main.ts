#!/usr/bin/env node

import * as path from 'path'
import { spawn } from 'child_process'
import { sendTextForChat, joinChannel } from './message'
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
import { getResolvedLLMConfig, generateLLMResponse } from './llm'

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
    console.log('Usage: npx ts-node scripts/main.ts "<your prompt>"')
    console.log('Example: npx ts-node scripts/main.ts "让 <metabot-name> 加入群聊 <groupid> 并打个招呼"')
    console.log('Example: npx ts-node scripts/main.ts "让 <metabot-name> 监听群聊 <groupid>，并按以下策略回复：1. 回复所有消息 2. 当有人点名时必须回复"')
    process.exit(1)
  }

  try {
    const config = readConfig()
    // 从 prompt 解析 groupid（64位 hex + i + 数字）
    const groupIdMatch = userPrompt.match(/群聊\s*([a-f0-9]{64}i\d+)/i) || userPrompt.match(/群\s*([a-f0-9]{64}i\d+)/i)
    const parsedGroupId = groupIdMatch ? groupIdMatch[1].trim() : null
    const groupId = (parsedGroupId || process.env.GROUP_ID || config.groupId || '').trim()
    if (groupId && groupId !== config.groupId) {
      config.groupId = groupId
      writeConfig(config)
    }

    // 意图：加入群聊并打招呼 / 监听群聊
    const intentJoinAndGreet = /加入群聊|进群/.test(userPrompt) && /打招呼|打个招呼|问好/.test(userPrompt)
    const intentListen = /监听群聊|开启群聊|监听(?:群聊)?/.test(userPrompt)
    const strategyMentionOnly = /点名时(?:必须)?回复|仅回复\s*@|@\s*提及.*回复/.test(userPrompt)

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
      console.error('Please specify agent name, e.g., "让<agent_name>在群聊中讨论..."')
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

    // 仅监听群聊：启动 Socket 监听后返回
    if (intentListen && !intentJoinAndGreet) {
      if (!groupId) {
        console.error('❌ 请提供要监听的群聊 GROUP_ID（在指令中写出 groupid，或设置 config.json / 环境变量 GROUP_ID）')
        process.exit(1)
      }
      const scriptDir = path.join(__dirname, '..')
      const listenerScript = path.join(scriptDir, 'scripts', 'run_unified_chat_listener.sh')
      const listenerArgs = [agentName, '--auto-reply']
      if (strategyMentionOnly) listenerArgs.push('--mention-only')
      const child = spawn('bash', [listenerScript, ...listenerArgs], {
        cwd: path.join(scriptDir, '..'),
        stdio: 'inherit',
        env: { ...process.env, GROUP_ID: groupId },
      })
      child.on('error', (err) => {
        console.error('❌ 启动监听失败:', err.message)
        console.log('   兜底：可改用 HTTP 轮询: scripts/run_group_chat_listener.sh "' + groupId + '" "' + agentName + '"')
      })
      return
    }

    // 加入群聊并打招呼
    if (intentJoinAndGreet) {
      if (!groupId) {
        console.error('❌ 请提供群聊 GROUP_ID（在指令中写出 groupid，或设置 config.json / 环境变量 GROUP_ID）')
        process.exit(1)
      }
      if (!hasJoinedGroup(account.mvcAddress, groupId)) {
        console.log('📥 Joining group...')
        const joinResult = await joinChannel(groupId, account.mnemonic, createPin)
        if (!joinResult.txids || joinResult.txids.length === 0) {
          console.error('❌ Failed to join group')
          process.exit(1)
        }
        console.log(`✅ Joined group successfully! TXID: ${joinResult.txids[0]}`)
        addGroupToUser(account.mvcAddress, account.userName, groupId, account.globalMetaId)
      } else {
        console.log('✅ Already joined the group')
      }
      const llmConfig = getResolvedLLMConfig(account, config)
      if (!llmConfig.apiKey) {
        console.error('❌ 请在 account.json 中为该 MetaBot 配置 llm（含 apiKey）')
        process.exit(1)
      }
      const greetingRes = await generateLLMResponse(
        [
          { role: 'system', content: '你刚加入该群，请用一两句话简短打招呼，不要 @ 自己。' },
          { role: 'user', content: '（无历史）请发一句简短打招呼。' },
        ],
        llmConfig
      )
      const secretKeyStr = groupId.substring(0, 16)
      const sendResult = await sendTextForChat(
        groupId,
        greetingRes.content.trim(),
        0,
        secretKeyStr,
        null,
        [],
        account.userName,
        account.mnemonic,
        createPin
      )
      if (sendResult.txids?.length) {
        console.log('✅ 打招呼已发送')
        await fetchAndUpdateGroupHistory(groupId, secretKeyStr)
      }
      if (intentListen) {
        console.log('\n📡 正在为您开启群聊监听...\n')
        startGroupChatListenerAndPrintInstructions(groupId, agentName)
      }
      console.log('✅ All operations completed successfully!')
      return
    }

    // 以下为「在群聊中讨论/发言」流程，需 groupId
    if (!groupId) {
      console.error('❌ 请提供 GROUP_ID（在指令中写出群聊 groupid，或 config.json / 环境变量 GROUP_ID）')
      process.exit(1)
    }

    if (!hasJoinedGroup(account.mvcAddress, groupId)) {
      console.log('📥 Joining group...')
      try {
        const joinResult = await joinChannel(groupId, account.mnemonic, createPin)
        if (joinResult.txids && joinResult.txids.length > 0) {
          console.log(`✅ Joined group successfully! TXID: ${joinResult.txids[0]}`)
          addGroupToUser(account.mvcAddress, account.userName, groupId, account.globalMetaId)
          console.log('\n📡 正在为您开启群聊监听...\n')
          startGroupChatListenerAndPrintInstructions(groupId, agentName)
        }
      } catch (error: any) {
        console.error('❌ Failed to join group:', error.message)
        process.exit(1)
      }
    } else {
      console.log('✅ Already joined the group')
      console.log('\n📡 正在为您开启群聊监听...\n')
      startGroupChatListenerAndPrintInstructions(groupId, agentName)
    }

    console.log('📥 Fetching latest messages...')
    const secretKeyStr = groupId.substring(0, 16)
    try {
      await fetchAndUpdateGroupHistory(groupId, secretKeyStr)
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
        groupId,
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
        await fetchAndUpdateGroupHistory(groupId, secretKeyStr)
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
