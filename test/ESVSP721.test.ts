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
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let esVsp721: ESVSP721
  let esVspMock: FakeContract

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, alice, bob] = await ethers.getSigners()

    esVspMock = await smock.fake('ESVSP')
    await setEtherBalance(esVspMock.address, parseEther('10'))

    const esVsp721Factory = new ESVSP721__factory(deployer)
    esVsp721 = await esVsp721Factory.deploy()
    await esVsp721.deployed()
    await esVsp721.initialize('VSP Escrow NFT', 'esVSP-NFT')
    await esVsp721.initializeESVSP(esVspMock.address)
    await esVsp721.transferGovernorship(governor.address)
    await esVsp721.connect(governor).acceptGovernorship()

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
      const expectedTokenId = 1
      expect(await esVsp721.nextTokenId()).eq(expectedTokenId)
      expect(await esVsp721.balanceOf(alice.address)).eq(0)

      // when
      await esVsp721.mint(alice.address)

      // then
      expect(await esVsp721.nextTokenId()).eq(expectedTokenId + 1)
      expect(await esVsp721.ownerOf(expectedTokenId)).eq(alice.address)
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
        // given
        const nextBefore = await esVsp721.nextTokenId()

        // when
        await esVsp721.burn(tokenId)

        // then
        expect(await esVsp721.nextTokenId()).eq(nextBefore)
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

  describe('setBaseTokenURI', function () {
    const tokenId = 1

    beforeEach(async function () {
      await esVsp721.mint(alice.address)
    })

    it('should get full token URI', async function () {
      // when
      const baseURI = 'https://vesper.finance/esVSP721/'
      await esVsp721.connect(governor).setBaseTokenURI(baseURI)

      // then
      const uri = await esVsp721.tokenURI(tokenId)
      expect(uri).eq(`${baseURI}${tokenId}`)
    })
  })

  describe('initializeESVSP', function () {
    beforeEach(async function () {
      const esVsp721Factory = new ESVSP721__factory(deployer)
      esVsp721 = await esVsp721Factory.deploy()
      await esVsp721.deployed()
      await esVsp721.initialize('VSP Escrow NFT', 'esVSP-NFT')
    })

    it('should revert if not governor', async function () {
      // when
      const tx = esVsp721.connect(alice).initializeESVSP(esVspMock.address)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if already initialized', async function () {
      // given
      await esVsp721.initializeESVSP(esVspMock.address)

      // when
      const tx = esVsp721.initializeESVSP(esVspMock.address)

      // then
      await expect(tx).revertedWith('already-initialized')
    })

    it('should revert if address is null', async function () {
      // when
      const tx = esVsp721.initializeESVSP(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('address-is-null')
    })

    it('should initialize the ESVSP contract', async function () {
      // given
      const before = await esVsp721.esVSP()
      expect(before).eq(ethers.constants.AddressZero)

      // when
      await esVsp721.initializeESVSP(esVspMock.address)

      // then
      const after = await esVsp721.esVSP()
      expect(after).eq(esVspMock.address)
    })
  })
})
