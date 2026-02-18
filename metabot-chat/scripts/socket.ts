#!/usr/bin/env node

/**
 * Socket.IO 客户端，用于连接 idchat.io 消息推送
 * 支持群聊与私聊消息通知
 */

import { io, Socket } from 'socket.io-client'

export interface SocketConfig {
  url: string
  path: string
  metaid: string
  type: 'app' | 'pc'
  heartbeatInterval?: number
  heartbeatTimeout?: number
}

export interface MessageData {
  message: string
  timestamp: number
  [key: string]: any
}

export type MessageHandler = (data: MessageData) => void

export class SocketIOClient {
  private socket: Socket | null = null
  private config: SocketConfig
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null
  private isHeartbeatRunning = false
  private onMessage: MessageHandler

  constructor(config: SocketConfig, onMessage: MessageHandler) {
    this.config = {
      heartbeatInterval: 30000,
      heartbeatTimeout: 10000,
      ...config,
    }
    this.onMessage = onMessage
  }

  connect(): void {
    try {
      this.socket = io(this.config.url, {
        path: this.config.path,
        query: {
          metaid: this.config.metaid,
          type: this.config.type,
        },
      })

      this.socket.on('connect', () => {
        const socketUrl = `${this.config.url}${this.config.path}`
        const socketId = (this.socket as any)?.id ?? ''
        console.log('✅ [Socket] 连接成功')
        console.log('   [Socket] 连接 URL:', socketUrl)
        console.log('   [Socket] socket.id:', socketId)
        this.startHeartbeat()
      })

      this.socket.on('disconnect', (reason: string) => {
        console.log('❌ 与服务器断开连接:', reason)
        this.stopHeartbeat()
      })

      this.socket.on('connect_error', (error: Error) => {
        console.error('🔴 连接错误:', error.message)
        this.stopHeartbeat()
      })

      this.socket.on('message', (data: MessageData) => {
        this.onMessage(data)
      })

      // 调试：打印所有收到的事件名，便于确认私聊/群聊推送是否到达及事件名
      this.socket.onAny((eventName: string, ...args: any[]) => {
        if (!['connect', 'disconnect', 'connect_error', 'pong', 'ping', 'heartbeat_ack', 'reconnect', 'reconnect_attempt', 'reconnect_error'].includes(eventName)) {
          const hasPayload = args.length > 0 && args[0] != null
          const payloadPreview = hasPayload && typeof args[0] === 'object' ? Object.keys(args[0]).slice(0, 8).join(',') : (hasPayload ? String(args[0]).slice(0, 60) : '')
          console.log('[Socket 收到事件]', eventName, hasPayload ? 'payload.keys: ' + payloadPreview : '')
        }
      })

      // 注意：不单独监听 WS_SERVER_NOTIFY_GROUP_CHAT / WS_SERVER_NOTIFY_PRIVATE_CHAT
      // 服务端可能对同一条消息同时推送到 message 和具体事件名，会导致重复触发 onMessage
      // 所有聊天消息已通过 message 事件统一接收，handleReceivedMessage 根据 payload.M 解析路由

      this.socket.on('heartbeat_ack', () => {
        if (this.heartbeatTimeoutId) {
          clearTimeout(this.heartbeatTimeoutId)
          this.heartbeatTimeoutId = null
        }
      })

      this.socket.on('reconnect', (attemptNumber: number) => {
        console.log('🔄 重新连接成功，尝试次数:', attemptNumber)
        this.startHeartbeat()
      })

      this.socket.on('reconnect_attempt', (attemptNumber: number) => {
        console.log('🔄 尝试重新连接，次数:', attemptNumber)
      })

      this.socket.on('reconnect_error', (error: Error) => {
        console.error('🔴 重新连接错误:', error.message)
      })

      const socketUrl = `${this.config.url}${this.config.path}`
      console.log('[Socket] 正在连接...', socketUrl)
    } catch (error) {
      console.error('连接失败:', error)
    }
  }

  private startHeartbeat(): void {
    if (this.isHeartbeatRunning) return
    this.isHeartbeatRunning = true
    this.stopHeartbeat()
    this.heartbeatIntervalId = setInterval(() => this.sendHeartbeat(), this.config.heartbeatInterval!)
    this.sendHeartbeat()
  }

  private stopHeartbeat(): void {
    this.isHeartbeatRunning = false
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
      this.heartbeatIntervalId = null
    }
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId)
      this.heartbeatTimeoutId = null
    }
  }

  private sendHeartbeat(): void {
    if (!this.socket?.connected) return
    try {
      this.socket.emit('ping')
    } catch (error) {
      console.error('发送心跳包失败:', error)
    }
  }

  disconnect(): void {
    this.stopHeartbeat()
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      console.log('🔌 已断开连接')
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false
  }
}
