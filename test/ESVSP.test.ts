/* eslint-disable new-cap */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {BigNumber} from 'ethers'
import {ethers, network} from 'hardhat'
import {ESVSP, ESVSP721, ESVSP721__factory, ESVSP__factory, IERC20, IERC20__factory} from '../typechain'
import {impersonateAccount, VSP_ADDRESS, VSP_HOLDER, YEAR} from './helpers'

describe('ESVSP', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let vsp: IERC20
  let esVsp721: ESVSP721
  let esVsp: ESVSP

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    const esVspFactory = new ESVSP__factory(deployer)
    esVsp = await esVspFactory.deploy()
    await esVsp.deployed()

    const esVsp721Factory = new ESVSP721__factory(deployer)
    esVsp721 = await esVsp721Factory.deploy(esVsp.address, 'VSP Escrow NFT', 'esVSP-NFT')
    await esVsp721.deployed()

    await esVsp.initialize('VSP Escrow', 'esVSP', 18, esVsp721.address)

    vsp = IERC20__factory.connect(VSP_ADDRESS, alice)
    esVsp = esVsp.connect(alice)
    esVsp721 = esVsp721.connect(alice)

    const vspHolder = await impersonateAccount(VSP_HOLDER)
    vsp.connect(vspHolder).transfer(alice.address, parseEther('1000'))
    vsp.connect(vspHolder).transfer(bob.address, parseEther('1000'))
  })

  describe('lock', function () {
    beforeEach(async function () {
      await vsp.approve(esVsp.address, ethers.constants.MaxUint256)
    })

    it('should revert if amount is zero', async function () {
      // when
      const amount = 0
      const period = YEAR
      const tx = esVsp.lock(amount, period)

      // then
      await expect(tx).revertedWith('amount-is-zero')
    })

    it('should revert if period is < min', async function () {
      // given
      const min = await esVsp.MINIMUM_LOCK_PERIOD()

      // when
      const amount = parseEther('1')
      const period = min.sub(1)
      const tx = esVsp.lock(amount, period)

      // then
      await expect(tx).revertedWith('lock-period-lt-minimum')
    })

    it('should revert if period is > max', async function () {
      // given
      const max = await esVsp.MAXIMUM_LOCK_PERIOD()

      // when
      const amount = parseEther('1')
      const period = max.add(1)
      const tx = esVsp.lock(amount, period)

      // then
      await expect(tx).revertedWith('lock-period-gt-maximum')
    })

    it('should lock VSP', async function () {
      //
      // given
      //
      const maxBoost = await esVsp.MAXIMUM_BOOST()
      const maxPeriod = await esVsp.MAXIMUM_LOCK_PERIOD()
      const esVspBalanceBefore = await vsp.balanceOf(esVsp.address)

      //
      // when
      //
      const amount = parseEther('100')
      const period = YEAR
      const tx = esVsp.lock(amount, period)

      //
      // then
      //
      const expectedTokenId = 1
      const expectedBoostAmount = amount.mul(period).mul(maxBoost).div(maxPeriod)
      const now = (await ethers.provider.getBlock('latest')).timestamp
      const expectedUnlockTime = BigNumber.from(now).add(period)

      // event
      await expect(tx).emit(esVsp, 'VspLocked').withArgs(alice.address, amount, period, expectedTokenId)

      // data
      const {lockedAmount, boostedAmount, unlockTime} = await esVsp.stakeData(expectedTokenId)
      expect(lockedAmount).eq(amount)
      expect(boostedAmount).eq(expectedBoostAmount)
      expect(unlockTime).closeTo(expectedUnlockTime, 5)

      const locked = await esVsp.locked(alice.address)
      const totalLocked = await esVsp.totalLocked()
      expect(locked).eq(totalLocked).eq(amount)

      const boosted = await esVsp.boosted(alice.address)
      const totalBoosted = await esVsp.totalBoosted()
      expect(boosted).eq(totalBoosted).eq(expectedBoostAmount)

      // VSP balance
      const esVspBalanceAfter = await vsp.balanceOf(esVsp.address)
      expect(esVspBalanceAfter.sub(esVspBalanceBefore)).eq(lockedAmount)

      // nft
      expect(await esVsp721.ownerOf(expectedTokenId)).eq(alice.address)
      expect(await esVsp721.balanceOf(alice.address)).eq(1)

      // erc20
      expect(await esVsp.totalSupply()).eq(totalBoosted)
      expect(await esVsp.balanceOf(alice.address)).eq(boosted)
      expect(await esVsp.lockedBalanceOf(alice.address)).eq(locked)
    })
  })

  // TODO: Want we this function?
  // Note: Doesn't duplicate test cases from `lock()` because assumes the same implementation
  // describe('lockFor', function () {
  //   it('should lock on behalf of other user', async function () {})
  // })

  describe('withdraw', function () {
    beforeEach('should lock VSP', async function () {})

    it('should revert if caller is not the bond owner', async function () {})

    describe('without rewards', function () {
      describe('without boosted token', function () {
        it('should withdraw locked amount', async function () {})

        it('a whale should not dilute other users', async function () {})
      })

      describe('with boosted token', function () {
        it('should withdraw locked amount', async function () {})

        it('a whale should not dilute other users', async function () {})
      })
    })

    describe('with rewards', function () {
      describe('without boosted token', function () {
        it('should withdraw locked amount', async function () {})

        it('a whale should not dilute other users', async function () {})
      })

      describe('with boosted token', function () {
        it('should withdraw locked amount', async function () {})

        it('a whale should not dilute other users', async function () {})
      })
    })
  })

  describe('notifyRewardAmount', function () {
    it('should revert if not distributor', async function () {})

    it('should revert if amount is zero', async function () {})

    it('should revert if reward token is invalid', async function () {})

    it('should notify if now < period finish', async function () {})

    it('should notify if now >= period finish', async function () {})

    it('should notify when token is boosted', async function () {})

    it('should notify when token is not boosted', async function () {})
  })

  describe('addReward', function () {
    it('should revert if not governor', async function () {})

    it('should revert if reward token is VSP', async function () {})

    it('should revert if already added', async function () {})

    it('should add reward token', async function () {})
  })

  describe('updateReward', function () {
    it('should update if now < period finish', async function () {})

    it('should update if now >= period finish', async function () {})

    it('should update if user did not lock (???)', async function () {})
  })
})
