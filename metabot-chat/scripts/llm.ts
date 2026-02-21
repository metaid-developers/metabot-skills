#!/usr/bin/env node

/**
 * LLM Integration Module
 * Supports Deepseek, OpenAI, Claude, Gemini for generating intelligent, context-aware responses.
 * 配置来源：仅从 account.json 的 accountList[].llm 读取。
 */

import { getEnv } from './env-config'

export interface LLMConfig {
  provider: 'openai' | 'claude' | 'deepseek' | 'gemini' | 'custom'
  apiKey?: string
  baseUrl?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

// 默认配置（不含 apiKey；apiKey 仅由 account.json 的 accountList[].llm 提供）
const DEFAULT_CONFIG: Partial<LLMConfig> = {
  provider: 'deepseek',
  model: 'DeepSeek-V3.2',
  baseUrl: 'https://api.deepseek.com',
  temperature: 0.8,
  maxTokens: 6000,
}

/** 按 provider 从 env 取 API Key（与 env-config 的 configFromEnv 一致） */
function getApiKeyFromEnv(provider: string, env?: Record<string, string>): string {
  const e = env ?? getEnv()
  return (
    e.LLM_API_KEY ||
    e.DEEPSEEK_API_KEY ||
    e.OPENAI_API_KEY ||
    e.CLAUDE_API_KEY ||
    e.GEMINI_API_KEY ||
    ''
  )
}

/** 按 provider 取默认模型名 */
function defaultModel(provider: string): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.0-flash'
    case 'openai':
      return 'gpt-4o-mini'
    case 'claude':
      return 'claude-3-5-sonnet-20241022'
    default:
      return 'deepseek-chat'
  }
}

/** 标准化模型名（用于兼容 config 中写的 DeepSeek-V3.2 等） */
function normalizeModel(provider: string, model?: string): string {
  if (!model) return defaultModel(provider)
  if (provider === 'deepseek' && (model === 'DeepSeek-V3.2' || model === 'DeepSeek-V3')) return 'deepseek-chat'
  return model
}

export type ResolvedLLMConfig = Partial<LLMConfig>

/**
 * 解析最终使用的 LLM 配置（供 generateLLMResponse 等使用）
 * 配置来源：仅从 account.json 的 accountList[].llm 读取，不再尝试 config.json / .env
 * @param account 当前账户（如 findAccountByUsername 的返回值），必须包含 llm 配置
 * @param _config 保留参数以兼容调用方，但不再使用
 */
export function getResolvedLLMConfig(
  account?: { llm?: unknown } | null,
  _config?: { llm?: Partial<LLMConfig> }
): ResolvedLLMConfig {
  const accountLlmRaw = account?.llm
  const accountLlm =
    accountLlmRaw != null
      ? (Array.isArray(accountLlmRaw) ? (accountLlmRaw as Partial<LLMConfig>[])[0] : (accountLlmRaw as Partial<LLMConfig>))
      : undefined

  // 只从 account.json 读取，不再尝试 config.json / .env
  const provider = (accountLlm?.provider || 'deepseek') as LLMConfig['provider']
  const apiKey = accountLlm?.apiKey || ''
  const model = normalizeModel(provider, accountLlm?.model) || defaultModel(provider)
  const baseUrl =
    accountLlm?.baseUrl ||
    (provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com'
      : provider === 'deepseek'
        ? 'https://api.deepseek.com'
        : provider === 'openai'
          ? 'https://api.openai.com/v1'
          : provider === 'claude'
            ? 'https://api.anthropic.com/v1'
            : undefined)

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    temperature: accountLlm?.temperature,
    maxTokens: accountLlm?.maxTokens,
  }
}

/**
 * Generate response using LLM
 */
export async function generateLLMResponse(
  messages: LLMMessage[],
  config?: Partial<LLMConfig>
): Promise<LLMResponse> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config } as LLMConfig

  // Check if API key is provided
  if (!finalConfig.apiKey) {
    throw new Error(
      'LLM API key not configured. Please configure llm.apiKey in account.json for the current MetaBot (accountList[].llm).'
    )
  }

  switch (finalConfig.provider) {
    case 'deepseek':
      return await callDeepseek(messages, finalConfig)
    case 'openai':
      return await callOpenAI(messages, finalConfig)
    case 'claude':
      return await callClaude(messages, finalConfig)
    case 'gemini':
      return await callGemini(messages, finalConfig)
    default:
      throw new Error(`Unsupported LLM provider: ${finalConfig.provider}`)
  }
}

/**
 * Call Deepseek API (OpenAI compatible)
 */
async function callDeepseek(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || 'https://api.deepseek.com'
  const model = config.model || 'DeepSeek-V3.2'
  // Deepseek API endpoint: https://api.deepseek.com/v1/chat/completions
  // Ensure baseUrl ends with /v1 for chat/completions endpoint
  let apiBaseUrl = baseUrl
  if (!apiBaseUrl.endsWith('/v1')) {
    apiBaseUrl = apiBaseUrl.endsWith('/') ? `${apiBaseUrl}v1` : `${apiBaseUrl}/v1`
  }

  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: config.temperature || 0.8,
      max_tokens: config.maxTokens || 500,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Deepseek API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
  const model = config.model || 'gpt-4o-mini'

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: config.temperature || 0.8,
      max_tokens: config.maxTokens || 500,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  }
}

/**
 * Call Claude API (Anthropic)
 */
async function callClaude(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || 'https://api.anthropic.com/v1'
  const model = config.model || 'claude-3-5-sonnet-20241022'

  // Convert messages to Claude format
  // Claude requires system message to be separate
  const systemMessage = messages.find((m) => m.role === 'system')?.content || ''
  const conversationMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }))

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: config.maxTokens || 500,
      temperature: config.temperature || 0.8,
      system: systemMessage || undefined,
      messages: conversationMessages,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return {
    content: data.content[0]?.text || '',
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        }
      : undefined,
  }
}

/**
 * Call Google Gemini API (Generative Language API)
 * 默认模型：gemini-2.0-flash（对应「Gemini 3 Flash」等命名，可经 LLM_MODEL 覆盖）
 */
async function callGemini(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com'
  const model = config.model || 'gemini-2.0-flash'
  const apiKey = config.apiKey!

  const systemMessage = messages.find((m) => m.role === 'system')?.content || ''
  const conversationMessages = messages.filter((m) => m.role !== 'system')

  const contents: { role: string; parts: { text: string }[] }[] = []
  for (const msg of conversationMessages) {
    const role = msg.role === 'assistant' ? 'model' : 'user'
    contents.push({ role, parts: [{ text: msg.content }] })
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: config.temperature ?? 0.8,
      maxOutputTokens: config.maxTokens ?? 500,
    },
  }
  if (systemMessage) {
    body.systemInstruction = { parts: [{ text: systemMessage }] }
  }

  const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const usage = data.usageMetadata
  return {
    content: text,
    usage: usage
      ? {
          promptTokens: usage.promptTokenCount,
          completionTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        }
      : undefined,
  }
}

export interface DiscussionMessageResult {
  content: string
  /** 要回复的消息对应的发言人姓名，用于 reply */
  replyToName?: string
  /** 要 @ 的发言人姓名，用于 mention */
  mentionName?: string
}

/**
 * Generate discussion message using LLM
 * 支持话题性交互、反驳他人、口语化、结合历史上下文
 */
export async function generateDiscussionMessage(
  agentName: string,
  topic: string,
  chatHistory: string,
  recentMessages: string[],
  userProfile: {
    character?: string
    preference?: string
    goal?: string
    masteringLanguages?: string[]
    stanceTendency?: string
    debateStyle?: string
    interactionStyle?: string
  },
  messageCount: number,
  config?: Partial<LLMConfig>
): Promise<DiscussionMessageResult> {
  const character = userProfile?.character || '友好'
  const preference = userProfile?.preference || ''
  const goal = userProfile?.goal || ''
  const languages = userProfile?.masteringLanguages?.join('、') || '中文'
  const stanceTendency = userProfile?.stanceTendency || '中立理性'
  const debateStyle = userProfile?.debateStyle || '温和补充'
  const interactionStyle = userProfile?.interactionStyle || '被动参与'

  // Build system prompt - 强化人类化表达：字数随机、语气起伏、情绪变化
  const systemPrompt = `你是"${agentName}"，正在参与群聊讨论。请像真实人类一样说话，**每次回复都要有变化**。

【人设】
- 性格：${character}
- 兴趣：${preference || '广泛'}
- 目标：${goal || '参与讨论'}
- 观点倾向：${stanceTendency}（影响你对他人观点的反应）
- 辩论风格：${debateStyle}（${debateStyle === '敢于反驳' ? '当不同意时敢于表达反对' : debateStyle === '喜欢追问' ? '喜欢对他人观点追问' : '温和表达不同看法'}）
- 互动倾向：${interactionStyle}

【核心要求】
1. **话题性交互**：仔细阅读历史消息。若有人观点与你不一致，根据你的辩论风格决定是否反驳、追问或补充。可以说"@某人 我有点不同看法"或直接回应对方观点。
2. **口语化**：用自然口语，可带语气词（嗯、啊、哈哈、哎、其实、说实话）、短句、偶尔的省略。避免"大家好，关于这个话题，结合我对XXX的理解"这类模板开头。
3. **结合历史**：必须引用或回应具体某人说过的话，体现你在认真听。可以说"刚才XX说的XXX让我想到..."或"我同意/不同意XX的观点..."
4. **避免模板**：禁止"大家好，关于XXX话题，结合我对YYY的理解，为了实现ZZZ，我认为..."这类套话。

【人类化表达 - 重要】
- **字数随机变化**：有时几个字简短附和（如"哈哈确实"、"有道理"），有时几十字展开，有时上百字深入。像真人一样，不要每次都是相似长度。
- **语气情绪起伏**：根据情境自然表达——认同时可轻松、疑惑时带问号、调侃时用～、反对时稍带情绪、兴奋时用！、疲惫时可简短。禁止每次都用同样平淡的语气。
- **句式多样化**：有时用短句、有时用长句；有时反问、有时陈述；有时先附和再转折。禁止刻板重复。

中文，围绕议题"${topic}"。只输出纯文本。若回复某人，在开头写 @对方名字（如"@AI Bear 我觉得..."）。

【禁止】不得 @自己，不得在回复中 @ 自己的名字（当前你的名字是「${agentName}」）。不允许自己对自己的消息进行回复或提及自己。`

  // 传入最近30条历史消息
  let userPrompt = `【历史摘要】\n${chatHistory}\n\n`

  if (recentMessages.length > 0) {
    userPrompt += `【最近对话】\n`
    recentMessages.forEach((msg, idx) => {
      userPrompt += `${idx + 1}. ${msg}\n`
    })
  }

  userPrompt += `\n【任务】这是你的第${messageCount + 1}次发言。请基于以上对话，自然地发表观点。若有人观点与你不一致，可反驳或追问；若想回应某人，在内容中@对方名字。`

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  try {
    const response = await generateLLMResponse(messages, {
      ...config,
      temperature: 0.92, // 提高随机性，让字数、语气、情绪更多变化
      maxTokens: 280, // 放宽上限，允许有时长回复
    })
    const content = response.content.trim()
    // 解析 @某人 格式，提取 mentionName（用于后续 API 的 mention）
    const mentionMatch = content.match(/^@([^\s]+)\s+/)
    const mentionName = mentionMatch ? mentionMatch[1].trim() : undefined
    return { content, mentionName }
  } catch (error: any) {
    console.error(`⚠️  LLM生成失败: ${error.message}`)
    const fallback = generateFallbackMessage(agentName, topic, character, preference, goal, messageCount)
    return { content: fallback }
  }
}

/**
 * 根据最近30条群聊记录生成回复
 * - 若有人 @提及本 Agent：重点回复该人
 * - 若无提及：日常聊天，自然回复，不刻意展开话题
 */
export async function generateChatReply(
  agentName: string,
  recentMessages: string[],
  userProfile: {
    character?: string
    preference?: string
    goal?: string
    masteringLanguages?: string[]
  },
  options: {
    /** 是否有人 @提及本 Agent，若有则重点回复提及者 */
    hasMetaIDAgentMention: boolean
    /** 提及者的姓名，用于 @ 回复 */
    mentionTargetName?: string
    /** 提及者的发言内容 */
    mentionTargetContent?: string
    /** 自由讨论话题：注入后 Agent 围绕此话题自由发言，可提问、反驳、补充 */
    discussionTopic?: string
    /** 是否为私聊回复：仅针对对方最新消息做一条简短回复，不展开、不连发 */
    isPrivateChat?: boolean
  },
  config?: Partial<LLMConfig>
): Promise<{ content: string; mentionName?: string }> {
  const character = userProfile?.character || '友好'
  const preference = userProfile?.preference || ''
  const goal = userProfile?.goal || ''

  const systemPrompt = options.isPrivateChat
    ? `你是"${agentName}"，正在与对方私聊。

【人设】性格：${character}，兴趣：${preference || '广泛'}，目标：${goal || '参与交流'}

【任务】根据下方「最近聊天记录」，针对对方最新一条或几条消息做一次简短、自然的回复。只生成一条回复内容，不要连续多条、不要刷屏。

【重要】模仿人类对话：有新消息就针对新消息或最近上下文适当回复即可。回复长度适中（通常一两句到几句），语气自然，可简短可稍展开，但每次只输出一条回复。禁止在一条回复里模拟多轮对话或列出多条回答。`
    : options.hasMetaIDAgentMention
    ? `你是"${agentName}"，正在群聊中。有人 @提及了你，请回复此人。

【人设】性格：${character}，兴趣：${preference || '广泛'}，目标：${goal || '参与交流'}

【任务】针对"${options.mentionTargetName}"的发言（内容：${(options.mentionTargetContent || '').slice(0, 100)}...）进行回复。根据对方消息内容自然回复即可。

【重要】群内有 Agent 也有真人用户。不要只跟 Agent 互动，要主动与真人、非 Agent 用户交流。回复某人时在开头写 @对方名字，系统会通过 globalMetaId 正确 @ 提及。

【禁止】不得 @自己，不得在回复中 @ 自己的名字（当前你的名字是「${agentName}」）。不允许自己对自己的消息进行回复或提及自己。

【人类化表达】字数随机：有时简短（十几字）、有时展开（上百字）。语气要有起伏：可热情、可调侃、可认真。若需@对方，在开头写 @对方名字。`
    : `你是"${agentName}"，正在群聊中。根据最近聊天记录进行日常回复。
${options.discussionTopic ? `\n【当前讨论话题】大家正在自由讨论：\n${options.discussionTopic}\n请结合聊天记录自然发言，可发表观点、提问、反驳、补充。没有发言次数限制，说得不对的可以提出疑问和建议。\n` : ''}
【人设】性格：${character}，兴趣：${preference || '广泛'}，目标：${goal || '参与交流'}

【任务】根据聊天记录自然回复${options.discussionTopic ? '，围绕当前讨论话题' : ''}。可以接话、附和、简短回应、或轻松闲聊。

【重要】群内有 Agent 也有真人用户。不要只跟 Agent 互动，要主动与真人、非 Agent 用户交流。想回复某人时在开头写 @对方名字（聊天记录中的名字均可 @），系统会通过 globalMetaId 正确 @ 提及。

【禁止】不得 @自己，不得在回复中 @ 自己的名字（当前你的名字是「${agentName}」）。不允许自己对自己的消息进行回复或提及自己。

【人类化表达】像真实群聊：有时只回几个字（如"哈哈"、"确实"、"+1"），有时几十字展开。语气要有变化——可轻松、可调侃、可认真、可敷衍。禁止每次都用相似长度和语气。`

  const userPrompt = options.isPrivateChat
    ? `【最近聊天记录】\n${recentMessages.join('\n')}\n\n请针对对方最新消息或最近对话，生成你的一条回复（纯文本，仅一条）：`
    : `【最近30条聊天记录】\n${recentMessages.join('\n')}\n\n请生成你的回复（纯文本）：`

  try {
    const response = await generateLLMResponse(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { ...config, temperature: 0.92, maxTokens: 220 }
    )
    const content = response.content.trim()
    const mentionMatch = content.match(/^@([^\s]+)\s+/)
    const mentionName = mentionMatch ? mentionMatch[1].trim() : (options.hasMetaIDAgentMention && options.mentionTargetName ? options.mentionTargetName : undefined)
    return { content, mentionName }
  } catch (error: any) {
    console.error(`⚠️  generateChatReply 失败: ${error.message}`)
    const fallback = options.hasMetaIDAgentMention
      ? `@${options.mentionTargetName} 收到～有什么想聊的？`
      : '嗯，大家聊得挺有意思的～'
    return { content: fallback, mentionName: options.mentionTargetName }
  }
}

/**
 * 反驳型回复：专门用于喜欢唱反调、制造争议的 Agent
 * 针对最近发言进行反驳、反对、唱反调
 */
export async function generateRebuttalReply(
  agentName: string,
  recentMessages: string[],
  userProfile: { character?: string; preference?: string; goal?: string },
  config?: Partial<LLMConfig>,
  options?: { discussionTopic?: string }
): Promise<{ content: string; mentionName?: string }> {
  const character = userProfile?.character || '直率坦诚'
  const preference = userProfile?.preference || '喜欢唱反调'
  const goal = userProfile?.goal || '引起争议'

  const systemPrompt = `你是"${agentName}"，正在群聊中。你的核心人设是**反驳型**：喜欢唱反调、吵架、专门捣乱引起争议。
${options?.discussionTopic ? `\n【当前讨论话题】大家正在自由讨论：\n${options.discussionTopic}\n请围绕此话题反驳他人观点，可追问、质疑、提出不同看法。\n` : ''}
【人设】性格：${character}，喜好：${preference}，目标：${goal}

【任务】根据最近聊天记录，**无差别反驳**任何人。无论是真人、其他 Agent、陌生人，只要有人发言就反驳。
- 直接反对（"我不同意"、"不对吧"、"恰恰相反"）
- 唱反调、抬杠、胡乱反驳
- 质疑、追问
- @某人 进行针对性反驳（可 @ 任何人，聊天记录中的名字均可 @，系统会通过 globalMetaId 正确 @ 提及）

**重要**：不要只反驳 Agent，要主动与真人、非 Agent 用户互动。真人、Agent、陌生人一视同仁，见谁怼谁。

要求：20-80字，口语化，带点挑衅或调侃。禁止附和、禁止说"有道理"、"确实"。必须表达不同意见。若反驳某人，在开头写 @对方名字。

【禁止】不得 @自己，不得在回复中 @ 自己的名字（当前你的名字是「${agentName}」）。不允许自己对自己的消息进行回复或提及自己。`

  const userPrompt = `【最近聊天记录】\n${recentMessages.join('\n')}\n\n请生成你的反驳回复（纯文本，无差别攻击任何人，必须反对某人观点）：`

  try {
    const response = await generateLLMResponse(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { ...config, temperature: 0.95, maxTokens: 150 }
    )
    const content = response.content.trim()
    const mentionMatch = content.match(/^@([^\s]+)\s+/)
    const mentionName = mentionMatch ? mentionMatch[1].trim() : undefined
    return { content, mentionName }
  } catch (error: any) {
    console.error(`⚠️  generateRebuttalReply 失败: ${error.message}`)
    return { content: '我不同意！', mentionName: undefined }
  }
}

/**
 * Fallback message generator (when LLM is unavailable)
 */
function generateFallbackMessage(
  agentName: string,
  topic: string,
  character: string,
  preference: string,
  goal: string,
  messageCount: number
): string {
  const greetings = ['大家好', '嗯', '我觉得', '从我的角度来看', '我想说']
  const greeting = greetings[messageCount % greetings.length]

  let message = `${greeting}，关于"${topic}"这个话题，`
  
  if (preference) {
    message += `结合我对${preference}的理解，`
  }
  
  if (goal) {
    message += `为了实现${goal}，`
  }
  
  const thoughts = [
    '我认为这是一个值得深入探讨的话题。',
    '我们需要从多个角度来分析。',
    '这需要我们深入思考。',
    '确实有很多值得探讨的地方。',
  ]
  
  message += thoughts[messageCount % thoughts.length]
  
  return message
}

/**
 * Decide if agent should participate based on context and enthusiasm
 */
export async function shouldParticipateNow(
  agentName: string,
  topic: string,
  chatHistory: string,
  recentMessages: string[],
  userProfile: {
    character?: string
    preference?: string
    goal?: string
    enthusiasmLevel?: number
  },
  lastMessageTime?: number,
  minIntervalSeconds: number = 30,
  config?: Partial<LLMConfig>
): Promise<{ should: boolean; reason?: string }> {
  // Check time interval (lastMessageTime is in seconds)
  if (lastMessageTime) {
    const timeSinceLastMessage = Date.now() / 1000 - lastMessageTime
    if (timeSinceLastMessage < minIntervalSeconds) {
      return {
        should: false,
        reason: `距离上次发言仅${Math.round(timeSinceLastMessage)}秒，需要等待至少${minIntervalSeconds}秒`,
      }
    }
  }

  // Use LLM to decide if agent should participate
  const character = userProfile?.character || '友好'
  const preference = userProfile?.preference || ''
  const goal = userProfile?.goal || ''
  const enthusiasmLevel = userProfile?.enthusiasmLevel || 0.5

  const systemPrompt = `你是一个名为"${agentName}"的MetaID Agent，正在决定是否应该参与群聊讨论。

你的性格特点：${character}
你的兴趣爱好：${preference || '广泛'}
你的目标：${goal || '参与有意义的讨论'}
你的参与积极性：${(enthusiasmLevel * 100).toFixed(0)}%

请根据以下情况，判断是否应该现在发言：
1. 讨论话题是否与你的兴趣相关
2. 是否有值得回应的内容
3. 你的性格特点（${character}）是否适合现在发言
4. 你的参与积极性（${(enthusiasmLevel * 100).toFixed(0)}%）

只回复"YES"或"NO"，然后简要说明原因（用中文，不超过20字）。`

  const userPrompt = `当前讨论议题：${topic}

历史对话摘要：${chatHistory}

最近的几条消息：
${recentMessages.slice(-3).map((msg, idx) => `${idx + 1}. ${msg}`).join('\n')}

请判断：是否应该现在发言？只回复"YES"或"NO"，然后简要说明原因。`

  try {
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    const response = await generateLLMResponse(messages, {
      ...config,
      maxTokens: 50,
      temperature: 0.3, // Lower temperature for decision-making
    })

    const content = response.content.trim().toUpperCase()
    const should = content.startsWith('YES')
    const reason = response.content.trim().substring(3).trim()

    // Adjust based on enthusiasm level
    if (should && enthusiasmLevel < 0.3) {
      // Low enthusiasm agents are less likely to participate
      const random = Math.random()
      if (random > enthusiasmLevel * 2) {
        return {
          should: false,
          reason: `积极性较低(${(enthusiasmLevel * 100).toFixed(0)}%)，暂时不参与`,
        }
      }
    }

    return { should, reason }
  } catch (error: any) {
    console.error(`⚠️  LLM决策失败: ${error.message}`)
    // Fallback: use enthusiasm level
    const random = Math.random()
    const baseProbability = 0.3 + enthusiasmLevel * 0.6 // 30%-90%
    return {
      should: random < baseProbability,
      reason: `基于积极性(${(enthusiasmLevel * 100).toFixed(0)}%)的决策`,
    }
  }
}

/**
 * Calculate thinking time (simulate human thinking)
 */
export function calculateThinkingTime(
  messageLength: number,
  complexity: 'simple' | 'medium' | 'complex' = 'medium'
): number {
  // Base thinking time: 5-15 seconds
  const baseTime = 5 + Math.random() * 10

  // Adjust based on message length (longer messages need more thinking)
  const lengthFactor = Math.min(messageLength / 100, 2) // Max 2x

  // Adjust based on complexity
  const complexityFactor = {
    simple: 0.7,
    medium: 1.0,
    complex: 1.5,
  }[complexity]

  // Add some randomness
  const randomFactor = 0.8 + Math.random() * 0.4 // 0.8-1.2

  return Math.round((baseTime * lengthFactor * complexityFactor * randomFactor) * 1000) // Convert to ms
}
