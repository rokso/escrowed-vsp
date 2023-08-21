/* eslint-disable new-cap */
/* eslint-disable camelcase */
import {parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {BigNumber} from 'ethers'
import {ethers} from 'hardhat'
import {ESVSP, ESVSP721, ESVSP721__factory, ESVSP__factory, IERC20, IERC20__factory} from '../typechain'
import {
  impersonateAccount,
  increaseTime,
  VSP_HOLDER,
  YEAR,
  timestampFromLatestBlock,
  WETH_HOLDER,
  USDC_HOLDER,
  MONTH,
} from './helpers'
import Address from '../helpers/address'

const {VSP_ADDRESS, USDC_ADDRESS, WETH_ADDRESS} = Address

describe('ESVSP', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let treasury: SignerWithAddress
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
    ;[deployer, governor, treasury, distributor, alice, bob, carl] = await ethers.getSigners()

    const esVspFactory = new ESVSP__factory(deployer)
    esVsp = await esVspFactory.deploy()
    await esVsp.deployed()

    const esVsp721Factory = new ESVSP721__factory(deployer)
    esVsp721 = await esVsp721Factory.deploy()
    await esVsp721.deployed()
    await esVsp721.initialize('VSP Escrow NFT', 'esVSP-NFT')
    await esVsp721.initializeESVSP(esVsp.address)

    await esVsp.initialize('VSP Escrow', 'esVSP', 18, esVsp721.address, treasury.address)
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
      await expect(tx)
        .emit(esVsp, 'Transfer')
        .withArgs(ethers.constants.AddressZero, alice.address, expectedBoostAmount.add(amount))
      await expect(tx).emit(esVsp, 'VspLocked').withArgs(expectedTokenId, alice.address, amount, period)

      // data
      const {lockedAmount, boostedAmount, unlockTime} = await esVsp.positions(expectedTokenId)
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
      expect(await esVsp.totalSupply()).eq(totalBoosted.add(totalLocked))
      expect(await esVsp.balanceOf(alice.address)).eq(boosted.add(locked))
      expect(await esVsp.locked(alice.address)).eq(locked)
      expect(await esVsp.boosted(alice.address)).eq(boosted)
    })
  })

  describe('lockFor', function () {
    it('should lock VSP on behalf', async function () {
      //
      // given
      //
      const esVspBalanceBefore = await vsp.balanceOf(esVsp.address)

      //
      // when
      //
      const to = bob.address
      const amount = parseEther('100')
      const period = YEAR
      const tx = esVsp.lockFor(to, amount, period)

      //
      // then
      //
      const expectedTokenId = 1

      // event
      await expect(tx).emit(esVsp, 'VspLocked').withArgs(expectedTokenId, to, amount, period)

      // data
      const {lockedAmount} = await esVsp.positions(expectedTokenId)
      expect(lockedAmount).eq(amount)

      const locked = await esVsp.locked(to)
      const totalLocked = await esVsp.totalLocked()
      expect(locked).eq(totalLocked).eq(amount)

      const boosted = await esVsp.boosted(to)
      const totalBoosted = await esVsp.totalBoosted()
      expect(boosted).eq(totalBoosted)

      // VSP balance
      const esVspBalanceAfter = await vsp.balanceOf(esVsp.address)
      expect(esVspBalanceAfter.sub(esVspBalanceBefore)).eq(lockedAmount)

      // nft
      expect(await esVsp721.ownerOf(expectedTokenId)).eq(to)
      expect(await esVsp721.balanceOf(to)).eq(1)

      // erc20
      expect(await esVsp.totalSupply()).eq(totalBoosted.add(totalLocked))
      expect(await esVsp.balanceOf(to)).eq(boosted.add(locked))
      expect(await esVsp.locked(to)).eq(locked)
      expect(await esVsp.boosted(to)).eq(boosted)
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

    it('should revert if user want to unlock with penalty before cooldown time', async function () {
      // given
      const penalty = await esVsp.exitPenalty()
      expect(penalty).eq(parseEther('0.5'))

      // when
      const beforeUnlockTime = true
      const tx = esVsp.unlock(1, beforeUnlockTime)

      // then
      await expect(tx).revertedWith('cool-down-period-did-not-pass')
    })

    it('should pay exit penalty when withdrawing before unlock time', async function () {
      // given
      const penalty = await esVsp.exitPenalty()
      expect(penalty).eq(parseEther('0.5'))
      await esVsp.connect(bob).lock(amount, period)
      await esVsp.connect(carl).lock(amount, period)

      const treasuryBefore = await vsp.balanceOf(treasury.address)
      const aliceBefore = await vsp.balanceOf(alice.address)
      const bobBefore = await vsp.balanceOf(bob.address)
      const carlBefore = await vsp.balanceOf(carl.address)

      // when-then
      const beforeUnlockTime = true

      await increaseTime(await esVsp.COOL_DOWN_PERIOD())
      await esVsp.unlock(1, beforeUnlockTime)
      // just after deposit: full penalty (50 VSP)
      expect(await vsp.balanceOf(alice.address)).closeTo(aliceBefore.add(parseEther('50')), parseEther('1'))

      await increaseTime(YEAR.div(2))
      await esVsp.connect(bob).unlock(2, beforeUnlockTime)
      // 6mo layer: half penalty (25 VSP)
      expect(await vsp.balanceOf(bob.address)).closeTo(bobBefore.add(parseEther('75')), parseEther('1'))

      await increaseTime(YEAR.div(2))
      await esVsp.connect(carl).unlock(3, beforeUnlockTime)
      // 1y later: no penalty
      expect(await vsp.balanceOf(carl.address)).closeTo(carlBefore.add(amount), parseEther('1'))

      const treasuryAfter = await vsp.balanceOf(treasury.address)
      const penaltyCollected = parseEther('50').add(parseEther('25'))
      expect(treasuryAfter).closeTo(treasuryBefore.add(penaltyCollected), parseEther('1'))
    })

    it('should unlock all locked amount after lock period', async function () {
      // given
      const balanceBefore = await vsp.balanceOf(alice.address)
      const esVspBefore = await esVsp.balanceOf(alice.address)

      // when
      await increaseTime(YEAR.add(1))

      const tokenId = 1
      const beforeUnlockTime = false
      const tx = esVsp.unlock(tokenId, beforeUnlockTime)

      // then
      await expect(tx).emit(esVsp, 'Transfer').withArgs(alice.address, ethers.constants.AddressZero, esVspBefore)
      await expect(tx).emit(esVsp, 'VspUnlocked').withArgs(tokenId, alice.address, amount, amount, 0)

      // data (deleted)
      const {lockedAmount, boostedAmount, unlockTime} = await esVsp.positions(tokenId)
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
      expect(await esVsp.totalSupply()).eq(totalBoosted.add(totalLocked))
      expect(await esVsp.balanceOf(alice.address)).eq(boosted.add(locked))
      expect(await esVsp.locked(alice.address)).eq(locked)
      expect(await esVsp.boosted(alice.address)).eq(boosted)
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
      const positionBefore = await esVsp.positions(tokenId)
      expect(await esVsp.locked(alice.address)).eq(amount)
      expect(await esVsp.locked(bob.address)).eq(0)
      const balance = await esVsp.balanceOf(alice.address)

      // when
      const tx = esVsp.connect(esVsp721Wallet).transferPosition(tokenId, bob.address)

      // then
      await expect(tx).emit(esVsp, 'Transfer').withArgs(alice.address, bob.address, balance)
      await expect(tx).changeTokenBalances(esVsp, [alice, bob], [balance.mul(-1), balance])
      const totalSupplyAfter = await esVsp.totalSupply()
      expect(totalSupplyAfter).eq(totalSupplyBefore)
      const positionAfter = await esVsp.positions(tokenId)
      expect(positionAfter).deep.eq(positionBefore)
      expect(await esVsp.locked(alice.address)).eq(0)
      expect(await esVsp.locked(bob.address)).eq(amount)
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
      await expect(tx).emit(esVsp, 'VspUnlocked').withArgs(tokenId, alice.address, amount, amount, 0)

      // data (deleted)
      const {lockedAmount, boostedAmount, unlockTime} = await esVsp.positions(tokenId)
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
      expect(await esVsp.totalSupply()).eq(totalBoosted.add(totalLocked))
      expect(await esVsp.balanceOf(alice.address)).eq(boosted.add(locked))
      expect(await esVsp.locked(alice.address)).eq(locked)
      expect(await esVsp.boosted(alice.address)).eq(boosted)
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

    it('gas usage - all expired', async function () {
      // given
      const positionsToKick = 5
      for (let i = 0; i < positionsToKick; ++i) {
        await esVsp.connect(bob).lock(parseEther('1'), YEAR)
      }
      await increaseTime(YEAR.add(1))
      const before = await vsp.balanceOf(bob.address)

      // when
      const tx = await esVsp.connect(bob).kickAllExpiredOf(bob.address)
      const receipt = await tx.wait()

      // then
      const after = await vsp.balanceOf(bob.address)
      expect(after.sub(before)).eq(parseEther(`${positionsToKick}`))
      expect(receipt.gasUsed).closeTo(86e3 * positionsToKick, 10e3)
    })

    it('gas usage - none expired', async function () {
      // given
      const positionsToKick = 5
      for (let i = 0; i < positionsToKick; ++i) {
        await esVsp.connect(bob).lock(parseEther('1'), YEAR)
      }
      const before = await vsp.balanceOf(bob.address)

      // when
      const tx = await esVsp.connect(bob).kickAllExpiredOf(bob.address)
      const receipt = await tx.wait()

      // then
      const after = await vsp.balanceOf(bob.address)
      expect(after).eq(before)
      expect(receipt.gasUsed).eq(63749) // ~13k each
    })
  })

  describe('initializeRewards', function () {
    it('should revert if not governor', async function () {
      // when
      const tx = esVsp.connect(alice).initializeRewards(alice.address)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if already initialized', async function () {
      // given
      await esVsp.connect(governor).initializeRewards(alice.address)

      // when
      const tx = esVsp.connect(governor).initializeRewards(alice.address)

      // then
      await expect(tx).revertedWith('already-initialized')
    })

    it('should revert if address is null', async function () {
      // when
      const tx = esVsp.connect(governor).initializeRewards(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('address-is-null')
    })

    it('should initialize the ESVSP contract', async function () {
      // given
      const before = await esVsp.rewards()
      expect(before).eq(ethers.constants.AddressZero)

      // when
      await esVsp.connect(governor).initializeRewards(alice.address)

      // then
      const after = await esVsp.rewards()
      expect(after).eq(alice.address)
    })
  })

  describe('Check voting power', function () {
    it('Should check current votes', async function () {
      // given, alice locked 100 VSP and delegate voting power to self
      await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      const blockNumber = await ethers.provider.getBlockNumber()
      await esVsp.connect(alice).delegate(alice.address)

      // when
      const votes = await esVsp.getVotes(alice.address)
      const supply = await esVsp.totalSupply()
      const pastSupply = await esVsp.getPastTotalSupply(blockNumber)

      // then verify vote
      expect(votes)
        .eq(await esVsp.balanceOf(alice.address))
        .eq(supply)
        .eq(pastSupply)
    })

    it('Should check current votes after unlock', async function () {
      // given, carl locked 100 VSP and delegate voting power to self
      await esVsp.connect(carl).lock(parseEther('100'), MONTH)
      await esVsp.connect(carl).delegate(carl.address)
      await increaseTime(MONTH.add(1))

      // when
      await esVsp.connect(carl).unlock(1, false)
      const blockNumber = await ethers.provider.getBlockNumber()
      await increaseTime(BigNumber.from(1)) // force block mining
      const votes = await esVsp.getVotes(carl.address)
      const supply = await esVsp.totalSupply()
      const pastSupply = await esVsp.getPastTotalSupply(blockNumber)

      // then verify vote = locked + boosted
      expect(votes).eq(0).eq(supply).eq(pastSupply)
    })

    it('Should check prior votes', async function () {
      // given, alice locked 100 VSP and delegate voting power to self
      await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      await esVsp.connect(alice).delegate(alice.address)

      const blockNumber = await ethers.provider.getBlockNumber()
      const votes = await esVsp.getVotes(alice.address)

      // when
      await esVsp.connect(alice).lock(parseEther('100'), MONTH)
      const pastVotes = await esVsp.getPastVotes(alice.address, blockNumber)
      const pastSupply = await esVsp.getPastTotalSupply(blockNumber)

      // then
      expect(pastVotes).eq(votes).eq(pastSupply)

      const currentVotes = await esVsp.getVotes(alice.address)
      const currentSupply = await esVsp.totalSupply()
      expect(currentVotes)
        .eq(await esVsp.balanceOf(alice.address))
        .eq(currentSupply)
    })

    it('Should check votes when position is transferred', async function () {
      // given, bob locked 100 VSP and delegate voting power to self
      await esVsp.connect(bob).lock(parseEther('100'), YEAR)
      await esVsp.connect(bob).delegate(alice.address)
      await esVsp.connect(carl).delegate(carl.address)

      const blockNumber = await ethers.provider.getBlockNumber()
      expect(await esVsp.getVotes(bob.address)).eq(0)
      expect(await esVsp.getVotes(alice.address)).eq(parseEther('300'))
      const votes = await esVsp.getVotes(alice.address)
      const positionId = 1

      // when bob transfer position to carl
      expect(await esVsp721.ownerOf(positionId)).eq(bob.address)
      const esVsp721Wallet = await impersonateAccount(esVsp721.address)
      await esVsp.connect(esVsp721Wallet).transferPosition(positionId, carl.address)

      // then
      const pastVotes = await esVsp.getPastVotes(alice.address, blockNumber)
      const pastSupply = await esVsp.getPastTotalSupply(blockNumber)
      expect(pastVotes).eq(votes).eq(pastSupply)

      const currentVotesBob = await esVsp.getVotes(bob.address)
      expect(currentVotesBob).eq(await esVsp.balanceOf(bob.address))

      const currentVotesCarl = await esVsp.getVotes(carl.address)
      expect(currentVotesCarl).eq(await esVsp.balanceOf(carl.address))

      const currentSupply = await esVsp.totalSupply()
      expect(currentSupply).eq(currentVotesBob.add(currentVotesCarl))
    })

    it('Should check votes when position is burnt', async function () {
      // given - bob locked 100 VSP
      const positionId = 1
      const lockedAmount = parseEther('100')
      await esVsp.connect(bob).lock(lockedAmount, YEAR)
      const balance = await esVsp.balanceOf(bob.address)
      expect(balance).eq(parseEther('300'))
      await esVsp.connect(bob).delegate(bob.address)
      expect(await esVsp.getVotes(bob.address)).eq(balance)

      const blockNumber1 = await ethers.provider.getBlockNumber()
      await increaseTime(BigNumber.from(1)) // force block mining
      expect(await esVsp.getPastVotes(bob.address, blockNumber1)).eq(balance)
      expect(await esVsp.totalSupply()).eq(balance)
      expect(await esVsp.getPastTotalSupply(blockNumber1)).eq(balance)

      // when
      expect(await esVsp721.ownerOf(positionId)).eq(bob.address)
      await increaseTime(await esVsp.COOL_DOWN_PERIOD())
      await esVsp.connect(bob).unlock(positionId, true)

      // then
      const blockNumber2 = await ethers.provider.getBlockNumber()
      await increaseTime(BigNumber.from(1)) // force block mining
      expect(await esVsp.getVotes(bob.address)).eq(0)
      expect(await esVsp.getPastVotes(bob.address, blockNumber2)).eq(0)
      expect(await esVsp.totalSupply()).eq(0)
      expect(await esVsp.getPastTotalSupply(blockNumber2)).eq(0)
    })
  })
})
