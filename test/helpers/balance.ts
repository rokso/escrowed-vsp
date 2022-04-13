import {ethers} from 'hardhat'
import {BigNumber} from 'ethers'
import Address from '../../helpers/address'

const {hexlify, solidityKeccak256, zeroPad, getAddress, hexStripZeros} = ethers.utils

// Slot number mapping for a token. Prepared using utility https://github.com/kendricktan/slot20
const slots = {
  [Address.DAI_ADDRESS]: 2,
  [Address.WETH_ADDRESS]: 3,
  [Address.USDC_ADDRESS]: 9,
  [Address.WBTC_ADDRESS]: 0,
  [Address.VSP_ADDRESS]: 0,
}

/**
 * Get slot number for a token
 *
 * @param {string} token  token address
 * @returns {number} slot number for provided token address
 */
const getSlot = (token: string) => slots[getAddress(token)]

/**
 * Update token balance for a given target address
 *
 * @param {string} token  token address
 * @param {string} targetAddress address at which token balance to be updated.
 * @param {BigNumber|string|number} balance balance amount to be set
 */
export const adjustBalance = async (token: string, targetAddress: string, balance: BigNumber): Promise<void> => {
  const slot = getSlot(token)
  if (slot === undefined) {
    throw new Error(`Missing slot configuration for token ${token}`)
  }

  // reason: https://github.com/nomiclabs/hardhat/issues/1585 comments
  // Create solidity has for index, convert it into hex string and remove all the leading zeros
  const index = hexStripZeros(hexlify(solidityKeccak256(['uint256', 'uint256'], [targetAddress, slot])))

  const value = hexlify(zeroPad(balance.toHexString(), 32))

  // Hack the balance by directly setting the EVM storage
  await ethers.provider.send('hardhat_setStorageAt', [token, index, value])
  await ethers.provider.send('evm_mine', [])
}
