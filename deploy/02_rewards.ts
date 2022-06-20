import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'

const ESVSP = 'ESVSP'
const Rewards = 'Rewards'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, deploy, get, getOrNull} = deployments
  const {deployer} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(Rewards))

  const esVSP = await get(ESVSP)

  const rewards = await deploy(Rewards, {
    from: deployer,
    log: true,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      viaAdminContract: 'RewardsUpgrader',
      execute: {
        init: {
          methodName: 'initialize',
          args: [esVSP.address],
        },
      },
    },
  })

  if (!wasDeployed) {
    await execute(ESVSP, {from: deployer, log: true}, 'initializeRewards', rewards.address)
  }
}

export default func
func.dependencies = [ESVSP]
func.tags = [Rewards]
