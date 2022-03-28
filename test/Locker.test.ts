import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {ESVSP__factory, ESVSP, ESVSP721__factory, ESVSP721, ERC20Mock__factory, ERC20Mock} from '../typechain'


describe('Locker', function () {
  let deployer: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let esVSP: ESVSP
  let esVSP721: ESVSP721
  let anyToken: ERC20Mock
  const name = 'escrowed-VSP'
  const symbol = 'vsEth'
  beforeEach('should lock VSP', async function () {
    [deployer, user1, user2] = await ethers.getSigners()
   
    const esVSPFactory = new ESVSP__factory(deployer)
    esVSP = await esVSPFactory.deploy()
    await esVSP.deployed()

    const esVSP721Factory = new ESVSP721__factory(deployer)
    esVSP721 = await esVSP721Factory.deploy(esVSP.address, 'escrowed-VSP721', 'esVSP721')
    await esVSP721.deployed()
    console.log('esVSP721', esVSP721.address)
    await esVSP.initialize(name, symbol, 18, esVSP721.address)

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    anyToken = await erc20MockFactory.deploy()
    await anyToken.deployed()
    anyToken.mint(user1.address, parseEther('10.0'))

  })

  describe('lock', function () {
    it('should revert if amount is zero', async function () {})

    it('should revert if period is < min', async function () {})

    it('should revert if period is > max', async function () {})

    it.only('should lock VSP', async function () {
      anyToken.connect(user1).approve(esVSP.address, parseEther('1.0'))
      esVSP.lock(parseEther('1.0'), 30 * 24 * 60 * 60)
      let balance = await esVSP.balanceOf(user1.address)
      console.log(balance.toString())
      balance = await esVSP.balanceOf(deployer.address)
      console.log(balance.toString())
    })
  })

  // Note: Doesn't duplicate test cases from `lock()` because assumes the same implementation
  describe('lockFor', function () {
    it('should lock on behalf of other user', async function () {})
  })

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
