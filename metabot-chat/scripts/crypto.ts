import { enc, AES, mode, pad } from 'crypto-js'

const Utf8 = enc.Utf8
const iv = Utf8.parse('0000000000000000')

/**
 * Decrypt group chat message
 * @param message - Encrypted message (hex string)
 * @param secretKeyStr - Secret key string (16 characters)
 * @returns Decrypted message
 */
export function decrypt(message: string, secretKeyStr: string): string {
  const secretKey = Utf8.parse(secretKeyStr)

  try {
    const messageBuffer = Buffer.from(message, 'hex')
    const messageBase64 = messageBuffer.toString('base64')

    const messageBytes = AES.decrypt(messageBase64, secretKey, {
      iv,
      mode: mode.CBC,
      padding: pad.Pkcs7,
    })

    return messageBytes.toString(Utf8)
  } catch {
    return message
  }
}

/**
 * Encrypt group chat message
 * @param message - Plain text message
 * @param secretKeyStr - Secret key string (16 characters)
 * @returns Encrypted message (hex string)
 */
export function encrypt(message: string, secretKeyStr: string): string {
  const messageWordArray = Utf8.parse(message)
  const secretKey = Utf8.parse(secretKeyStr)

  const encrypted = AES.encrypt(messageWordArray, secretKey, {
    iv,
    mode: mode.CBC,
    padding: pad.Pkcs7,
  })
  const _encryptedBuf = Buffer.from(encrypted.toString(), 'base64')

  return _encryptedBuf.toString('hex')
}
