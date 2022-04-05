/* eslint-disable new-cap */
/* eslint-disable camelcase */
import {parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {BigNumber} from 'ethers'
import {ethers} from 'hardhat'
import {
  ESVSP,
  ESVSP721,
  ESVSP721__factory,
  ESVSP__factory,
  IERC20,
  IERC20__factory,
  Rewards,
  Rewards__factory,
} from '../typechain'
import {
  impersonateAccount,
  increaseTime,
  VSP_ADDRESS,
  VSP_HOLDER,
  YEAR,
  USDC_ADDRESS,
  WETH_ADDRESS,
  timestampFromLatestBlock,
  WETH_HOLDER,
  USDC_HOLDER,
} from './helpers'

describe('ESVSP', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let distributor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let carl: SignerWithAddress
  let vsp: IERC20
  let weth: IERC20
  let usdc: IERC20
  let esVsp721: ESVSP721
  let esVsp: ESVSP

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, distributor, alice, bob, carl] = await ethers.getSigners()

    const esVspFactory = new ESVSP__factory(deployer)
    esVsp = await esVspFactory.deploy()
    await esVsp.deployed()

    const esVsp721Factory = new ESVSP721__factory(deployer)
    esVsp721 = await esVsp721Factory.deploy(esVsp.address, 'VSP Escrow NFT', 'esVSP-NFT')
    await esVsp721.deployed()

    await esVsp.initialize('VSP Escrow', 'esVSP', 18, esVsp721.address)
    await esVsp.transferGovernorship(governor.address)
    await esVsp.connect(governor).acceptGovernorship()

    vsp = IERC20__factory.connect(VSP_ADDRESS, alice)
    esVsp = esVsp.connect(alice)
    esVsp721 = esVsp721.connect(alice)

    const vspHolder = await impersonateAccount(VSP_HOLDER)
    await vsp.connect(vspHolder).transfer(alice.address, parseEther('1000000'))
    await vsp.connect(vspHolder).transfer(bob.address, parseEther('1000000'))
    await vsp.connect(vspHolder).transfer(carl.address, parseEther('1000000'))

    await vsp.approve(esVsp.address, ethers.constants.MaxUint256)
    await vsp.connect(bob).approve(esVsp.address, ethers.constants.MaxUint256)
    await vsp.connect(carl).approve(esVsp.address, ethers.constants.MaxUint256)

    weth = IERC20__factory.connect(WETH_ADDRESS, distributor)
    const wethHolder = await impersonateAccount(WETH_HOLDER)
    await weth.connect(wethHolder).transfer(alice.address, parseEther('100'))
    await weth.connect(wethHolder).transfer(carl.address, parseEther('1000'))
    await weth.connect(wethHolder).transfer(distributor.address, parseEther('1000'))

    usdc = IERC20__factory.connect(USDC_ADDRESS, distributor)
    const usdcHolder = await impersonateAccount(USDC_HOLDER)
    await usdc.connect(usdcHolder).transfer(alice.address, parseUnits('100', 6))
    await usdc.connect(usdcHolder).transfer(carl.address, parseUnits('1000', 6))
    await usdc.connect(usdcHolder).transfer(distributor.address, parseUnits('1000', 6))
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('lock', function () {
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
      const expectedUnlockTime = BigNumber.from(await timestampFromLatestBlock()).add(period)

      // event
      await expect(tx).emit(esVsp, 'VspLocked').withArgs(expectedTokenId, alice.address, amount, period)

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

  describe('unlock', function () {
    const amount = parseEther('100')
    const period = YEAR

    beforeEach(async function () {
      await esVsp.lock(amount, period)
    })

    it('should revert if caller is not the bond owner', async function () {
      // given
      await increaseTime(YEAR.add(1))

      // when
      const tokenId = 1
      const tx = esVsp.connect(bob).unlock(tokenId, false)

      // then
      await expect(tx).revertedWith('not-position-owner')
    })

    it('should revert if user do not want to pay penalty but position did not reach unlock time', async function () {
      // when
      const tokenId = 1
      const beforeUnlockTime = false
      const tx = esVsp.unlock(tokenId, beforeUnlockTime)

      // then
      await expect(tx).revertedWith('not-unlocked-yet')
    })

    it('should pay exit penalty when withdrawing before unlock time', async function () {
      // given
      const penalty = await esVsp.exitPenalty()
      expect(penalty).eq(parseEther('0.5'))
      await esVsp.connect(bob).lock(amount, period)
      await esVsp.connect(carl).lock(amount, period)

      const aliceBefore = await vsp.balanceOf(alice.address)
      const bobBefore = await vsp.balanceOf(bob.address)
      const carlBefore = await vsp.balanceOf(carl.address)

      // when
      const beforeUnlockTime = true

      await esVsp.unlock(1, beforeUnlockTime)
      // just after deposit: full penalty
      expect(await vsp.balanceOf(alice.address)).closeTo(aliceBefore.add(parseEther('50')), parseEther('0.001'))

      await increaseTime(YEAR.div(2))
      await esVsp.connect(bob).unlock(2, beforeUnlockTime)
      // 6mo layer: half penalty
      expect(await vsp.balanceOf(bob.address)).closeTo(bobBefore.add(parseEther('75')), parseEther('0.001'))

      await increaseTime(YEAR.div(2))
      await esVsp.connect(carl).unlock(3, beforeUnlockTime)
      // 1y later: no penalty
      expect(await vsp.balanceOf(carl.address)).closeTo(carlBefore.add(amount), parseEther('0.001'))
    })

    it('should unlock all locked amount after lock period', async function () {
      // given
      const balanceBefore = await vsp.balanceOf(alice.address)

      // when
      await increaseTime(YEAR.add(1))

      const tokenId = 1
      const beforeUnlockTime = false
      const tx = esVsp.unlock(tokenId, beforeUnlockTime)

      // then
      await expect(tx).emit(esVsp, 'VspUnlocked').withArgs(tokenId)

      // data (deleted)
      const {lockedAmount, boostedAmount, unlockTime} = await esVsp.stakeData(tokenId)
      expect(lockedAmount).eq(0)
      expect(boostedAmount).eq(0)
      expect(unlockTime).eq(0)

      const locked = await esVsp.locked(alice.address)
      const totalLocked = await esVsp.totalLocked()
      expect(locked).eq(totalLocked).eq(0)

      const boosted = await esVsp.boosted(alice.address)
      const totalBoosted = await esVsp.totalBoosted()
      expect(boosted).eq(totalBoosted).eq(0)

      // VSP balance
      const balanceAfter = await vsp.balanceOf(alice.address)
      expect(balanceAfter.sub(balanceBefore)).eq(amount)

      // nft
      await expect(esVsp721.ownerOf(tokenId)).reverted
      expect(await esVsp721.balanceOf(alice.address)).eq(0)

      // erc20
      expect(await esVsp.totalSupply()).eq(totalBoosted)
      expect(await esVsp.balanceOf(alice.address)).eq(boosted)
      expect(await esVsp.lockedBalanceOf(alice.address)).eq(locked)
    })
  })

  describe('transferPosition', function () {
    const tokenId = 1
    const amount = parseEther('100')
    const period = YEAR
    let esVsp721Wallet: SignerWithAddress

    beforeEach(async function () {
      await esVsp.lock(amount, period)
      esVsp721Wallet = await impersonateAccount(esVsp721.address)
    })

    it('should revert if caller is not esVSP721', async function () {
      // when
      const tx = esVsp.connect(bob).transferPosition(tokenId, bob.address)

      // then
      await expect(tx).revertedWith('not-esvsp721')
    })

    it('should revert if tokenId is invalid', async function () {
      // when
      const invalidTokenId = 999
      const tx = esVsp.connect(esVsp721Wallet).transferPosition(invalidTokenId, bob.address)

      // then
      await expect(tx).reverted
    })

    it('should transfer position (ERC20-only)', async function () {
      const totalSupplyBefore = await esVsp.totalSupply()
      const stakeDataBefore = await esVsp.stakeData(tokenId)
      expect(await esVsp.lockedBalanceOf(alice.address)).eq(amount)
      expect(await esVsp.lockedBalanceOf(bob.address)).eq(0)
      const {boostedAmount: boosted} = stakeDataBefore

      // when
      const tx = () => esVsp.connect(esVsp721Wallet).transferPosition(tokenId, bob.address)

      // then
      await expect(tx).changeTokenBalances(esVsp, [alice, bob], [boosted.mul(-1), boosted])
      const totalSupplyAfter = await esVsp.totalSupply()
      expect(totalSupplyAfter).eq(totalSupplyBefore)
      const stakeDataAfter = await esVsp.stakeData(tokenId)
      expect(stakeDataAfter).deep.eq(stakeDataBefore)
      expect(await esVsp.lockedBalanceOf(alice.address)).eq(0)
      expect(await esVsp.lockedBalanceOf(bob.address)).eq(amount)
    })
  })

  describe('kick', function () {
    const amount = parseEther('100')
    const period = YEAR

    beforeEach(async function () {
      await esVsp.lock(amount, period)
    })

    it('should revert if do not reached unlock time', async function () {
      // when
      const tokenId = 1
      const tx = esVsp.kick(tokenId)

      // then
      await expect(tx).revertedWith('not-unlocked-yet')
    })

    it('should unlock locked amount', async function () {
      // given
      const balanceBefore = await vsp.balanceOf(alice.address)

      // when
      await increaseTime(YEAR.add(1))

      const tokenId = 1
      const tx = esVsp.connect(bob).kick(tokenId)

      // then
      await expect(tx).emit(esVsp, 'PositionKicked').withArgs(tokenId)

      // data (deleted)
      const {lockedAmount, boostedAmount, unlockTime} = await esVsp.stakeData(tokenId)
      expect(lockedAmount).eq(0)
      expect(boostedAmount).eq(0)
      expect(unlockTime).eq(0)

      const locked = await esVsp.locked(alice.address)
      const totalLocked = await esVsp.totalLocked()
      expect(locked).eq(totalLocked).eq(0)

      const boosted = await esVsp.boosted(alice.address)
      const totalBoosted = await esVsp.totalBoosted()
      expect(boosted).eq(totalBoosted).eq(0)

      // VSP balance
      const balanceAfter = await vsp.balanceOf(alice.address)
      expect(balanceAfter.sub(balanceBefore)).eq(amount)

      // nft
      await expect(esVsp721.ownerOf(tokenId)).reverted
      expect(await esVsp721.balanceOf(alice.address)).eq(0)

      // erc20
      expect(await esVsp.totalSupply()).eq(totalBoosted)
      expect(await esVsp.balanceOf(alice.address)).eq(boosted)
      expect(await esVsp.lockedBalanceOf(alice.address)).eq(locked)
    })
  })

  describe('kickAllExpiredOf', function () {
    beforeEach(async function () {
      const amount = parseEther('100')
      await esVsp.lock(amount, YEAR)
      await esVsp.lock(amount, YEAR.mul(2))
      await esVsp.lock(amount, YEAR)
      await esVsp.lock(amount, YEAR.mul(2))
      await esVsp.lock(amount, YEAR)

      await increaseTime(YEAR.add(1))
    })

    it('should kick expired positions', async function () {
      // given
      const balanceBefore = await esVsp721.balanceOf(alice.address)

      // when
      await esVsp.connect(bob).kickAllExpiredOf(alice.address)

      // VSP balance
      const balanceAfter = await esVsp721.balanceOf(alice.address)
      expect(balanceAfter).eq(balanceBefore.sub(3))
    })
  })
})
