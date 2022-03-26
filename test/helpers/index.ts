import {BigNumber} from '@ethersproject/bignumber'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {parseEther} from 'ethers/lib/utils'
import {ethers, network} from 'hardhat'

export const VSP_ADDRESS = '0x1b40183EFB4Dd766f11bDa7A7c3AD8982e998421'
export const VSP_HOLDER = '0xba4cfe5741b357fa371b506e5db0774abfecf8fc'

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

export const impersonateAccount = async (address: string): Promise<SignerWithAddress> => {
  await network.provider.request({method: 'hardhat_impersonateAccount', params: [address]})
  await network.provider.request({
    method: 'hardhat_setBalance',
    params: [address, ethers.utils.hexStripZeros(parseEther('1000000').toHexString())],
  })
  return await ethers.getSigner(address)
}
