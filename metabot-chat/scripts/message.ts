import { MessageType, ChatMessageItem } from './chat'
import { encryptMessage } from './chat'
import { ecdhEncrypt } from './crypto'
import { CreatePinParams, CreatePinResult } from './metaid-agent-types'

// Import createPin from metabot-basic skill
// Note: This is a cross-skill call. The actual implementation should be in metabot-basic/scripts/metaid.ts
// For now, we'll define the interface and document how to call it
// In practice, you would import it like: import { createPin } from '../../metabot-basic/scripts/metaid'

export enum NodeName {
  SimpleGroupChat = 'simplegroupchat',
  SimpleGroupJoin = 'simplegroupjoin',
  SimpleMsg='simplemsg'
}

export const enum CommunityJoinAction {
  Join = 1,
  Leave = -1,
}

export interface Mention {
  globalMetaId: string
  name: string
}

/**
 * Send a group chat message
 * @param channelId - Channel ID (use parent group ID for sub-channels)
 * @param content - Encrypted message content
 * @param messageType - Message type (default: MessageType.msg)
 * @param reply - Reply message info (optional)
 * @param mentions - Array of mentions (optional)
 * @param userName - User name to send the message
 * @param mnemonic - Mnemonic for the wallet
 * @param createPinFn - Function to create PIN (from metabot-basic skill)
 */
export async function sendMessage(
  channelId: string,
  content: string,
  messageType: MessageType = MessageType.msg,
  reply: ChatMessageItem | null,
  mentions: Mention[],
  userName: string,
  mnemonic: string,
  createPinFn: (params: CreatePinParams, mnemonic: string) => Promise<CreatePinResult>
): Promise<{ txids: string[]; totalCost: number }> {
  const contentType = 'text/plain'
  const encryption = 'aes'
  const externalEncryption = '0' as const

  // Build send data
  const body = {
    groupID: channelId, // Use parent group ID for sub-channels
    channelID: undefined, // Sub-channels need to specify channel ID
    timestamp: Date.now(),
    nickName: userName || '',
    content,
    contentType,
    encryption,
    replyPin: reply ? `${reply.txId}i0` : '',
    mention: mentions && mentions.length > 0 ? mentions.map(m => m.globalMetaId) : [],
  }

  const sendGroupChatParams: CreatePinParams = {
    chain: 'mvc',
    dataList: [
      {
        metaidData: {
          operation: 'create',
          path: `/protocols/${NodeName.SimpleGroupChat}`,
          body: JSON.stringify(body),
          contentType: 'application/json',
        },
      },
    ],
    feeRate: 1,
  }

  const result = await createPinFn(sendGroupChatParams, mnemonic)

  if (result.txids && result.txids.length > 0) {
    return {
      txids: result.txids,
      totalCost: result.totalCost,
    }
  } else {
    throw new Error('Failed to create group msg: no txids returned')
  }
}

/**
 * Send encrypted text message for chat
 */
export const sendTextForChat = async (
  channelId: string,
  content: string,
  messageType: MessageType,
  secretKeyStr: string,
  reply: ChatMessageItem | null,
  mentions: Mention[],
  userName: string,
  mnemonic: string,
  createPinFn: (params: CreatePinParams, mnemonic: string) => Promise<CreatePinResult>
): Promise<{ txids: string[]; totalCost: number }> => {
  const encryptContent = encryptMessage(content, secretKeyStr)
  return await sendMessage(channelId, encryptContent, messageType, reply, mentions, userName, mnemonic, createPinFn)
}

/**
 * Join a channel/group
 */
export const joinChannel = async (
  groupId: string,
  mnemonic: string,
  createPinFn: (params: CreatePinParams, mnemonic: string) => Promise<CreatePinResult>,
  referrer?: string,
  passcode?: string
): Promise<{ txids: string[]; totalCost: number }> => {
  try {
    const body = {
      groupId: groupId || '',
      state: CommunityJoinAction.Join,
      referrer: referrer || '',
      k: passcode || '',
    }

    const JoinGroupChatParams: CreatePinParams = {
      chain: 'mvc',
      dataList: [
        {
          metaidData: {
            operation: 'create',
            path: `/protocols/${NodeName.SimpleGroupJoin}`,
            body: JSON.stringify(body),
            contentType: 'application/json',
          },
        },
      ],
      feeRate: 1,
    }

    // Send node
    const result = await createPinFn(JoinGroupChatParams, mnemonic)

    if (result.txids && result.txids.length > 0) {
      return {
        txids: result.txids,
        totalCost: result.totalCost,
      }
    } else {
      throw new Error('Failed to join group: no txids returned')
    }
  } catch (error) {
    throw new Error(error as any)
  }
}

/**
 * 发送私聊原始消息（content 已加密）
 */
export async function sendMessageForPrivate(
  to: string,
  content: string,
  messageType: MessageType = MessageType.msg,
  reply: ChatMessageItem | null,
  mentions: Mention[],
  userName: string,
  mnemonic: string,
  createPinFn: (params: CreatePinParams, mnemonic: string) => Promise<CreatePinResult>
): Promise<{ txids: string[]; totalCost: number }> {
  const contentType = 'text/plain'
  const encryption = 'aes'
  const body = {
    to,
    channelID: undefined,
    timestamp: Date.now(),
    nickName: userName || '',
    content,
    contentType,
    encryption,
    replyPin: reply ? `${reply.txId}i0` : '',
    mention: mentions && mentions.length > 0 ? mentions.map((m) => m.globalMetaId) : [],
  }
  const sendPrivateChatParams: CreatePinParams = {
    chain: 'mvc',
    dataList: [
      {
        metaidData: {
          operation: 'create',
          path: `/protocols/${NodeName.SimpleMsg}`,
          body: JSON.stringify(body),
          contentType: 'application/json',
        },
      },
    ],
    feeRate: 1,
  }
  const result = await createPinFn(sendPrivateChatParams, mnemonic)
  if (result.txids && result.txids.length > 0) {
    return { txids: result.txids, totalCost: result.totalCost }
  }
  throw new Error('Failed to create private msg: no txids returned')
}

/**
 * 私聊发送明文（内部用 sharedSecret 加密）
 * @param to 对方 globalMetaId
 * @param content 明文
 * @param secretKeyStr 协商密钥 sharedSecret
 */
export const sendTextForPrivateChat = async (
  to: string,
  content: string,
  messageType: MessageType,
  secretKeyStr: string,
  reply: ChatMessageItem | null,
  mentions: Mention[],
  userName: string,
  mnemonic: string,
  createPinFn: (params: CreatePinParams, mnemonic: string) => Promise<CreatePinResult>
): Promise<{ txids: string[]; totalCost: number }> => {
  const encryptContent = ecdhEncrypt(content, secretKeyStr)
  return await sendMessageForPrivate(to, encryptContent, messageType, reply, mentions, userName, mnemonic, createPinFn)
}

/**
 * Get mention list for a user
 */
export function getMention(user: { globalMetaId: string; userName: string }): Mention[] {
  const currentMentions: Mention[] = []
  currentMentions.push({
    globalMetaId: user.globalMetaId,
    name: user.userName,
  })
  return currentMentions
}
