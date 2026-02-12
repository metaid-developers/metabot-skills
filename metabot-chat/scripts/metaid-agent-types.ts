/**
 * Type definitions for metabot-basic skill
 * These types are used for cross-skill calls to metabot-basic
 */

export type Operation = 'init' | 'create' | 'modify' | 'revoke'

export type MetaidData = {
  operation: Operation
  path?: string
  body?: string | Buffer
  contentType?: string
  encryption?: '0' | '1' | '2'
  version?: string
  encoding?: BufferEncoding
  flag?: 'metaid'
  revealAddr?: string
}

export type Output = {
  address: string
  satoshis: string
}

export type PinOptions = {
  outputs?: Output[]
  service?: Output
  refs?: Record<string, number>
}

export type PinDetail = {
  metaidData: MetaidData
  options?: PinOptions
}

export type CreatePinParams = {
  chain: 'btc' | 'mvc' | 'doge'
  dataList: PinDetail[]
  feeRate?: number
  noBroadcast?: boolean
}

export type CreatePinResult = {
  commitTxId?: string
  revealTxIds?: string[]
  commitTxHex?: string
  revealTxsHex?: string[]
  txids?: string[]
  txHexList?: string[]
  commitCost?: number
  revealCost?: number
  totalCost: number
}
