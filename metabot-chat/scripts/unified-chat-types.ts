/**
 * 统一聊天消息类型（群聊 + 私聊），与 WebSocket 推送结构对齐
 */

export interface ChatUserInfo {
  address: string
  avatar?: string
  avatarImage?: string
  chatPublicKey?: string
  chatPublicKeyId?: string
  metaid?: string
  globalMetaId?: string
  name?: string
}

export interface UnifiedChatMessage {
  txId: string
  pinId?: string
  metaId: string
  globalMetaId?: string
  address: string
  userInfo: ChatUserInfo
  nickName?: string
  protocol: string
  content: string
  contentType: string
  encryption: string
  version?: string
  chatType: number
  data?: any
  replyPin?: string
  replyInfo?: any
  replyMetaId?: string
  timestamp: number
  params?: string
  chain: string
  blockHeight?: number
  index: number
  mention?: string[]
  groupId?: string
  channelId?: string
  metanetId?: string
  fromGlobalMetaId?: string
  fromUserInfo?: ChatUserInfo
  toGlobalMetaId?: string
  toUserInfo?: ChatUserInfo
}

export function isPrivateChatMessage(
  message: UnifiedChatMessage
): message is UnifiedChatMessage & {
  fromGlobalMetaId: string
  fromUserInfo: ChatUserInfo
  toGlobalMetaId: string
  toUserInfo: ChatUserInfo
} {
  return !!(
    message.fromGlobalMetaId &&
    message.fromUserInfo &&
    message.toGlobalMetaId &&
    message.toUserInfo
  )
}

export function isGroupChatMessage(
  message: UnifiedChatMessage
): message is UnifiedChatMessage & { groupId: string; metanetId: string } {
  return !!(message.groupId && message.metanetId)
}
