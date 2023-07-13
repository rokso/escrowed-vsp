/* eslint-disable new-cap */
/* eslint-disable camelcase */

import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {parseEther} from '@ethersproject/units'
import {expect} from 'chai'
import {BigNumber} from 'ethers'
import {ethers} from 'hardhat'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {
  impersonateAccount,
  increaseTime,
  timestampFromLatestBlock,
  VSP_HOLDER,
  VSP_DISTRIBUTOR,
  DAY,
  WEEK,
  MONTH,
  YEAR,
} from './helpers'

import Address from '../helpers/address'

import {
  ESVSP,
  ESVSP__factory,
  ESVSP721,
  ESVSP721__factory,
  Rewards,
  Rewards__factory,
  IERC20,
  IERC20__factory,
} from '../typechain'

import {address as ESVSP_ADDRESS} from '../deployments/mainnet/ESVSP.json'
import {address as ESVSP721_ADDRESS} from '../deployments/mainnet/ESVSP721.json'
import {address as REWARDS_ADDRESS} from '../deployments/mainnet/Rewards.json'

const {MaxUint256} = ethers.constants

describe.skip('E2E tests', function () {
  let snapshotId: string
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let carl: SignerWithAddress
  let distributor: SignerWithAddress
  let esVsp: ESVSP
  let esVsp721: ESVSP721
  let rewards: Rewards
  let vsp: IERC20
  let rewardToken: string

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[alice, bob, carl, distributor] = await ethers.getSigners()
    esVsp = ESVSP__factory.connect(ESVSP_ADDRESS, alice)
    esVsp721 = ESVSP721__factory.connect(ESVSP721_ADDRESS, alice)
    rewards = Rewards__factory.connect(REWARDS_ADDRESS, alice)
    vsp = IERC20__factory.connect(Address.VSP_ADDRESS, alice)
    rewardToken = await rewards.rewardTokens(0) // VSP rewards
  }

  beforeEach(async function () {
    await loadFixture(fixture)
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    distributor = await impersonateAccount(VSP_DISTRIBUTOR)
    const vspHolder = await impersonateAccount(VSP_HOLDER)
    await vsp.connect(vspHolder).transfer(alice.address, parseEther('1000000'))
    await vsp.connect(vspHolder).transfer(bob.address, parseEther('1000000'))
    await vsp.connect(vspHolder).transfer(carl.address, parseEther('1000000'))
    await vsp.connect(vspHolder).transfer(distributor.address, parseEther('1000000'))

    await vsp.approve(esVsp.address, MaxUint256)
    await vsp.connect(bob).approve(esVsp.address, MaxUint256)
    await vsp.connect(carl).approve(esVsp.address, MaxUint256)
    await vsp.connect(distributor).approve(rewards.address, MaxUint256)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('deployment', function () {
    it('should have correct deployed addresses', async function () {
      expect(REWARDS_ADDRESS).eq(await esVsp.rewards())
      expect(ESVSP_ADDRESS).eq(await esVsp721.esVSP())
      expect(ESVSP_ADDRESS).eq(await rewards.esVSP())
      expect(ESVSP721_ADDRESS).eq(await esVsp.esVSP721())
      expect(Address.VSP_ADDRESS).eq(await rewards.rewardTokens(0))
      expect(Address.TREASURY_ADDRESS).eq(await esVsp.treasury())
    })
  })

  describe('lock', function () {
    let maxBoost: BigNumber
    let maxPeriod: BigNumber
    let esVspBalanceBefore: BigNumber
    let totalLockedBefore: BigNumber
    let totalBoostedBefore: BigNumber

    beforeEach(async function () {
      maxBoost = await esVsp.MAXIMUM_BOOST()
      maxPeriod = await esVsp.MAXIMUM_LOCK_PERIOD()
      esVspBalanceBefore = await vsp.balanceOf(esVsp.address)
      totalLockedBefore = await esVsp.totalLocked()
      totalBoostedBefore = await esVsp.totalBoosted()
    })

    it('should lock once by a user', async function () {
      // when
      const amount = parseEther('100')
      const period = YEAR
      const tx = esVsp.lock(amount, period)

      // then
      const expectedTokenId = await esVsp721.nextTokenId()
      const expectedBoostAmount = amount.mul(period).mul(maxBoost).div(maxPeriod)
      const expectedUnlockTime = BigNumber.from(await timestampFromLatestBlock()).add(period)

      // event
      await expect(tx).emit(esVsp, 'VspLocked').withArgs(expectedTokenId, alice.address, amount, period)

      // data
      const {lockedAmount, boostedAmount, unlockTime} = await esVsp.positions(expectedTokenId)
      expect(lockedAmount).eq(amount)
      expect(boostedAmount).eq(expectedBoostAmount)
      expect(unlockTime).closeTo(expectedUnlockTime, 5)

      const locked = await esVsp.locked(alice.address)
      const totalLocked = await esVsp.totalLocked()
      expect(locked).eq(totalLocked.sub(totalLockedBefore)).eq(amount)

      const boosted = await esVsp.boosted(alice.address)
      const totalBoosted = await esVsp.totalBoosted()
      expect(boosted).eq(totalBoosted.sub(totalBoostedBefore)).eq(expectedBoostAmount)

      // VSP balance
      const esVspBalanceAfter = await vsp.balanceOf(esVsp.address)
      expect(esVspBalanceAfter.sub(esVspBalanceBefore)).eq(lockedAmount)

      // nft
      expect(await esVsp721.ownerOf(expectedTokenId)).eq(alice.address)
      expect(await esVsp721.balanceOf(alice.address)).eq(1)

      // erc20
      expect(await esVsp.totalSupply()).eq(totalBoosted) // TODO This to be changed after contract deployment.
      expect(await esVsp.balanceOf(alice.address)).eq(boosted) // TODO This to be changed after contract deployment.
      expect(await esVsp.locked(alice.address)).eq(locked)
      expect(await esVsp.boosted(alice.address)).eq(boosted)
    })

    it('should lock multiple times by one user with different lock-in period', async function () {
      // when
      const amount1 = parseEther('100')
      const period1 = YEAR
      const tx1 = esVsp.lock(amount1, period1)

      // then
      const expectedTokenId1 = await esVsp721.nextTokenId()
      const expectedBoostAmount1 = amount1.mul(period1).mul(maxBoost).div(maxPeriod)

      // event
      await expect(tx1).emit(esVsp, 'VspLocked').withArgs(expectedTokenId1, alice.address, amount1, period1)

      // when
      const amount2 = parseEther('50')
      const period2 = MONTH
      const tx2 = esVsp.lock(amount2, period2)

      // then
      const expectedTokenId2 = await esVsp721.nextTokenId()
      const expectedBoostAmount2 = amount2.mul(period2).mul(maxBoost).div(maxPeriod)

      // event
      await expect(tx2).emit(esVsp, 'VspLocked').withArgs(expectedTokenId2, alice.address, amount2, period2)

      const locked = await esVsp.locked(alice.address)
      const totalLocked = await esVsp.totalLocked()
      expect(locked).eq(totalLocked.sub(totalLockedBefore)).eq(amount1.add(amount2))

      const boosted = await esVsp.boosted(alice.address)
      const totalBoosted = await esVsp.totalBoosted()
      expect(boosted).eq(totalBoosted.sub(totalBoostedBefore)).eq(expectedBoostAmount1.add(expectedBoostAmount2))
    })

    it('should lock by multiple users with different lock-in period', async function () {
      // when
      const amount1 = parseEther('100')
      const period1 = YEAR
      const tx1 = esVsp.lock(amount1, period1)

      // then
      const expectedTokenId1 = await esVsp721.nextTokenId()
      const expectedBoostAmount1 = amount1.mul(period1).mul(maxBoost).div(maxPeriod)

      // event
      await expect(tx1).emit(esVsp, 'VspLocked').withArgs(expectedTokenId1, alice.address, amount1, period1)

      // when
      const amount2 = parseEther('50')
      const period2 = MONTH
      const tx2 = esVsp.connect(bob).lock(amount2, period2)

      // then
      const expectedTokenId2 = await esVsp721.nextTokenId()
      const expectedBoostAmount2 = amount2.mul(period2).mul(maxBoost).div(maxPeriod)

      // event
      await expect(tx2).emit(esVsp, 'VspLocked').withArgs(expectedTokenId2, bob.address, amount2, period2)

      const locked = (await esVsp.locked(alice.address)).add(await esVsp.locked(bob.address))
      const totalLocked = await esVsp.totalLocked()
      expect(locked).eq(totalLocked.sub(totalLockedBefore)).eq(amount1.add(amount2))

      const boosted = (await esVsp.boosted(alice.address)).add(await esVsp.boosted(bob.address))
      const totalBoosted = await esVsp.totalBoosted()
      expect(boosted).eq(totalBoosted.sub(totalBoostedBefore)).eq(expectedBoostAmount1.add(expectedBoostAmount2))
    })
  })

  describe('unlock', function () {
    const amount = parseEther('100')
    const period = YEAR
    let tokenId: BigNumber

    beforeEach(async function () {
      tokenId = await esVsp721.nextTokenId()
      await esVsp.lock(amount, period)
    })

    it('should pay exit penalty when withdrawing before unlock time', async function () {
      // given
      const penalty = await esVsp.exitPenalty()
      expect(penalty).eq(parseEther('0.5'))
      await esVsp.connect(bob).lock(amount, period)
      await esVsp.connect(carl).lock(amount, period)

      const treasuryBefore = await vsp.balanceOf(await esVsp.treasury())
      const aliceBefore = await vsp.balanceOf(alice.address)
      const bobBefore = await vsp.balanceOf(bob.address)
      const carlBefore = await vsp.balanceOf(carl.address)

      // when-then
      const beforeUnlockTime = true

      await esVsp.unlock(tokenId, beforeUnlockTime)
      // just after deposit: full penalty (50 VSP)
      expect(await vsp.balanceOf(alice.address)).closeTo(aliceBefore.add(parseEther('50')), parseEther('0.001'))

      await increaseTime(YEAR.div(2))
      tokenId = tokenId.add(1)
      await esVsp.connect(bob).unlock(tokenId, beforeUnlockTime)
      // 6mo layer: half penalty (25 VSP)
      expect(await vsp.balanceOf(bob.address)).closeTo(bobBefore.add(parseEther('75')), parseEther('0.001'))

      await increaseTime(YEAR.div(2))
      tokenId = tokenId.add(1)
      await esVsp.connect(carl).unlock(tokenId, beforeUnlockTime)
      // 1y later: no penalty
      expect(await vsp.balanceOf(carl.address)).closeTo(carlBefore.add(amount), parseEther('0.001'))

      const treasuryAfter = await vsp.balanceOf(await esVsp.treasury())
      const penaltyCollected = parseEther('50').add(parseEther('25'))
      expect(treasuryAfter).closeTo(treasuryBefore.add(penaltyCollected), parseEther('0.001'))
    })

    it('should unlock all locked amount after lock period', async function () {
      // given
      const balanceBefore = await vsp.balanceOf(alice.address)

      // when
      await increaseTime(YEAR.add(1))

      const beforeUnlockTime = false
      const tx = esVsp.unlock(tokenId, beforeUnlockTime)

      // then
      await expect(tx).emit(esVsp, 'VspUnlocked').withArgs(tokenId, amount, amount, 0)

      // data
      const {lockedAmount, boostedAmount, unlockTime} = await esVsp.positions(tokenId)
      expect(lockedAmount).eq(0)
      expect(boostedAmount).eq(0)
      expect(unlockTime).eq(0)

      const locked = await esVsp.locked(alice.address)
      expect(locked).eq(0)

      const boosted = await esVsp.boosted(alice.address)
      const totalBoosted = await esVsp.totalBoosted()
      expect(boosted).eq(0)

      // VSP balance
      const balanceAfter = await vsp.balanceOf(alice.address)
      expect(balanceAfter.sub(balanceBefore)).eq(amount)

      // nft
      await expect(esVsp721.ownerOf(tokenId)).reverted
      expect(await esVsp721.balanceOf(alice.address)).eq(0)

      // erc20
      expect(await esVsp.totalSupply()).eq(totalBoosted) // TODO This to be changed after contract deployment.
      expect(await esVsp.balanceOf(alice.address)).eq(boosted.add(locked))
      expect(await esVsp.locked(alice.address)).eq(locked)
      expect(await esVsp.boosted(alice.address)).eq(boosted)
    })
  })

  describe('drip rewards', function () {
    beforeEach(async function () {
      await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      await rewards.connect(distributor).dripRewardAmount(rewardToken, parseEther('50'))
    })

    it('should drip if now >= period finish', async function () {
      // given
      const duration = await rewards.REWARD_DURATION()
      const amount = parseEther('30')
      await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

      await increaseTime(duration.add(1))
      const balanceBefore = await vsp.balanceOf(rewards.address)
      // when
      const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

      // then
      await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
      const now = await timestampFromLatestBlock()

      const balanceAfter = await vsp.balanceOf(rewards.address)
      expect(balanceAfter.sub(balanceBefore)).eq(amount)

      const expectedRewardRates = amount.div(duration)
      const {rewardPerSecond, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)

      expect(rewardPerSecond).eq(expectedRewardRates)
      expect(periodFinish).eq(now + duration.toNumber())
      expect(lastUpdateTime).eq(now)
    })

    it('should drip if now < period finish', async function () {
      // given
      const duration = await rewards.REWARD_DURATION()
      const amount = parseEther('30')
      await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

      const halfPeriod = duration.div(2)
      await increaseTime(halfPeriod)
      await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
      // when
      const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

      // then
      await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
      const now = await timestampFromLatestBlock()

      const {rewardPerSecond, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)
      expect(rewardPerSecond).closeTo(parseEther('1.5').div(DAY), parseEther('0.0001'))
      expect(periodFinish).eq(now + duration.toNumber())
      expect(lastUpdateTime).eq(now)
    })
  })

  describe('claim rewards', function () {
    const rewardAmount = 30
    const amount = parseEther(rewardAmount.toString())
    beforeEach(async function () {
      await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
    })

    it('should claim pending rewards by a user after reward duration', async function () {
      // given
      await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      await increaseTime(MONTH)
      const {_claimableAmounts} = await rewards.claimableRewards(alice.address)
      const [claimable] = _claimableAmounts
      expect(claimable).closeTo(amount, parseEther('1'))

      // when
      const tx = () => rewards.claimRewards(alice.address)

      // then
      await expect(tx).changeTokenBalance(vsp, alice, claimable)
      const {claimableRewardsStored} = await rewards.rewardOf(rewardToken, alice.address)
      expect(claimableRewardsStored).eq(0)
    })

    it('should claim pending rewards by a user within reward duration', async function () {
      // given
      await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      await increaseTime(WEEK) // claim rewards after 1 week
      const {_claimableAmounts} = await rewards.claimableRewards(alice.address)
      const [claimable] = _claimableAmounts
      expect(claimable).closeTo(amount.div(4), parseEther('1'))

      // when
      rewards.claimRewards(alice.address)

      // then
      const {claimableRewardsStored} = await rewards.rewardOf(rewardToken, alice.address)
      expect(claimableRewardsStored).eq(0)
    })

    it('should claim pending rewards by multiple users as per lock-in ratio', async function () {
      // given
      const aliceDeposit = 60
      const bobDeposit = 40
      await esVsp.connect(alice).lock(parseEther(aliceDeposit.toString()), YEAR)
      await esVsp.connect(bob).lock(parseEther(bobDeposit.toString()), YEAR)
      await increaseTime(MONTH)

      const {_claimableAmounts: claimableAmounts1} = await rewards.claimableRewards(alice.address)
      const [claimable1] = claimableAmounts1
      const aliceExpectedRewards = (rewardAmount * aliceDeposit) / 100
      expect(claimable1).closeTo(parseEther(aliceExpectedRewards.toString()), parseEther('0.5'))

      const {_claimableAmounts: claimableAmounts2} = await rewards.claimableRewards(bob.address)
      const [claimable2] = claimableAmounts2
      const bobExpectedRewards = (rewardAmount * bobDeposit) / 100
      expect(claimable2).closeTo(parseEther(bobExpectedRewards.toString()), parseEther('0.5'))

      // when
      const tx1 = () => rewards.claimRewards(alice.address)
      const tx2 = () => rewards.claimRewards(bob.address)

      // then
      await expect(tx1).changeTokenBalance(vsp, alice, claimable1)
      const {claimableRewardsStored: claimableRewardsStored1} = await rewards.rewardOf(rewardToken, alice.address)
      expect(claimableRewardsStored1).eq(0)

      await expect(tx2).changeTokenBalance(vsp, bob, claimable2)
      const {claimableRewardsStored: claimableRewardsStored2} = await rewards.rewardOf(rewardToken, bob.address)
      expect(claimableRewardsStored2).eq(0)
    })
  })
})
