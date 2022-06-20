import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'

const ESVSP721 = 'ESVSP721'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy} = deployments
  const {deployer} = await getNamedAccounts()

  await deploy(ESVSP721, {
    from: deployer,
    log: true,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      viaAdminContract: 'ESVSP721Upgrader',
      execute: {
        init: {
          methodName: 'initialize',
          args: ['VSP Escrow NFT', 'esVSP-NFT'],
        },
      },
    },
  })
}

export default func
func.tags = [ESVSP721]
