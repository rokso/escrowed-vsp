/* eslint-disable new-cap */
/* eslint-disable camelcase */
import {parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  ESVSP,
  ESVSP721,
  ESVSP721__factory,
  Rewards__factory,
  IERC20,
  IERC20__factory,
  Rewards,
  ESVSP__factory,
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
  DAY,
  MONTH,
  USDC_HOLDER,
} from './helpers'

describe('Rewards', function () {
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
  let rewards: Rewards

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, distributor, alice, bob, carl] = await ethers.getSigners()

    const esVspFactory = new ESVSP__factory(deployer)
    esVsp = await esVspFactory.deploy()
    await esVsp.deployed()

    const rewardsFactory = new Rewards__factory(deployer)
    rewards = await rewardsFactory.deploy()
    await rewards.deployed()

    const esVsp721Factory = new ESVSP721__factory(deployer)
    esVsp721 = await esVsp721Factory.deploy(esVsp.address, 'VSP Escrow NFT', 'esVSP-NFT')
    await esVsp721.deployed()

    await esVsp.initialize('VSP Escrow', 'esVSP', 18, esVsp721.address)
    await esVsp.transferGovernorship(governor.address)
    await esVsp.connect(governor).acceptGovernorship()

    await rewards.initialize(esVsp.address)
    await rewards.transferGovernorship(governor.address)
    await rewards.connect(governor).acceptGovernorship()

    await esVsp.connect(governor).setRewards(rewards.address)

    vsp = IERC20__factory.connect(VSP_ADDRESS, alice)
    rewards = rewards.connect(alice)
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

  describe('addRewardToken', function () {
    beforeEach(async function () {
      rewards = rewards.connect(governor)
    })

    it('should revert if not governor', async function () {
      // when
      const tx = rewards.connect(alice).addRewardToken(vsp.address, distributor.address, true)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if already added', async function () {
      // given
      await rewards.addRewardToken(WETH_ADDRESS, distributor.address, true)

      // when
      const tx = rewards.addRewardToken(WETH_ADDRESS, distributor.address, true)

      // then
      await expect(tx).revertedWith('reward-already-added')
    })

    it('should add reward token', async function () {
      // when
      const rewardsTokenAddress = WETH_ADDRESS
      const tx = rewards.addRewardToken(rewardsTokenAddress, distributor.address, true)

      // then
      await expect(tx).emit(rewards, 'RewardTokenAdded').withArgs(WETH_ADDRESS, [])
      const now = await timestampFromLatestBlock()
      const {isBoosted, periodFinish, rewardRates, rewardPerTokenStored, lastUpdateTime} = await rewards.rewards(
        rewardsTokenAddress
      )
      expect(isBoosted).true
      expect(periodFinish).eq(now)
      expect(rewardRates).eq(0)
      expect(rewardPerTokenStored).eq(0)
      expect(lastUpdateTime).eq(now)

      expect(await rewards.rewardTokens(0)).eq(rewardsTokenAddress)
      expect(await rewards.isRewardDistributor(rewardsTokenAddress, distributor.address)).true
    })
  })

  describe('addUpdateRewardDistributor', function () {
    beforeEach(async function () {
      rewards = rewards.connect(governor)
    })

    it('should revert if not governor', async function () {
      // when
      const tx = rewards.connect(alice).setRewardDistributorApproval(vsp.address, distributor.address, true)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if not reward token was not added', async function () {
      // when
      const tx = rewards.setRewardDistributorApproval(vsp.address, distributor.address, true)

      // then
      await expect(tx).revertedWith('reward-token-not-added')
    })

    it('should toggle approval', async function () {
      // given
      const r = WETH_ADDRESS
      const d = distributor.address

      await rewards.addRewardToken(r, d, true)

      // when-then
      const tx1 = rewards.setRewardDistributorApproval(r, d, false)
      await expect(tx1).emit(rewards, 'RewardDistributorApprovalUpdated').withArgs(r, d, false)
      expect(await rewards.isRewardDistributor(r, d)).false

      const tx2 = rewards.setRewardDistributorApproval(r, d, true)
      await expect(tx2).emit(rewards, 'RewardDistributorApprovalUpdated').withArgs(r, d, true)
      expect(await rewards.isRewardDistributor(r, d)).true
    })
  })

  describe('dripRewardAmount', function () {
    beforeEach(async function () {
      rewards = rewards.connect(distributor)

      await weth.connect(distributor).approve(rewards.address, ethers.constants.MaxUint256)
    })

    it('should revert if token is invalid', async function () {
      // when
      const tx = rewards.connect(distributor).dripRewardAmount(WETH_ADDRESS, parseEther('0.1'))

      // then
      await expect(tx).revertedWith('reward-token-not-added')
    })

    it('should revert if not distributor', async function () {
      // given
      await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)

      // when
      const tx = rewards.connect(alice).dripRewardAmount(WETH_ADDRESS, parseEther('0.1'))

      // then
      await expect(tx).revertedWith('not-distributor')
    })

    it('should revert if amount is zero', async function () {
      // given
      await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)

      // when
      const tx = rewards.dripRewardAmount(WETH_ADDRESS, 0)

      // then
      await expect(tx).revertedWith('incorrect-reward-amount')
    })

    it('should revert if reward token is invalid', async function () {
      // when
      const tx = rewards.dripRewardAmount(USDC_ADDRESS, parseUnits('100', 6))

      // then
      await expect(tx).reverted
    })

    it('should drip when there is no VSP locked', async function () {
      // given
      await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)
      const duration = await rewards.REWARD_DURATION()
      const balanceBefore = await weth.balanceOf(rewards.address)

      // when
      const rewardToken = WETH_ADDRESS
      const amount = parseEther('10')
      const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

      // then
      await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
      const now = await timestampFromLatestBlock()

      const balanceAfter = await weth.balanceOf(rewards.address)
      expect(balanceAfter.sub(balanceBefore)).eq(amount)

      const expectedRewardRates = amount.div(duration)
      const expectedRewardPerToken = 0

      const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)
      expect(rewardPerTokenStored).eq(expectedRewardPerToken)
      expect(rewardRates).eq(expectedRewardRates)
      expect(periodFinish).eq(now + duration.toNumber())
      expect(lastUpdateTime).eq(now)
    })

    describe('should drip when token is boosted', function () {
      beforeEach(async function () {
        await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      })

      it('should drip if now >= period finish (1st notification)', async function () {
        // given
        const duration = await rewards.REWARD_DURATION()
        const balanceBefore = await weth.balanceOf(rewards.address)

        // when
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30') // 1 ETH daily
        const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const balanceAfter = await weth.balanceOf(rewards.address)
        expect(balanceAfter.sub(balanceBefore)).eq(amount)

        const expectedRewardRates = amount.div(duration)
        const expectedRewardPerToken = 0

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)
        expect(rewardPerTokenStored).eq(expectedRewardPerToken)
        expect(rewardRates).eq(expectedRewardRates)
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })

      it('should drip if now >= period finish', async function () {
        // given
        const duration = await rewards.REWARD_DURATION()
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
        await increaseTime(duration.add(1))
        const {rewardPerTokenStored: rewardPerTokenBefore} = await rewards.rewards(rewardToken)
        const balanceBefore = await weth.balanceOf(rewards.address)

        // when
        const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const balanceAfter = await weth.balanceOf(rewards.address)
        expect(balanceAfter.sub(balanceBefore)).eq(amount)

        const expectedRewardRates = amount.div(duration)
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(amount)
          .mul(parseEther('1'))
          .div(await esVsp.totalBoosted())

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)
        expect(rewardPerTokenStored).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(rewardRates).eq(expectedRewardRates)
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })

      it('should drip if now < period finish', async function () {
        // given
        const duration = await rewards.REWARD_DURATION()
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
        const halfPeriod = duration.div(2)
        await increaseTime(halfPeriod)
        const {rewardPerTokenStored: rewardPerTokenBefore} = await rewards.rewards(rewardToken)

        // when
        const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const expectedRewardPerToken = rewardPerTokenBefore
          .add(amount.div(2))
          .mul(parseEther('1'))
          .div(await esVsp.totalBoosted())

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)
        expect(rewardPerTokenStored).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(rewardRates).closeTo(parseEther('1.5').div(DAY), parseEther('0.0001'))
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })
    })

    describe('should drip when token is not boosted', function () {
      beforeEach(async function () {
        await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)
      })

      it('should drip if now >= period finish (1st notification)', async function () {
        // given
        const duration = await rewards.REWARD_DURATION()
        const balanceBefore = await weth.balanceOf(rewards.address)

        // when
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30') // 1 ETH daily
        const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const balanceAfter = await weth.balanceOf(rewards.address)
        expect(balanceAfter.sub(balanceBefore)).eq(amount)

        const expectedRewardRates = amount.div(duration)
        const expectedRewardPerToken = 0

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)
        expect(rewardPerTokenStored).eq(expectedRewardPerToken)
        expect(rewardRates).eq(expectedRewardRates)
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })

      it('should drip if now >= period finish', async function () {
        // given
        const duration = await rewards.REWARD_DURATION()
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
        await increaseTime(duration.add(1))
        const {rewardPerTokenStored: rewardPerTokenBefore} = await rewards.rewards(rewardToken)
        const balanceBefore = await weth.balanceOf(rewards.address)

        // when
        const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const balanceAfter = await weth.balanceOf(rewards.address)
        expect(balanceAfter.sub(balanceBefore)).eq(amount)

        const expectedRewardRates = amount.div(duration)
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(amount)
          .mul(parseEther('1'))
          .div(await esVsp.totalLocked())

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)
        expect(rewardPerTokenStored).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(rewardRates).eq(expectedRewardRates)
        expect(periodFinish).eq(now + duration.toNumber())
        expect(lastUpdateTime).eq(now)
      })

      it('should drip if now < period finish', async function () {
        // given
        const duration = await rewards.REWARD_DURATION()
        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
        const halfPeriod = duration.div(2)
        await increaseTime(halfPeriod)
        const {rewardPerTokenStored: rewardPerTokenBefore} = await rewards.rewards(rewardToken)

        // when
        const tx = rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

        // then
        await expect(tx).emit(rewards, 'RewardAdded').withArgs(rewardToken, amount, duration)
        const now = await timestampFromLatestBlock()

        const expectedRewardPerToken = rewardPerTokenBefore
          .add(parseEther('15'))
          .mul(parseEther('1'))
          .div(await esVsp.totalLocked())

        const {rewardPerTokenStored, rewardRates, periodFinish, lastUpdateTime} = await rewards.rewards(rewardToken)
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
        await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)
        await esVsp.connect(bob).lock(parseEther('100'), YEAR.mul(2))

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(rewards.address, amount)
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

        await increaseTime(DAY.mul(10))
      })

      it('should get correct claimable rewards', async function () {
        // when
        const {_rewardTokens: _rewardTokensOfAlice, _claimableAmounts: _claimableAmountsOfAlice} =
          await rewards.claimableRewards(alice.address)
        const [tokenOfAlice] = _rewardTokensOfAlice
        const [claimableOfAlice] = _claimableAmountsOfAlice
        const {_rewardTokens: _rewardTokensOfBob, _claimableAmounts: _claimableAmountsOfBob} =
          await rewards.claimableRewards(bob.address)
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
          await rewards.claimableRewards(alice.address)
        const [tokenOfAlice] = _rewardTokensOfAlice
        const [claimableOfAlice] = _claimableAmountsOfAlice
        const {_rewardTokens: _rewardTokensOfBob, _claimableAmounts: _claimableAmountsOfBob} =
          await rewards.claimableRewards(bob.address)
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
        await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)
        await esVsp.connect(bob).lock(parseEther('100'), YEAR.mul(2))

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(rewards.address, amount)
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)

        await increaseTime(DAY.mul(10))
      })

      it('should get correct claimable rewards', async function () {
        // when
        const {_rewardTokens: _rewardTokensOfAlice, _claimableAmounts: _claimableAmountsOfAlice} =
          await rewards.claimableRewards(alice.address)
        const [tokenOfAlice] = _rewardTokensOfAlice
        const [claimableOfAlice] = _claimableAmountsOfAlice
        const {_rewardTokens: _rewardTokensOfBob, _claimableAmounts: _claimableAmountsOfBob} =
          await rewards.claimableRewards(bob.address)
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
          await rewards.claimableRewards(alice.address)
        const [tokenOfAlice] = _rewardTokensOfAlice
        const [claimableOfAlice] = _claimableAmountsOfAlice
        const {_rewardTokens: _rewardTokensOfBob, _claimableAmounts: _claimableAmountsOfBob} =
          await rewards.claimableRewards(bob.address)
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
        await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, true)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(rewards.address, ethers.constants.MaxUint256)
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
      })

      it('should update global state only if account is null', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore, lastUpdateTime: lastUpdateTimeBefore} =
          await rewards.rewards(WETH_ADDRESS)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await rewards.updateReward(ethers.constants.AddressZero)

        // then
        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await rewards.rewards(
          WETH_ADDRESS
        )
        expect(rewardPerTokenAfter).gt(rewardPerTokenBefore)
        expect(lastUpdateTimeAfter).closeTo(lastUpdateTimeBefore.add(elapsedTime), 5)
      })

      it('should give no rewards if account did not lock', async function () {
        // given
        const {claimableRewardsStored: claimableRewardsStoredBefore} = await rewards.rewardOf(
          WETH_ADDRESS,
          carl.address
        )
        expect(claimableRewardsStoredBefore).eq(0)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await rewards.updateReward(carl.address)

        // then
        const {claimableRewardsStored: claimableRewardsStoredAfter} = await rewards.rewardOf(WETH_ADDRESS, carl.address)
        expect(claimableRewardsStoredAfter).eq(0)
      })

      it('should update if now < period finish', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore, lastUpdateTime: lastUpdateTimeBefore} =
          await rewards.rewards(WETH_ADDRESS)
        const {claimableRewardsStored: claimableRewardsStoredBefore} = await rewards.rewardOf(
          WETH_ADDRESS,
          alice.address
        )
        expect(claimableRewardsStoredBefore).eq(0)
        const claimableBefore = await rewards.claimableRewards(alice.address)
        expect(claimableBefore._claimableAmounts[0]).eq(0)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await rewards.updateReward(alice.address)

        const expectDrip = parseEther('10')
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(expectDrip)
          .mul(parseEther('1'))
          .div(await esVsp.totalBoosted())

        // then
        const claimableAfter = await rewards.claimableRewards(alice.address)
        expect(claimableAfter._claimableAmounts[0]).closeTo(expectDrip, parseEther('0.0001'))

        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await rewards.rewards(
          WETH_ADDRESS
        )
        const {claimableRewardsStored: claimableRewardsStoredAfter} = await rewards.rewardOf(
          WETH_ADDRESS,
          alice.address
        )
        expect(claimableRewardsStoredAfter).closeTo(expectDrip, parseEther('0.0001'))
        expect(rewardPerTokenAfter).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(lastUpdateTimeAfter).closeTo(lastUpdateTimeBefore.add(elapsedTime), 5)
      })

      it('should update if now >= period finish', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore} = await rewards.rewards(WETH_ADDRESS)
        const {claimableRewardsStored: claimableRewardsStoredBefore} = await rewards.rewardOf(
          WETH_ADDRESS,
          alice.address
        )
        expect(claimableRewardsStoredBefore).eq(0)
        const claimableBefore = await rewards.claimableRewards(alice.address)
        expect(claimableBefore._claimableAmounts[0]).eq(0)
        const {periodFinish} = await rewards.rewards(WETH_ADDRESS)

        // when
        const elapsedTime = YEAR
        await increaseTime(elapsedTime)
        await rewards.updateReward(alice.address)

        const expectDrip = parseEther('30')
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(expectDrip)
          .mul(parseEther('1'))
          .div(await esVsp.totalBoosted())

        // then
        const claimableAfter = await rewards.claimableRewards(alice.address)
        expect(claimableAfter._claimableAmounts[0]).closeTo(expectDrip, parseEther('0.0001'))

        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await rewards.rewards(
          WETH_ADDRESS
        )
        const {claimableRewardsStored: claimableRewardsStoredAfter} = await rewards.rewardOf(
          WETH_ADDRESS,
          alice.address
        )
        expect(claimableRewardsStoredAfter).closeTo(expectDrip, parseEther('0.0001'))
        expect(rewardPerTokenAfter).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(lastUpdateTimeAfter).closeTo(periodFinish, 5)
      })
    })

    describe('when token is not boosted', function () {
      beforeEach(async function () {
        await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(rewards.address, ethers.constants.MaxUint256)
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
      })

      it('should update global state only if account is null', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore, lastUpdateTime: lastUpdateTimeBefore} =
          await rewards.rewards(WETH_ADDRESS)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await rewards.updateReward(ethers.constants.AddressZero)

        // then
        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await rewards.rewards(
          WETH_ADDRESS
        )
        expect(rewardPerTokenAfter).gt(rewardPerTokenBefore)
        expect(lastUpdateTimeAfter).closeTo(lastUpdateTimeBefore.add(elapsedTime), 5)
      })

      it('should give no rewards if account did not lock', async function () {
        // given
        const {claimableRewardsStored: claimableRewardsStoredBefore} = await rewards.rewardOf(
          WETH_ADDRESS,
          carl.address
        )
        expect(claimableRewardsStoredBefore).eq(0)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await rewards.updateReward(carl.address)

        // then
        const {claimableRewardsStored: claimableRewardsStoredAfter} = await rewards.rewardOf(WETH_ADDRESS, carl.address)
        expect(claimableRewardsStoredAfter).eq(0)
      })

      it('should update if now < period finish', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore, lastUpdateTime: lastUpdateTimeBefore} =
          await rewards.rewards(WETH_ADDRESS)
        const {claimableRewardsStored: claimableRewardsStoredBefore} = await rewards.rewardOf(
          WETH_ADDRESS,
          alice.address
        )
        expect(claimableRewardsStoredBefore).eq(0)
        const claimableBefore = await rewards.claimableRewards(alice.address)
        expect(claimableBefore._claimableAmounts[0]).eq(0)

        // when
        const elapsedTime = DAY.mul(10)
        await increaseTime(elapsedTime)
        await rewards.updateReward(alice.address)

        const expectDrip = parseEther('10')
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(expectDrip)
          .mul(parseEther('1'))
          .div(await esVsp.totalLocked())

        // then
        const claimableAfter = await rewards.claimableRewards(alice.address)
        expect(claimableAfter._claimableAmounts[0]).closeTo(expectDrip, parseEther('0.0001'))

        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await rewards.rewards(
          WETH_ADDRESS
        )
        const {claimableRewardsStored: claimableRewardsStoredAfter} = await rewards.rewardOf(
          WETH_ADDRESS,
          alice.address
        )
        expect(claimableRewardsStoredAfter).closeTo(expectDrip, parseEther('0.0001'))
        expect(rewardPerTokenAfter).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(lastUpdateTimeAfter).closeTo(lastUpdateTimeBefore.add(elapsedTime), 5)
      })

      it('should update if now >= period finish', async function () {
        // given
        const {rewardPerTokenStored: rewardPerTokenBefore} = await rewards.rewards(WETH_ADDRESS)
        const {claimableRewardsStored: claimableRewardsStoredBefore} = await rewards.rewardOf(
          WETH_ADDRESS,
          alice.address
        )
        expect(claimableRewardsStoredBefore).eq(0)
        const claimableBefore = await rewards.claimableRewards(alice.address)
        expect(claimableBefore._claimableAmounts[0]).eq(0)
        const {periodFinish} = await rewards.rewards(WETH_ADDRESS)

        // when
        const elapsedTime = YEAR
        await increaseTime(elapsedTime)
        await rewards.updateReward(alice.address)

        const expectDrip = parseEther('30')
        const expectedRewardPerToken = rewardPerTokenBefore
          .add(expectDrip)
          .mul(parseEther('1'))
          .div(await esVsp.totalLocked())

        // then
        const claimableAfter = await rewards.claimableRewards(alice.address)
        expect(claimableAfter._claimableAmounts[0]).closeTo(expectDrip, parseEther('0.0001'))

        const {rewardPerTokenStored: rewardPerTokenAfter, lastUpdateTime: lastUpdateTimeAfter} = await rewards.rewards(
          WETH_ADDRESS
        )
        const {claimableRewardsStored: claimableRewardsStoredAfter} = await rewards.rewardOf(
          WETH_ADDRESS,
          alice.address
        )
        expect(claimableRewardsStoredAfter).closeTo(expectDrip, parseEther('0.0001'))
        expect(rewardPerTokenAfter).closeTo(expectedRewardPerToken, parseEther('0.0001'))
        expect(lastUpdateTimeAfter).closeTo(periodFinish, 5)
      })
    })
  })

  describe('claimRewards', function () {
    describe('18 decimals reward token', function () {
      beforeEach(async function () {
        await rewards.connect(governor).addRewardToken(WETH_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)

        const rewardToken = WETH_ADDRESS
        const amount = parseEther('30')
        await weth.connect(distributor).approve(rewards.address, amount)
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
      })

      it('should claim pending rewards', async function () {
        // given
        await increaseTime(MONTH)
        const {_claimableAmounts} = await rewards.claimableRewards(alice.address)
        const [claimable] = _claimableAmounts
        expect(claimable).closeTo(parseEther('30'), parseEther('0.0001'))

        // when
        const tx = () => rewards.claimRewards(alice.address)

        // then
        await expect(tx).changeTokenBalance(weth, alice, claimable)
        const {claimableRewardsStored} = await rewards.rewardOf(WETH_ADDRESS, alice.address)
        expect(claimableRewardsStored).eq(0)
      })
    })

    describe('non 18 decimals reward token', function () {
      beforeEach(async function () {
        await rewards.connect(governor).addRewardToken(USDC_ADDRESS, distributor.address, false)
        await esVsp.connect(alice).lock(parseEther('100'), YEAR)

        const rewardToken = USDC_ADDRESS
        const amount = parseUnits('30', 6)
        await usdc.connect(distributor).approve(rewards.address, amount)
        await rewards.connect(distributor).dripRewardAmount(rewardToken, amount)
      })

      it('should claim pending rewards', async function () {
        // given
        await increaseTime(MONTH)
        const {_claimableAmounts} = await rewards.claimableRewards(alice.address)
        const [claimable] = _claimableAmounts
        expect(claimable).closeTo(parseUnits('30', 6), parseEther('0.0001'))

        // when
        const tx = () => rewards.claimRewards(alice.address)

        // then
        await expect(tx).changeTokenBalance(usdc, alice, claimable)
        const {claimableRewardsStored} = await rewards.rewardOf(WETH_ADDRESS, alice.address)
        expect(claimableRewardsStored).eq(0)
      })
    })
  })
})
