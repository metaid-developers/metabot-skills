#!/usr/bin/env node

/**
 * MetaID-Consolidating-Skill: Consolidate scattered UTXOs to main address
 * Usage: npx ts-node scripts/consolidate.ts <agentName> [mainAddress]
 * 
 * State Machine:
 * - idle -> awaiting_consolidation -> consolidating_pending -> (complete/timeout)
 */

import * as path from 'path'
import { TxComposer, mvc } from 'meta-contract'
import { fetchMVCUtxos, MvcUtxo, getMvcBalance, broadcastTx } from './api'
import { Chain, getCurrentWallet, getNet, getMvcRootPath } from './wallet'
import { findAccountByKeyword, readAccountFile } from './utils'
// Import DERIVE_MAX_DEPTH from metaid.ts
const DERIVE_MAX_DEPTH = 1000 // Same as in metaid.ts

// TODO: extract to config
const DUST_THRESHOLD = 546 // satoshis - UTXOs below this are excluded
const BALANCE_TOLERANCE = 0.1 // ±10% - abort if balance deviates more than this
const CONFIRMATION_REQUIRED = 1 // blocks - consolidation complete after 1 confirmation
const TIMEOUT_MINUTES = 15 // minutes - timeout for confirmation

type ConsolidationState = 
  | 'idle' 
  | 'awaiting_consolidation' 
  | 'consolidating_pending' 
  | 'consolidating_timeout' 
  | 'completed' 
  | 'failed'

interface ConsolidationContext {
  state: ConsolidationState
  mainAddress: string
  scannedUtxos: MvcUtxo[]
  scannedBalance: number
  txId?: string
  startTime?: number
  timeoutTime?: number
}

// Global state (in production, should be persisted to file/database)
const consolidationState: Map<string, ConsolidationContext> = new Map()

/**
 * Check if consolidation is in progress for an address
 */
export function isConsolidating(address: string): boolean {
  const context = consolidationState.get(address)
  return context !== undefined && 
    (context.state === 'awaiting_consolidation' || 
     context.state === 'consolidating_pending')
}

/**
 * Get consolidation state for an address
 */
export function getConsolidationState(address: string): ConsolidationState | null {
  const context = consolidationState.get(address)
  return context?.state || null
}

/**
 * Scan UTXOs and filter out dust
 */
async function scanUtxos(address: string): Promise<{ utxos: MvcUtxo[], totalBalance: number }> {
  console.log(`📊 正在扫描地址 ${address} 的 UTXO...`)
  
  const allUtxos = await fetchMVCUtxos(address, true) // include unconfirmed
  
  // Filter out dust UTXOs (< DUST_THRESHOLD)
  const validUtxos = allUtxos.filter(utxo => utxo.value >= DUST_THRESHOLD)
  
  const totalBalance = validUtxos.reduce((sum, utxo) => sum + utxo.value, 0)
  
  console.log(`✅ 扫描完成: 找到 ${allUtxos.length} 个 UTXO，其中 ${validUtxos.length} 个有效（>= ${DUST_THRESHOLD} satoshis）`)
  console.log(`   总余额: ${totalBalance} satoshis (${(totalBalance / 100000000).toFixed(8)} SPACE)`)
  
  return { utxos: validUtxos, totalBalance }
}

/**
 * Validate balance tolerance
 */
function validateBalanceTolerance(scannedBalance: number, currentBalance: number): boolean {
  const deviation = Math.abs(currentBalance - scannedBalance) / scannedBalance
  if (deviation > BALANCE_TOLERANCE) {
    console.error(`❌ 余额偏差过大: 扫描时 ${scannedBalance}，当前 ${currentBalance}，偏差 ${(deviation * 100).toFixed(2)}%`)
    return false
  }
  return true
}

/**
 * Build consolidation transaction using TxComposer
 */
async function buildConsolidationTransaction(
  mnemonic: string,
  fromAddress: string,
  toAddress: string,
  utxos: MvcUtxo[],
  address?: string,
  path?: string
): Promise<{ txids: string[], totalCost: number }> {
  console.log(`🔨 正在构建归集交易...`)
  console.log(`   从: ${fromAddress}`)
  console.log(`   到: ${toAddress}`)
  console.log(`   UTXO 数量: ${utxos.length}`)
  
  const network = mvc.Networks.livenet
  const wallet = await getCurrentWallet(Chain.MVC, { mnemonic })
  const feeRate = 1 // satoshis per byte
  
  // Calculate total amount
  const totalAmount = utxos.reduce((sum, utxo) => sum + utxo.value, 0)
  
  // Build transaction using TxComposer
  const txComposer = new TxComposer()
  
  // Add all UTXOs as inputs
  const fromAddressObj = new mvc.Address(fromAddress, network as any)
  for (const utxo of utxos) {
    txComposer.appendP2PKHInput({
      address: fromAddressObj,
      txId: utxo.txid,
      outputIndex: utxo.outIndex,
      satoshis: utxo.value,
    })
  }
  
  // Add output to main address (will be adjusted for fees)
  const toAddressObj = new mvc.Address(toAddress, network as any)
  txComposer.appendP2PKHOutput({
    address: toAddressObj,
    satoshis: totalAmount, // Will be adjusted by change output
  })
  
  // Add change output (back to fromAddress)
  const changeIndex = txComposer.appendChangeOutput(fromAddressObj, feeRate)
  
  // Sign transaction - use same logic as payTransactions
  const mneObj = mvc.Mnemonic.fromString(mnemonic)
  const hdpk = mneObj.toHDPrivateKey('', network as any)
  const rootPath = getMvcRootPath()
  const basePrivateKey = hdpk.deriveChild(rootPath)
  const rootPrivateKey = mvc.PrivateKey.fromWIF(wallet.getPrivateKey())
  
  // Sign all inputs
  // First, try to find matching private keys for each input
  for (let i = 0; i < utxos.length; i++) {
    const input = txComposer.getInput(i)
    const inputAddress = mvc.Address.fromString(
      input.output!.script.toAddress().toString(),
      network as any
    ).toString()
    
    let deriver = 0
    let toUsePrivateKey: mvc.PrivateKey | undefined = undefined
    
    // Try to find matching private key
    while (deriver < DERIVE_MAX_DEPTH) {
      const childPk = basePrivateKey.deriveChild(0).deriveChild(deriver)
      const childAddress = childPk.publicKey.toAddress(network as any).toString()
      
      if (childAddress === inputAddress) {
        toUsePrivateKey = childPk.privateKey
        break
      }
      deriver++
    }
    
    // If not found, use root private key
    if (!toUsePrivateKey) {
      toUsePrivateKey = rootPrivateKey
    }
    
    txComposer.unlockP2PKHInput(toUsePrivateKey, i)
  }
  
  // Get transaction hex
  const txHex = txComposer.getRawHex()
  const txId = txComposer.getTxId()
  
  // Broadcast transaction
  console.log(`📤 正在广播交易...`)
  const broadcastedTxId = await broadcastTx(txHex, Chain.MVC)
  
  // Calculate total cost (fees)
  const tx = txComposer.tx
  const inputTotal = tx.inputs.reduce((sum, input) => sum + (input.output?.satoshis || 0), 0)
  const outputTotal = tx.outputs.reduce((sum, output) => sum + output.satoshis, 0)
  const totalCost = inputTotal - outputTotal
  
  return {
    txids: [broadcastedTxId],
    totalCost,
  }
}

/**
 * Check transaction confirmation status
 */
async function checkConfirmation(txId: string, requiredConfirmations: number = CONFIRMATION_REQUIRED): Promise<{ confirmed: boolean, confirmations: number }> {
  // TODO: Implement transaction status check
  // For now, return false (would need to query blockchain)
  // In production, use API to check transaction status
  return { confirmed: false, confirmations: 0 }
}

/**
 * Main consolidation function
 */
export async function consolidateUtxos(
  mnemonic: string,
  mainAddress: string,
  fromAddress?: string,
  path?: string
): Promise<{ success: boolean, txId?: string, message: string }> {
  try {
    // Get wallet to determine fromAddress if not provided
    const wallet = await getCurrentWallet(Chain.MVC, { mnemonic })
    const agentAddress = fromAddress || wallet.getAddress()
    
    // Check if already consolidating
    if (isConsolidating(agentAddress)) {
      return {
        success: false,
        message: '当前正在执行归集操作，请在归集完成后再发起新交易。'
      }
    }
    
    // Initialize context
    const context: ConsolidationContext = {
      state: 'awaiting_consolidation',
      mainAddress,
      scannedUtxos: [],
      scannedBalance: 0,
      startTime: Date.now(),
    }
    consolidationState.set(agentAddress, context)
    
    try {
      // Step 1: Scan UTXOs
      console.log('\n📊 步骤 1: 扫描 UTXO...')
      const { utxos, totalBalance } = await scanUtxos(agentAddress)
      
      if (utxos.length === 0) {
        consolidationState.delete(agentAddress)
        return {
          success: false,
          message: '没有可归集的 UTXO（所有 UTXO 都是粉尘或余额为 0）'
        }
      }
      
      context.scannedUtxos = utxos
      context.scannedBalance = totalBalance
      
      // Step 2: Validate balance tolerance
      console.log('\n🔍 步骤 2: 验证余额偏差...')
      const currentBalance = await getMvcBalance(agentAddress)
      if (!validateBalanceTolerance(totalBalance, currentBalance)) {
        consolidationState.delete(agentAddress)
        return {
          success: false,
          message: `余额偏差过大（超过 ${BALANCE_TOLERANCE * 100}%），为保护资产安全，已中断交易`
        }
      }
      
      // Step 3: Build and broadcast transaction
      console.log('\n🔨 步骤 3: 构建并广播交易...')
      context.state = 'awaiting_consolidation'
      
      const txResult = await buildConsolidationTransaction(
        mnemonic,
        agentAddress,
        mainAddress,
        utxos,
        agentAddress,
        path
      )
      
      if (!txResult.txids || txResult.txids.length === 0) {
        consolidationState.delete(agentAddress)
        return {
          success: false,
          message: '归集交易广播失败，请稍后重试。'
        }
      }
      
      const txId = txResult.txids[0]
      context.txId = txId
      context.state = 'consolidating_pending'
      context.timeoutTime = Date.now() + (TIMEOUT_MINUTES * 60 * 1000)
      
      console.log(`✅ 交易已广播: ${txId}`)
      console.log(`⏳ 等待 ${CONFIRMATION_REQUIRED} 个区块确认（超时时间: ${TIMEOUT_MINUTES} 分钟）...`)
      
      // Step 4: Wait for confirmation (simplified - in production would poll)
      // For MVP, we'll mark as completed after broadcast
      // In production, implement polling logic here
      
      // Simulate waiting (in production, poll blockchain)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // For MVP, assume transaction will be confirmed
      // In production, implement proper confirmation checking
      context.state = 'completed'
      consolidationState.delete(agentAddress)
      
      return {
        success: true,
        txId,
        message: `归集交易已成功广播！交易ID: ${txId}\n请等待 ${CONFIRMATION_REQUIRED} 个区块确认后归集完成。`
      }
      
    } catch (error: any) {
      context.state = 'failed'
      consolidationState.delete(agentAddress)
      throw error
    }
    
  } catch (error: any) {
    const msg = error?.message || String(error)
    console.error(`❌ 归集失败: ${msg}`)
    return {
      success: false,
      message: `归集失败: ${msg}`
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length < 1) {
    console.error('Usage: npx ts-node scripts/consolidate.ts <agentName> [mainAddress]')
    process.exit(1)
  }
  
  const agentName = args[0]
  const mainAddress = args[1] // Optional, defaults to agent's primary address
  
  console.log(`🚀 开始归集操作...`)
  console.log(`   Agent: ${agentName}`)
  console.log(`   主地址: ${mainAddress || '(使用 Agent 主地址)'}\n`)
  
  // Find account
  const accountData = readAccountFile()
  const account = findAccountByKeyword(agentName, accountData)
  if (!account) {
    console.error(`❌ 未找到账户: ${agentName}`)
    process.exit(1)
  }
  
  // Use mainAddress or agent's address
  const targetAddress = mainAddress || account.mvcAddress
  
  // Perform consolidation
  const result = await consolidateUtxos(
    account.mnemonic,
    targetAddress,
    account.mvcAddress,
    account.path
  )
  
  if (result.success) {
    console.log(`\n✅ ${result.message}`)
    if (result.txId) {
      console.log(`\n🔗 查看交易: https://explorer.mvcapi.com/tx/${result.txId}`)
    }
  } else {
    console.error(`\n❌ ${result.message}`)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}
