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
  VSP_ADDRESS,
  VSP_HOLDER,
  YEAR,
  USDC_ADDRESS,
  WETH_ADDRESS,
  timestampFromLatestBlock,
  WETH_HOLDER,
  DAY,
  MONTH,
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

  // TODO: Want we this function?
  // Note: Doesn't duplicate test cases from `lock()` because assumes the same implementation
  // describe('lockFor', function () {
  //   it('should lock on behalf of other user', async function () {})
  // })

  describe('withdraw', function () {
    const amount = parseEther('100')
    const period = YEAR

    beforeEach(async function () {
      await esVsp.lock(amount, period)
    })

    it('should revert if caller is not the bond owner', async function () {
      // when
      const tokenId = 1
      const tx = esVsp.connect(bob).withdraw(tokenId)

      // then
      await expect(tx).reverted
    })

    it('should revert if do not reached unlock time', async function () {
      // when
      const tokenId = 1
      const tx = esVsp.withdraw(tokenId)

      // then
      await expect(tx).revertedWith('not-unlocked-yet')
    })

    it('should withdraw locked amount', async function () {
      // given
      const balanceBefore = await vsp.balanceOf(alice.address)

      // when
      await increaseTime(YEAR.add(1))

      const tokenId = 1
      const tx = esVsp.withdraw(tokenId)

      // then
      await expect(tx).emit(esVsp, 'VspWithdrawn').withArgs(tokenId, alice.address, amount)

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

  describe('addRewardToken', function () {
    beforeEach(async function () {
      esVsp = esVsp.connect(governor)
    })

    it('should revert if not governor', async function () {
      // when
      const tx = esVsp.connect(alice).addRewardToken(vsp.address, distributor.address, true)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if already added', async function () {
      // given
      await esVsp.addRewardToken(WETH_ADDRESS, distributor.address, true)

      // when
      const tx = esVsp.addRewardToken(WETH_ADDRESS, distributor.address, true)

      // then
      await expect(tx).revertedWith('reward-already-added')
    })

    it('should add reward token', async function () {
      // when
      const rewardsTokenAddress = WETH_ADDRESS
      const tx = esVsp.addRewardToken(rewardsTokenAddress, distributor.address, true)

      // then
      await expect(tx).emit(esVsp, 'RewardTokenAdded').withArgs(WETH_ADDRESS, [])
      const now = await timestampFromLatestBlock()
      const {isBoosted, periodFinish, rewardRates, rewardPerTokenStored, lastUpdateTime} = await esVsp.rewardData(
        rewardsTokenAddress
      )
      expect(isBoosted).true
      expect(periodFinish).eq(now)
      expect(rewardRates).eq(0)
      expect(rewardPerTokenStored).eq(0)
      expect(lastUpdateTime).eq(now)

      expect(await esVsp.rewardTokens(0)).eq(rewardsTokenAddress)
      expect(await esVsp.isRewardDistributor(rewardsTokenAddress, distributor.address)).true
    })
  })

  describe('addUpdateRewardDistributor', function () {
    beforeEach(async function () {
      esVsp = esVsp.connect(governor)
    })

    it('should revert if not governor', async function () {
      // when
      const tx = esVsp.connect(alice).setRewardDistributorApproval(vsp.address, distributor.address, true)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if not reward token was not added', async function () {
      // when
      const tx = esVsp.setRewardDistributorApproval(vsp.address, distributor.address, true)

      // then
      await expect(tx).revertedWith('reward-token-not-added')
    })

    it('should toggle approval', async function () {
      // given
      const r = WETH_ADDRESS
      const d = distributor.address

      await esVsp.addRewardToken(r, d, true)

      // when-then
      const tx1 = esVsp.setRewardDistributorApproval(r, d, false)
      await expect(tx1).emit(esVsp, 'RewardDistributorApprovalUpdated').withArgs(r, d, false)
      expect(await esVsp.isRewardDistributor(r, d)).false

      const tx2 = esVsp.setRewardDistributorApproval(r, d, true)
      await expect(tx2).emit(esVsp, 'RewardDistributorApprovalUpdated').withArgs(r, d, true)
      expect(await esVsp.isRewardDistributor(r, d)).true
    })
  })

  describe('notifyRewardAmount', function () {
    beforeEach(async function () {
      esVsp = esVsp.connect(distributor)

      await weth.connect(distributor).approve(esVsp.address, ethers.constants.MaxUint256)
    })

    it('should revert if not distributor', async function () {
      // when
      const tx = esVsp.connect(alice).notifyRewardAmount(WETH_ADDRESS, parseEther('0.1'))

      // then
      await expect(tx).revertedWith('not-distributor')
    })

    it('should revert if amount is zero', async function () {
      // given
      await esVsp.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)

      // when
      const tx = esVsp.notifyRewardAmount(WETH_ADDRESS, 0)

      // then
      await expect(tx).revertedWith('incorrect-reward-amount')
    })

    it('should revert if reward token is invalid', async function () {
      // when
      const tx = esVsp.notifyRewardAmount(USDC_ADDRESS, parseUnits('100', 6))

      // then
      await expect(tx).reverted
    })

    describe('should notify when token is boosted', function () {
      beforeEach(async function () {
        await esVsp.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      })

      it('should notify if now >= period finish (1st notification)', async function () {
        // given
        const duration = await esVsp.REWARD_DURATION()
        const balanceBefore = await weth.balanceOf(esVsp.address)

        // when
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30') // 1 ETH daily
        const tx = esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(esVsp, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const balanceAfter = await weth.balanceOf(esVsp.address)
        expect(balanceAfter.sub(balanceBefore)).eq(amount)

        const expectedRewardRates = amount.div(duration)
        const expectedRewardPerToken = 0 // TODO: Is this correct?

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await esVsp.rewardData(rewardToken)
        expect(rewardPerTokenStored).eq(expectedRewardPerToken)
        expect(rewardRates).eq(expectedRewardRates)
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })

      it('should notify if now >= period finish', async function () {
        // given
        const duration = await esVsp.REWARD_DURATION()
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)
        await increaseTime(duration.add(1))
        const {rewardPerTokenStored: rewardPerTokenBefore} = await esVsp.rewardData(rewardToken)
        const balanceBefore = await weth.balanceOf(esVsp.address)

        // when
        const tx = esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(esVsp, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const balanceAfter = await weth.balanceOf(esVsp.address)
        expect(balanceAfter.sub(balanceBefore)).eq(amount)

        const expectedRewardRates = amount.div(duration)
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(amount)
          .mul(parseEther('1'))
          .div(await esVsp.totalBoosted())

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await esVsp.rewardData(rewardToken)
        expect(rewardPerTokenStored).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(rewardRates).eq(expectedRewardRates)
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })

      it('should notify if now < period finish', async function () {
        // given
        const duration = await esVsp.REWARD_DURATION()
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)
        const halfPeriod = duration.div(2)
        await increaseTime(halfPeriod)
        const {rewardPerTokenStored: rewardPerTokenBefore} = await esVsp.rewardData(rewardToken)

        // when
        const tx = esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(esVsp, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const expectedRewardPerToken = rewardPerTokenBefore
          .add(amount.div(2))
          .mul(parseEther('1'))
          .div(await esVsp.totalBoosted())

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await esVsp.rewardData(rewardToken)
        expect(rewardPerTokenStored).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(rewardRates).closeTo(parseEther('1.5').div(DAY), parseEther('0.0001'))
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })
    })

    describe('should notify when token is not boosted', function () {
      beforeEach(async function () {
        await esVsp.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      })

      it('should notify if now >= period finish (1st notification)', async function () {
        // given
        const duration = await esVsp.REWARD_DURATION()
        const balanceBefore = await weth.balanceOf(esVsp.address)

        // when
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30') // 1 ETH daily
        const tx = esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(esVsp, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const balanceAfter = await weth.balanceOf(esVsp.address)
        expect(balanceAfter.sub(balanceBefore)).eq(amount)

        const expectedRewardRates = amount.div(duration)
        const expectedRewardPerToken = 0 // TODO: Is this correct?

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await esVsp.rewardData(rewardToken)
        expect(rewardPerTokenStored).eq(expectedRewardPerToken)
        expect(rewardRates).eq(expectedRewardRates)
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })

      it('should notify if now >= period finish', async function () {
        // given
        const duration = await esVsp.REWARD_DURATION()
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)
        await increaseTime(duration.add(1))
        const {rewardPerTokenStored: rewardPerTokenBefore} = await esVsp.rewardData(rewardToken)
        const balanceBefore = await weth.balanceOf(esVsp.address)

        // when
        const tx = esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(esVsp, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const balanceAfter = await weth.balanceOf(esVsp.address)
        expect(balanceAfter.sub(balanceBefore)).eq(amount)

        const expectedRewardRates = amount.div(duration)
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(amount)
          .mul(parseEther('1'))
          .div(await esVsp.totalLocked())

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await esVsp.rewardData(rewardToken)
        expect(rewardPerTokenStored).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(rewardRates).eq(expectedRewardRates)
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })

      it('should notify if now < period finish', async function () {
        // given
        const duration = await esVsp.REWARD_DURATION()
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)
        const halfPeriod = duration.div(2)
        await increaseTime(halfPeriod)
        const {rewardPerTokenStored: rewardPerTokenBefore} = await esVsp.rewardData(rewardToken)

        // when
        const tx = esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(esVsp, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const expectedRewardPerToken = rewardPerTokenBefore
          .add(parseEther('15'))
          .mul(parseEther('1'))
          .div(await esVsp.totalLocked())

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await esVsp.rewardData(rewardToken)
        expect(rewardPerTokenStored).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(rewardRates).closeTo(parseEther('1.5').div(DAY), parseEther('0.0001'))
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })
    })
  })

  describe('claimableRewards', function () {
    describe('when token is boosted ', function () {
      beforeEach(async function () {
        await esVsp.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)
        await esVsp.connect(bob).lock(parseEther('100'), YEAR.mul(2))

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(esVsp.address, amount)
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)

        await increaseTime(DAY.mul(10))
      })

      it('should get correct claimable rewards', async function () {
        // when
        const {_rewardTokens: _rewardTokensOfAlice, _claimableAmounts: _claimableAmountsOfAlice} =
          await esVsp.claimableRewards(alice.address)
        const [tokenOfAlice] = _rewardTokensOfAlice
        const [claimableOfAlice] = _claimableAmountsOfAlice
        const {_rewardTokens: _rewardTokensOfBob, _claimableAmounts: _claimableAmountsOfBob} =
          await esVsp.claimableRewards(bob.address)
        const [tokenOfBob] = _rewardTokensOfBob
        const [claimableOfBob] = _claimableAmountsOfBob

        // then
        expect(tokenOfAlice).eq(tokenOfBob).eq(WETH_ADDRESS)
        expect(claimableOfAlice).closeTo(parseEther('3.3333'), parseEther('0.0001'))
        expect(claimableOfBob).closeTo(parseEther('6.6666'), parseEther('0.0001'))
      })

      it('a new deposit should not dilute other accounts', async function () {
        // given
        await esVsp.connect(carl).lock(parseEther('1000'), YEAR)

        // when
        const {_rewardTokens: _rewardTokensOfAlice, _claimableAmounts: _claimableAmountsOfAlice} =
          await esVsp.claimableRewards(alice.address)
        const [tokenOfAlice] = _rewardTokensOfAlice
        const [claimableOfAlice] = _claimableAmountsOfAlice
        const {_rewardTokens: _rewardTokensOfBob, _claimableAmounts: _claimableAmountsOfBob} =
          await esVsp.claimableRewards(bob.address)
        const [tokenOfBob] = _rewardTokensOfBob
        const [claimableOfBob] = _claimableAmountsOfBob

        // then
        expect(tokenOfAlice).eq(tokenOfBob).eq(WETH_ADDRESS)
        expect(claimableOfAlice).closeTo(parseEther('3.3333'), parseEther('0.0001'))
        expect(claimableOfBob).closeTo(parseEther('6.6666'), parseEther('0.0001'))
      })
    })

    describe('when token is not boosted', function () {
      beforeEach(async function () {
        await esVsp.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)
        await esVsp.connect(bob).lock(parseEther('100'), YEAR.mul(2))

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(esVsp.address, amount)
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)

        await increaseTime(DAY.mul(10))
      })

      it('should get correct claimable rewards', async function () {
        // when
        const {_rewardTokens: _rewardTokensOfAlice, _claimableAmounts: _claimableAmountsOfAlice} =
          await esVsp.claimableRewards(alice.address)
        const [tokenOfAlice] = _rewardTokensOfAlice
        const [claimableOfAlice] = _claimableAmountsOfAlice
        const {_rewardTokens: _rewardTokensOfBob, _claimableAmounts: _claimableAmountsOfBob} =
          await esVsp.claimableRewards(bob.address)
        const [tokenOfBob] = _rewardTokensOfBob
        const [claimableOfBob] = _claimableAmountsOfBob

        // then
        expect(tokenOfAlice).eq(tokenOfBob).eq(WETH_ADDRESS)
        expect(claimableOfAlice).closeTo(parseEther('5'), parseEther('0.0001'))
        expect(claimableOfBob).closeTo(parseEther('5'), parseEther('0.0001'))
      })

      it('a new deposit should not dilute other accounts', async function () {
        // given
        await esVsp.connect(carl).lock(parseEther('1000'), YEAR)

        // when
        const {_rewardTokens: _rewardTokensOfAlice, _claimableAmounts: _claimableAmountsOfAlice} =
          await esVsp.claimableRewards(alice.address)
        const [tokenOfAlice] = _rewardTokensOfAlice
        const [claimableOfAlice] = _claimableAmountsOfAlice
        const {_rewardTokens: _rewardTokensOfBob, _claimableAmounts: _claimableAmountsOfBob} =
          await esVsp.claimableRewards(bob.address)
        const [tokenOfBob] = _rewardTokensOfBob
        const [claimableOfBob] = _claimableAmountsOfBob

        // then
        expect(tokenOfAlice).eq(tokenOfBob).eq(WETH_ADDRESS)
        expect(claimableOfAlice).closeTo(parseEther('5'), parseEther('0.0001'))
        expect(claimableOfBob).closeTo(parseEther('5'), parseEther('0.0001'))
      })
    })
  })

  describe('updateReward', function () {
    describe('when token is boosted', function () {
      beforeEach(async function () {
        await esVsp.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(esVsp.address, ethers.constants.MaxUint256)
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)
      })

      it('should update global state only if account is null', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore, lastUpdateTime: lastUpdateTimeBefore} =
          await esVsp.rewardData(WETH_ADDRESS)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await esVsp.updateReward(ethers.constants.AddressZero)

        // then
        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await esVsp.rewardData(
          WETH_ADDRESS
        )
        expect(rewardPerTokenAfter).gt(rewardPerTokenBefore)
        expect(lastUpdateTimeAfter).closeTo(lastUpdateTimeBefore.add(elapsedTime), 5)
      })

      it('should give no rewards if account did not lock', async function () {
        // given
        const rewardsBefore = await esVsp.rewards(WETH_ADDRESS, carl.address)
        expect(rewardsBefore).eq(0)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await esVsp.updateReward(carl.address)

        // then
        const rewardsAfter = await esVsp.rewards(WETH_ADDRESS, carl.address)
        expect(rewardsAfter).eq(0)
      })

      it('should update if now < period finish', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore, lastUpdateTime: lastUpdateTimeBefore} =
          await esVsp.rewardData(WETH_ADDRESS)
        const rewardsBefore = await esVsp.rewards(WETH_ADDRESS, alice.address)
        expect(rewardsBefore).eq(0)
        const claimableBefore = await esVsp.claimableRewards(alice.address)
        expect(claimableBefore._claimableAmounts[0]).eq(0)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await esVsp.updateReward(alice.address)

        const expectDrip = parseEther('10')
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(expectDrip)
          .mul(parseEther('1'))
          .div(await esVsp.totalBoosted())

        // then
        const claimableAfter = await esVsp.claimableRewards(alice.address)
        expect(claimableAfter._claimableAmounts[0]).closeTo(expectDrip, parseEther('0.0001'))

        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await esVsp.rewardData(
          WETH_ADDRESS
        )
        const rewardsAfter = await esVsp.rewards(WETH_ADDRESS, alice.address)
        expect(rewardsAfter).closeTo(expectDrip, parseEther('0.0001'))
        expect(rewardPerTokenAfter).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(lastUpdateTimeAfter).closeTo(lastUpdateTimeBefore.add(elapsedTime), 5)
      })

      it('should update if now >= period finish', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore} = await esVsp.rewardData(WETH_ADDRESS)
        const rewardsBefore = await esVsp.rewards(WETH_ADDRESS, alice.address)
        expect(rewardsBefore).eq(0)
        const claimableBefore = await esVsp.claimableRewards(alice.address)
        expect(claimableBefore._claimableAmounts[0]).eq(0)
        const {periodFinish} = await esVsp.rewardData(WETH_ADDRESS)

        // when
        const elapsedTime = YEAR
        await increaseTime(elapsedTime)
        await esVsp.updateReward(alice.address)

        const expectDrip = parseEther('30')
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(expectDrip)
          .mul(parseEther('1'))
          .div(await esVsp.totalBoosted())

        // then
        const claimableAfter = await esVsp.claimableRewards(alice.address)
        expect(claimableAfter._claimableAmounts[0]).closeTo(expectDrip, parseEther('0.0001'))

        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await esVsp.rewardData(
          WETH_ADDRESS
        )
        const rewardsAfter = await esVsp.rewards(WETH_ADDRESS, alice.address)
        expect(rewardsAfter).closeTo(expectDrip, parseEther('0.0001'))
        expect(rewardPerTokenAfter).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(lastUpdateTimeAfter).closeTo(periodFinish, 5)
      })

      // FIXME
      it.skip('should not continue receiving rewards after lock period finishes', async function () {
        // given
        const tokenId = 1
        const {unlockTime} = await esVsp.stakeData(tokenId)
        const now = await timestampFromLatestBlock()
        await increaseTime(BigNumber.from(now).add(unlockTime))
        const before = await esVsp.claimableRewards(alice.address)
        const [claimableBefore] = before._claimableAmounts

        // when
        await esVsp.connect(distributor).notifyRewardAmount(WETH_ADDRESS, parseEther('30'))
        await increaseTime(MONTH)
        await esVsp.updateReward(alice.address)

        // then
        const after = await esVsp.claimableRewards(alice.address)
        const [claimableAfter] = after._claimableAmounts
        expect(claimableAfter).eq(claimableBefore)
      })
    })

    describe('when token is not boosted', function () {
      beforeEach(async function () {
        await esVsp.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(esVsp.address, ethers.constants.MaxUint256)
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)
      })

      it('should update global state only if account is null', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore, lastUpdateTime: lastUpdateTimeBefore} =
          await esVsp.rewardData(WETH_ADDRESS)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await esVsp.updateReward(ethers.constants.AddressZero)

        // then
        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await esVsp.rewardData(
          WETH_ADDRESS
        )
        expect(rewardPerTokenAfter).gt(rewardPerTokenBefore)
        expect(lastUpdateTimeAfter).closeTo(lastUpdateTimeBefore.add(elapsedTime), 5)
      })

      it('should give no rewards if account did not lock', async function () {
        // given
        const rewardsBefore = await esVsp.rewards(WETH_ADDRESS, carl.address)
        expect(rewardsBefore).eq(0)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await esVsp.updateReward(carl.address)

        // then
        const rewardsAfter = await esVsp.rewards(WETH_ADDRESS, carl.address)
        expect(rewardsAfter).eq(0)
      })

      it('should update if now < period finish', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore, lastUpdateTime: lastUpdateTimeBefore} =
          await esVsp.rewardData(WETH_ADDRESS)
        const rewardsBefore = await esVsp.rewards(WETH_ADDRESS, alice.address)
        expect(rewardsBefore).eq(0)
        const claimableBefore = await esVsp.claimableRewards(alice.address)
        expect(claimableBefore._claimableAmounts[0]).eq(0)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await esVsp.updateReward(alice.address)

        const expectDrip = parseEther('10')
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(expectDrip)
          .mul(parseEther('1'))
          .div(await esVsp.totalLocked())

        // then
        const claimableAfter = await esVsp.claimableRewards(alice.address)
        expect(claimableAfter._claimableAmounts[0]).closeTo(expectDrip, parseEther('0.0001'))

        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await esVsp.rewardData(
          WETH_ADDRESS
        )
        const rewardsAfter = await esVsp.rewards(WETH_ADDRESS, alice.address)
        expect(rewardsAfter).closeTo(expectDrip, parseEther('0.0001'))
        expect(rewardPerTokenAfter).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(lastUpdateTimeAfter).closeTo(lastUpdateTimeBefore.add(elapsedTime), 5)
      })

      it('should update if now >= period finish', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore} = await esVsp.rewardData(WETH_ADDRESS)
        const rewardsBefore = await esVsp.rewards(WETH_ADDRESS, alice.address)
        expect(rewardsBefore).eq(0)
        const claimableBefore = await esVsp.claimableRewards(alice.address)
        expect(claimableBefore._claimableAmounts[0]).eq(0)
        const {periodFinish} = await esVsp.rewardData(WETH_ADDRESS)

        // when
        const elapsedTime = YEAR
        await increaseTime(elapsedTime)
        await esVsp.updateReward(alice.address)

        const expectDrip = parseEther('30')
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(expectDrip)
          .mul(parseEther('1'))
          .div(await esVsp.totalLocked())

        // then
        const claimableAfter = await esVsp.claimableRewards(alice.address)
        expect(claimableAfter._claimableAmounts[0]).closeTo(expectDrip, parseEther('0.0001'))

        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await esVsp.rewardData(
          WETH_ADDRESS
        )
        const rewardsAfter = await esVsp.rewards(WETH_ADDRESS, alice.address)
        expect(rewardsAfter).closeTo(expectDrip, parseEther('0.0001'))
        expect(rewardPerTokenAfter).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(lastUpdateTimeAfter).closeTo(periodFinish, 5)
      })

      // FIXME
      it.skip('should not continue receiving rewards after lock period finishes', async function () {
        // given
        const tokenId = 1
        const {unlockTime} = await esVsp.stakeData(tokenId)
        const now = await timestampFromLatestBlock()
        await increaseTime(BigNumber.from(now).add(unlockTime))
        const before = await esVsp.claimableRewards(alice.address)
        const [claimableBefore] = before._claimableAmounts

        // when
        await esVsp.connect(distributor).notifyRewardAmount(WETH_ADDRESS, parseEther('30'))
        await increaseTime(MONTH)
        await esVsp.updateReward(alice.address)

        // then
        const after = await esVsp.claimableRewards(alice.address)
        const [claimableAfter] = after._claimableAmounts
        expect(claimableAfter).eq(claimableBefore)
      })
    })
  })

  describe('claimRewards', function () {
    describe('18 decimals reward token', function () {
      beforeEach(async function () {
        await esVsp.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(esVsp.address, amount)
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)
      })

      it('should claim pending rewards', async function () {
        // given
        await increaseTime(MONTH)
        const {_claimableAmounts} = await esVsp.claimableRewards(alice.address)
        const [claimable] = _claimableAmounts
        expect(claimable).closeTo(parseEther('30'), parseEther('0.0001'))

        // when
        const tx = () => esVsp.claimRewards(alice.address)

        // then
        await expect(tx).changeTokenBalance(weth, alice, claimable)
        expect(await esVsp.rewards(WETH_ADDRESS, alice.address)).eq(0)
      })
    })

    describe('non 18 decimals reward token', function () {
      beforeEach(async function () {
        await esVsp.connect(governor).addRewardToken(USDC_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)

        const rewardToken = USDC_ADDRESS
        const amount = parseUnits('30', 6)
        await usdc.connect(distributor).approve(esVsp.address, amount)
        await esVsp.connect(distributor).notifyRewardAmount(rewardToken, amount)
      })

      it('should claim pending rewards', async function () {
        // given
        await increaseTime(MONTH)
        const {_claimableAmounts} = await esVsp.claimableRewards(alice.address)
        const [claimable] = _claimableAmounts
        expect(claimable).closeTo(parseUnits('30', 6), parseEther('0.0001'))

        // when
        const tx = () => esVsp.claimRewards(alice.address)

        // then
        await expect(tx).changeTokenBalance(usdc, alice, claimable)
        expect(await esVsp.rewards(USDC_ADDRESS, alice.address)).eq(0)
      })
    })
  })
})
