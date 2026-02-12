import * as bip39 from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { Chain, MvcWallet, BtcWallet, DogeWallet, AddressType, CoinType, ScriptType, Net } from '@metalet/utxo-wallet-service'
import { networks } from 'bitcoinjs-lib'
import ECPairFactory from 'ecpair'
import * as ecc from '@bitcoinerlab/secp256k1'
import CryptoJS from 'crypto-js'

// Re-export Chain for use in other modules
export { Chain }

// Core chains supported by @metalet/utxo-wallet-service
export type CoreChain = 'btc' | 'mvc'

// All supported chains including custom implementations
export type SupportedChain = CoreChain | 'doge'

export const METALET_HOST = 'https://www.metalet.space'

export async function getV3AddressType(chain: SupportedChain): Promise<AddressType> {
  const chainStr = String(chain)
  if (chainStr === 'mvc' || chainStr === Chain.MVC) {
    return AddressType.LegacyMvc
  } else if (chainStr === 'doge' || chainStr === Chain.DOGE) {
    return AddressType.DogeSameAsMvc
  }
  return AddressType.SameAsMvc
}

export async function getCurrentWallet<T extends SupportedChain>(
  chain: T,
  options?: {
    mnemonic?: string
  }
): Promise<T extends Chain.BTC ? BtcWallet : T extends Chain.DOGE ? DogeWallet : MvcWallet> {
  const network = getNet() as Net
  let mnemonic = options?.mnemonic
  if (!mnemonic) {
    throw new Error(`mnemonic is null`)
  }
  const addressIndex = 0
  const addressType = await getV3AddressType(chain)
  const chainStr = String(chain)
  if (chainStr === 'btc' || chainStr === Chain.BTC) {
    const coinType = addressType === AddressType.SameAsMvc ? CoinType.MVC : CoinType.BTC
    return new BtcWallet({ coinType, addressType, addressIndex, network, mnemonic }) as any
  } else if (chainStr === 'mvc' || chainStr === Chain.MVC) {
    const coinType = CoinType.MVC 
    return new MvcWallet({ coinType, addressType, addressIndex, network, mnemonic }) as any
  } else if (chainStr === 'doge' || chainStr === Chain.DOGE) {
    const coinType = addressType === AddressType.DogeSameAsMvc ? CoinType.MVC : CoinType.BTC
    return new DogeWallet({ coinType, addressType, addressIndex, network, mnemonic }) as any
  } else {
    throw new Error(`Chain ${chain} is not supported`)
  }
}

export interface GetDogeWalletOptions {
  mnemonic?: string
  password?: string
  addressIndex?: number
  addressType?: AddressType
  coinType?: number
}

// Get DOGE wallet
export async function getDogeWallet(options?: GetDogeWalletOptions): Promise<DogeWallet> {
  const network = getNet() as Net
  let mnemonic = options?.mnemonic
  if (!mnemonic) {
    throw new Error(`mnemonic is null`)
  }
  
  const addressIndex = options?.addressIndex ?? 0
  const addressType = options?.addressType ?? (await getV3AddressType(Chain.DOGE))
  
  // Use custom MVC coinType if addressType is DogeSameAsMvc
  // This ensures DOGE Default address follows user's custom MVC path
  const coinType = options?.coinType ?? CoinType.MVC 

  return new DogeWallet({
    mnemonic,
    network,
    addressIndex,
    addressType,
    coinType,
  })
}

// Get new mnemonic
export async function generateMnemonic(): Promise<string> {
  const mnemonic = bip39.generateMnemonic(wordlist)
  return mnemonic
}

// Get address for a specific chain
export async function getAddress(chain: SupportedChain = 'mvc', mnemonic: string): Promise<string> {
  if (!mnemonic) {
    throw new Error(`mnemonic is null`)
  }

  if (chain === 'doge') {
    const wallet = await getDogeWallet({ mnemonic: mnemonic })
    return wallet.getAddress()
  }
  const wallet = await getCurrentWallet(chain as CoreChain, { mnemonic })
  return wallet.getAddress()
}

// Get all addresses (MVC, BTC, DOGE)
export async function getAllAddress(mnemonic: string): Promise<{
  mvcAddress: string
  btcAddress: string
  dogeAddress: string
}> {
  if (!mnemonic) {
    throw new Error(`mnemonic is null`)
  }

  const dogeWallet = await getDogeWallet({ mnemonic: mnemonic })
  const wallet = await getCurrentWallet(Chain.MVC, { mnemonic })
  return {
    mvcAddress: wallet.getAddress(),
    btcAddress: wallet.getAddress(),
    dogeAddress: dogeWallet.getAddress()
  }
}

// Get public key for MVC
export async function getPublicKey(chain: CoreChain = 'mvc', mnemonic: string): Promise<string> {
  if (!mnemonic) {
    throw new Error(`mnemonic is null`)
  }
  
  // Note: This requires mvc library which should be imported
  // For now, using a placeholder - actual implementation depends on mvc library
  const wallet = await getCurrentWallet(chain, { mnemonic })
  return wallet.getPublicKey().toString('hex')
}

export function getNet(): Net {
  return 'livenet' as Net
}

export function getPath(): string {
  return `m/44'/10001'/0'/0/0`
}

export function getMvcRootPath(): string {
  return `m/44'/10001'/0'/0`
}

// Get MetaID from address
export function getMetaId(address: string): string {
  return CryptoJS.SHA256(address).toString()
}

// Get credential for signing
export async function getCredential({
  mnemonic = '',
  chain = 'btc' as CoreChain,
  message = 'metalet.space',
  encoding = 'base64' as BufferEncoding,
}: {
  mnemonic: string
  chain?: CoreChain
  message?: string
  encoding?: BufferEncoding
}): Promise<{ address: string; publicKey: string; signature: string }> {
  if (!mnemonic) {
    throw new Error(`mnemonic is null`)
  }
  
  let signature = ''
  const wallet = await getCurrentWallet(chain, { mnemonic })
  signature = wallet.signMessage(message, encoding)

  return {
    signature,
    address: wallet.getAddress(),
    publicKey: wallet.getPublicKey().toString('hex'),
  }
}

// Get UTXOs for a chain
export async function getUtxos(chain: SupportedChain = 'mvc', mnemonic: string) {
  if (!mnemonic) {
    throw new Error(`mnemonic is null`)
  }
  const address = await getAddress(chain, mnemonic)
  if (chain === 'mvc') {
    const { fetchMVCUtxos } = await import('./api')
    return await fetchMVCUtxos(address)
  } else if (chain === 'doge') {
    const { fetchDogeUtxos } = await import('./api')
    return await fetchDogeUtxos(address)
  } else {
    throw new Error(`Chain ${chain} not supported for getUtxos`)
  }
}
