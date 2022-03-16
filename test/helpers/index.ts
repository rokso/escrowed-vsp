import {BigNumber} from '@ethersproject/bignumber'
import {ethers, network} from 'hardhat'

export const HOUR = BigNumber.from(60 * 60)
export const DEFAULT_TWAP_PERIOD = HOUR.mul('2')
export const BLOCKS_PER_YEAR = 2102400

export const increaseTime = async (timeToIncrease: BigNumber): Promise<void> => {
  await ethers.provider.send('evm_increaseTime', [timeToIncrease.toNumber()])
  await ethers.provider.send('evm_mine', [])
}

export const enableForking = async (): Promise<void> => {
  await network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.NODE_URL,
          // using 13359500 as default block if not provided
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          blockNumber: parseInt(process.env.BLOCK_NUMBER!) || 13359500 
        },
      },
    ],
  })
}

export const disableForking = async (): Promise<void> => {
  await network.provider.request({
    method: 'hardhat_reset',
    params: [],
  })
}

export const setEtherBalance = async (address: string, value: BigNumber): Promise<void> => {
  await network.provider.request({
    method: 'hardhat_setBalance',
    params: [address, ethers.utils.hexStripZeros(value.toHexString())],
  })
}
