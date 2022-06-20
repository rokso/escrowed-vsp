/* eslint-disable camelcase */
import {Contract, ContractFactory} from '@ethersproject/contracts'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {parseEther} from 'ethers/lib/utils'
import {deployments, ethers} from 'hardhat'
import {
  ESVSP,
  ESVSP__factory,
  ESVSP721,
  ESVSP721__factory,
  Rewards,
  Rewards__factory,
  ESVSPUpgrader,
  ESVSPUpgrader__factory,
  ESVSP721Upgrader,
  ESVSP721Upgrader__factory,
  RewardsUpgrader,
  RewardsUpgrader__factory,
  UpgraderBase,
} from '../typechain'

describe('Deployments', function () {
  let deployer: SignerWithAddress
  let esvsp: ESVSP
  let esvsp721: ESVSP721
  let rewards: Rewards
  let esvspUpgrader: ESVSPUpgrader
  let esvsp721Upgrader: ESVSP721Upgrader
  let rewardsUpgrader: RewardsUpgrader

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer] = await ethers.getSigners()

    const {
      ESVSP: {address: esVspAddress},
      ESVSP721: {address: esVsp721Address},
      Rewards: {address: rewardsAddress},
      ESVSPUpgrader: {address: esVspUpgraderAddress},
      ESVSP721Upgrader: {address: esVsp721UpgraderAddress},
      RewardsUpgrader: {address: rewardsUpgraderAddress},
    } = await deployments.fixture()

    esvsp = ESVSP__factory.connect(esVspAddress, deployer)
    esvspUpgrader = ESVSPUpgrader__factory.connect(esVspUpgraderAddress, deployer)

    esvsp721 = ESVSP721__factory.connect(esVsp721Address, deployer)
    esvsp721Upgrader = ESVSP721Upgrader__factory.connect(esVsp721UpgraderAddress, deployer)

    rewards = Rewards__factory.connect(rewardsAddress, deployer)
    rewardsUpgrader = RewardsUpgrader__factory.connect(rewardsUpgraderAddress, deployer)
  })

  const upgradeTestcase = async function ({
    proxy,
    upgrader,
    newImplfactory,
    expectToFail,
  }: {
    proxy: Contract
    upgrader: UpgraderBase
    newImplfactory: ContractFactory
    expectToFail: boolean
  }) {
    // given
    const newImpl = await newImplfactory.deploy()
    await newImpl.deployed()

    const oldImpl = await upgrader.getProxyImplementation(proxy.address)
    expect(oldImpl).not.eq(newImpl.address)

    // when
    const tx = upgrader.upgrade(proxy.address, newImpl.address)

    // then
    if (expectToFail) {
      await expect(tx).reverted
    } else {
      await tx
      expect(await upgrader.getProxyImplementation(proxy.address)).eq(newImpl.address)
    }
  }

  describe('ESVSP', function () {
    it('should have correct params', async function () {
      expect(await esvsp.decimals()).eq(18)
      expect(await esvsp.name()).eq('VSP Escrow')
      expect(await esvsp.symbol()).eq('esVSP')
      expect(await esvsp.esVSP721()).eq(esvsp721.address)
      expect(await esvsp.rewards()).eq(rewards.address)
      expect(await esvsp.totalLocked()).eq(0)
      expect(await esvsp.totalBoosted()).eq(0)
      expect(await esvsp.exitPenalty()).eq(parseEther('0.5'))
      expect(await esvsp.governor()).eq(deployer.address)
      expect(await esvsp.proposedGovernor()).eq(ethers.constants.AddressZero)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new ESVSP__factory(deployer),
        proxy: esvsp,
        upgrader: esvspUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new ESVSP721__factory(deployer),
        proxy: esvsp,
        upgrader: esvspUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('ESVSP721', function () {
    it('should have correct params', async function () {
      expect(await esvsp721.name()).eq('VSP Escrow NFT')
      expect(await esvsp721.symbol()).eq('esVSP-NFT')
      expect(await esvsp721.baseTokenURI()).eq('')
      expect(await esvsp721.esVSP()).eq(esvsp.address)
      expect(await esvsp721.nextTokenId()).eq(1)
      expect(await esvsp721.governor()).eq(deployer.address)
      expect(await esvsp721.proposedGovernor()).eq(ethers.constants.AddressZero)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new ESVSP721__factory(deployer),
        proxy: esvsp721,
        upgrader: esvsp721Upgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new ESVSP__factory(deployer),
        proxy: esvsp721,
        upgrader: esvsp721Upgrader,
        expectToFail: true,
      })
    })
  })

  describe('Rewards', function () {
    it('should have correct params', async function () {
      expect(await rewards.esVSP()).eq(esvsp.address)
      expect(await rewards.governor()).eq(deployer.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new Rewards__factory(deployer),
        proxy: rewards,
        upgrader: rewardsUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new ESVSP__factory(deployer),
        proxy: rewards,
        upgrader: rewardsUpgrader,
        expectToFail: true,
      })
    })
  })
})
