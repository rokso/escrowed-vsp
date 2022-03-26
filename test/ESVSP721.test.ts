import {FakeContract, smock} from '@defi-wonderland/smock'
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {ESVSP721, ESVSP721__factory} from '../typechain'
import {setEtherBalance} from './helpers'

chai.use(smock.matchers)

describe('ESVSP721', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let esVsp721: ESVSP721
  let esVspMock: FakeContract

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    esVspMock = await smock.fake('ESVSP')
    await setEtherBalance(esVspMock.address, parseEther('10'))

    const esVsp721Factory = new ESVSP721__factory(deployer)
    esVsp721 = await esVsp721Factory.deploy(esVspMock.address, 'VSP Escrow NFT', 'esVSP-NFT')
    await esVsp721.deployed()

    esVsp721 = esVsp721.connect(esVspMock.wallet)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('mint', function () {
    it('should revert if caller is not esVSP', async function () {
      // when
      const tx = esVsp721.connect(alice).mint(alice.address)

      // then
      await expect(tx).revertedWith('not-esvsp')
    })

    it('should mint', async function () {
      // given
      expect(await esVsp721.tokenId()).eq(0)
      expect(await esVsp721.balanceOf(alice.address)).eq(0)

      // when
      await esVsp721.mint(alice.address)

      // then
      const tokenId = 1
      expect(await esVsp721.tokenId()).eq(tokenId)
      expect(await esVsp721.ownerOf(tokenId)).eq(alice.address)
      expect(await esVsp721.balanceOf(alice.address)).eq(1)
    })
  })

  describe('when alice has a token', function () {
    const tokenId = 1

    beforeEach(async function () {
      await esVsp721.mint(alice.address)
    })

    describe('burn', function () {
      it('should revert if caller is not esVSP', async function () {
        // when
        const tx = esVsp721.connect(alice).burn(tokenId)

        // then
        await expect(tx).revertedWith('not-esvsp')
      })

      it('should burn', async function () {
        // when
        await esVsp721.burn(tokenId)

        // then
        expect(await esVsp721.tokenId()).eq(tokenId) // keeps counter state
        expect(await esVsp721.balanceOf(alice.address)).eq(0)
      })
    })

    describe('transfer', function () {
      it('should revert if transferring to address(0)', async function () {
        // when
        const tx = esVsp721.connect(alice).transferFrom(alice.address, ethers.constants.AddressZero, tokenId)

        // then
        await expect(tx).reverted
      })

      it('should call esVSP.transferPosition()', async function () {
        // when
        await esVsp721.connect(alice).transferFrom(alice.address, bob.address, tokenId)

        // then
        expect(esVspMock.transferPosition).to.have.been.calledWith(tokenId, bob.address)
      })
    })
  })
})
