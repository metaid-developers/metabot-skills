import { createLazyApiClient } from './api-factory'
import { decrypt, encrypt } from './crypto'

export interface ChatUserInfo {
  address: string
  avatarImage?: string
  avatarTxId?: string
  avatarType?: string
  globalMetaId?: string
  metaId?: string
  nickName?: string
}

export interface ChatMessageItem {
  address: string
  avatarImage: string
  avatarTxId: string
  avatarType: string
  chatType: number
  content: string
  contentType: string
  data: string
  chain: 'btc' | 'mvc'
  encryption: string
  groupId: string
  channelId?: string
  metaId: string
  metanetId: string
  nickName: string
  pinId?: string
  params: string
  protocol: string
  redMetaId: string
  timestamp: number
  txId: string
  replyTx: string
  userInfo: ChatUserInfo
  isMock?: boolean
  replyInfo?: {
    channelId?: string
    chatType: number
    content: string
    contentType: string
    encryption: string
    metaId: string
    nickName: string
    protocol: string
    timestamp: number
    txId: string
    userInfo: ChatUserInfo
  }
  claimOver?: boolean
  globalMetaId?: string
  mention?: string[]
  index?: number
}

export interface GroupRoomInfo {
  communityId: string
  groupId: string
  txId: string
  pinId: string
  roomName: string
  roomNote: string
  roomIcon: string
  roomType: string
  roomStatus: string
  roomJoinType: string
  roomAvatarUrl: string
  roomNinePersonHash: string
  roomNewestTxId: string
  roomNewestPinId: string
  roomNewestMetaId: string
  roomNewestUserName: string
  roomNewestProtocol: string
  roomNewestContent: string
  roomNewestTimestamp: number
  createUserMetaId: string
  createUserAddress: string
  createUserInfo: ChatUserInfo
  userCount: number
  chatSettingType: number
  deleteStatus: number
  timestamp: number
  chain: string
  blockHeight: number
  index: number
}

export enum MessageType {
  msg = 0,
  red = 23,
  img = 3,
  cardMsg = 8,
}

/** idchat.io API 需要浏览器头，否则可能返回 fetch failed */
const CHAT_API_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.idchat.io',
  Referer: 'https://www.idchat.io/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
}

// Create lazy-initialized API client
const ChatApi = createLazyApiClient(
  () => {
    return `https://api.idchat.io/chat-api`
  },
  {
    responseHandel: (response: any) => {
      return new Promise((resolve, reject) => {
        if (response?.status && response?.status == 500) {
          reject(response.data)
          return
        }

        if (response?.data && typeof response.data?.code === 'number') {
          if (response.data.code === 0) {
            resolve(response.data)
          } else {
            resolve(response.data)
          }
        } else {
          resolve(response.data)
        }
      })
    },
    errorHandel: ((error: any) => {
      return new Promise((resolve, reject) => {
        reject(error)
      })
    })
  }
)

/**
 * Get channel newest messages
 */
export const getChannelNewestMessages = async ({
  groupId,
  size = 30,
  startIndex = '0',
}: {
  groupId: string
  size?: number
  startIndex?: string
}): Promise<{
  total: number
  lastIndex: number
  list: ChatMessageItem[] | null
}> => {
  const query = new URLSearchParams({
    groupId,
    startIndex: String(startIndex),
    size: String(size),
  }).toString()
  
  const data: {
    data: {
      total: number
      lastIndex: number
      list: ChatMessageItem[] | null
    }
  } = await ChatApi.get(`/group-chat/group-chat-list-by-index?${query}`, CHAT_API_HEADERS)
  
  return data.data
}

export const getChannelInfo = async ({
  groupId,
}: {
  groupId: string
  
}): Promise<GroupRoomInfo> => {
  const query = new URLSearchParams({
    groupId,
  }).toString()
  
  const data: {
    data:GroupRoomInfo
  } = await ChatApi.get(`/group-chat/group-info?${query}`, CHAT_API_HEADERS)
  
  return data.data
}

export const getChannelNewestMessagesByStartTime = async ({
  groupId,
  startTimestamp = 0,
  size = 30,
}: {
  groupId: string
  startTimestamp?: number
  size?: number
}): Promise<{
  total: number
  lastTimestamp: number
  list: ChatMessageItem[] | null
}> => {
  const query = new URLSearchParams({
    groupId,
    startTimestamp: String(startTimestamp),
    size: String(size),
  }).toString()
  
  const data: {
    data: {
      total: number
      lastTimestamp: number
      list: ChatMessageItem[] | null
    }
  } = await ChatApi.get(`/group-chat/group-chat-list-by-start-time?${query}`, CHAT_API_HEADERS)
  
  return data.data
}

export const getPrivateNewestMessagesByStartTime = async ({
  metaId,
  otherMetaId,
  size=30,
  timestamp=0
}: {
  metaId: string
  otherMetaId:string
  timestamp?: number
  size?: number
}): Promise<{
  total: number
  nextTimestamp: number
  list: ChatMessageItem[] | null
}> => {
  const query = new URLSearchParams({
    metaId,
    otherMetaId,
    timestamp: String(timestamp),
    size: String(size),
  }).toString()
  
  const data: {
    data: {
      total: number
      nextTimestamp: number
      list: ChatMessageItem[] | null
    }
  } = await ChatApi.get(`/group-chat/private-chat-list?${query}`, CHAT_API_HEADERS)
  
  return data.data
}

export const getPrivateNewestMessagesByStartIndex = async ({
  metaId,
  otherMetaId,
  size=30,
  startIndex=0
}: {
  metaId: string
  otherMetaId:string
  startIndex?: number
  size?: number
}): Promise<{
  total: number
  nextTimestamp: number
  list: ChatMessageItem[] | null
}> => {
  const query = new URLSearchParams({
    metaId,
    otherMetaId,
    startIndex: String(startIndex),
    size: String(size),
  }).toString()
  
  const data: {
    data: {
      total: number
      nextTimestamp: number
      list: ChatMessageItem[] | null
    }
  } = await ChatApi.get(`/group-chat/private-chat-list-by-index?${query}`, CHAT_API_HEADERS)
  
  return data.data
}

/**
 * Decrypt message content
 */
export function computeDecryptedMsg(session: ChatMessageItem, secretKeyStr: string): string {
  try {
    if (session.encryption == 'aes') {
      switch (session.chatType) {
        case 1:
        case MessageType.msg:
          return decrypt(session.content, secretKeyStr)
        default:
          return ''
      }
    } else {
      // Temporarily leave other branches empty
      return ''
    }
  } catch (error) {
    return ''
  }
}

/**
 * Encrypt message content
 */
export function encryptMessage(content: string, secretKeyStr: string): string {
  return encrypt(content, secretKeyStr)
}
