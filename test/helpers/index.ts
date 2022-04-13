import {BigNumber} from '@ethersproject/bignumber'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {parseEther} from 'ethers/lib/utils'
import {ethers, network} from 'hardhat'

export const VSP_HOLDER = '0xba4cfe5741b357fa371b506e5db0774abfecf8fc'
export const WETH_HOLDER = '0x2f0b23f53734252bda2277357e97e1517d6b042a'
export const USDC_HOLDER = '0x0a59649758aa4d66e25f08dd01271e891fe52199'

export const MINUTE = BigNumber.from(60)
export const HOUR = MINUTE.mul(60)
export const DAY = HOUR.mul(24)
export const WEEK = DAY.mul(7)
export const MONTH = DAY.mul(30)
export const YEAR = DAY.mul(365)

export const increaseTime = async (timeToIncrease: BigNumber): Promise<void> => {
  await ethers.provider.send('evm_increaseTime', [timeToIncrease.toNumber()])
  await ethers.provider.send('evm_mine', [])
}

export const setEtherBalance = async (address: string, value: BigNumber): Promise<void> => {
  await network.provider.request({
    method: 'hardhat_setBalance',
    params: [address, ethers.utils.hexStripZeros(value.toHexString())],
  })
}

export const impersonateAccount = async (address: string): Promise<SignerWithAddress> => {
  await network.provider.request({method: 'hardhat_impersonateAccount', params: [address]})
  await setEtherBalance(address, parseEther('1000000'))
  return await ethers.getSigner(address)
}

export const timestampFromLatestBlock = async (): Promise<number> =>
  (await ethers.provider.getBlock('latest')).timestamp
