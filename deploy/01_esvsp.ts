import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'

const ESVSP721 = 'ESVSP721'
const ESVSP = 'ESVSP'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, deploy, get, getOrNull} = deployments
  const {deployer} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(ESVSP))

  const esVSP721 = await get(ESVSP721)

  const treasuryAddress = process.env.TREASURY || deployer

  const esVSP = await deploy(ESVSP, {
    from: deployer,
    log: true,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      execute: {
        init: {
          methodName: 'initialize',
          args: ['VSP Escrow', 'esVSP', 18, esVSP721.address, treasuryAddress],
        },
      },
    },
  })

  if (!wasDeployed) {
    await execute(ESVSP721, {from: deployer, log: true}, 'initializeESVSP', esVSP.address)
  }
}

export default func
func.dependencies = [ESVSP721]
func.tags = [ESVSP]
