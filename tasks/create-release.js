const fs = require('fs')
const _ = require('lodash')
const compareVersions = require('compare-versions')

const readFileAsJson = (fileName) => JSON.parse(fs.readFileSync(fileName).toString())

const getAddress = (fileName) => readFileAsJson(fileName).address

// Return pool deployment name and address
function getDeploymentData() {
  const network = hre.network.name
  const networkDir = `./deployments/${network}`
  const data = fs.readdirSync(networkDir).map(function (fileName) {
    if (fileName.includes('.json')) {
      return {
        [fileName.split('.json')[0]]: getAddress(`${networkDir}/${fileName}`),
      }
    }
    return {}
  })
  return _.merge(...data)
}

function getPreviousRelease() {
  let releases = fs.readdirSync('releases')
  if (releases.length) {
    if (releases[0] === '.DS_Store') {
      releases.shift() // delete first element, generally found on mac machine.
    }
    releases = releases.sort(compareVersions)
    const prevRelease = releases[releases.length - 1]
    const preReleaseFile = `releases/${prevRelease}/contracts.json`
    if (fs.existsSync(preReleaseFile)) {
      return readFileAsJson(preReleaseFile)
    }
  }
  return {}
}

/* eslint-disable no-param-reassign */
task('create-release', 'Create release file from deploy data')
  .addParam('release', 'Vesper release semantic version, i.e 1.2.3')
  .setAction(async function ({ release }) {
    const network = hre.network.name
    
    // Read deployment name and address
    const deployData = getDeploymentData()

    const releaseDir = `releases/${release}`
    const releaseFile = `${releaseDir}/contracts.json`

    // Get previous release data
    const prevReleaseData = getPreviousRelease()
    let releaseData = {}

    // If last stored release is same as current release
    if (prevReleaseData.version === release) {
      // Update release with new deployment
      releaseData = prevReleaseData
    } else {
      // If this is new release
      // Create new release directory if doesn't exist
      if (!fs.existsSync(releaseDir)) {
        fs.mkdirSync(releaseDir, { recursive: true })
      }
      // Copy data from previous release
      releaseData = prevReleaseData
      // Update release version
      releaseData.version = release
    }
    // We might have new network in this deployment, if not exist add empty network
    if (!releaseData.networks) {
      releaseData.networks = {}
      releaseData.networks[network] = {}
    } else if (!releaseData.networks[network]) {
      releaseData.networks[network] = {}
    }
    // Update pool data with latest deployment
    releaseData.networks[network] = deployData
    // Write release data into file
    fs.writeFileSync(releaseFile, JSON.stringify(releaseData, null, 2))
  })

module.exports = {}
