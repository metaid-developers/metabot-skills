#!/usr/bin/env node
/**
 * 一次性解密私聊内容（脚本内写死 sharedSecret 与密文，运行后即删）
 * 用法: npx ts-node scripts/decrypt_private_once.ts
 */
import { ecdhDecrypt } from './crypto'

const sharedSecret = '18972dbd905a370bcb9d3a51e94b91b3e7f776361743070a65f46240c30f985a'
const cipherText =
  'U2FsdGVkX1+lpghyHg0zZGPlbq7ii5uCpNWfKWvmMnb0HxHGl3k6IQTKz9FkkUaefu1DH/ZLXUhs34yqaWH3yQ=='

const plain = ecdhDecrypt(cipherText, sharedSecret)
console.log('解密结果:', plain)
