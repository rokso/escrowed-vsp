// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IESVSP is IERC20, IERC20Metadata {
    function lock(uint256 amount_, uint256 lockPeriod_) external;
    function notifyRewardAmount(address rewardToken_, uint256 rewardAmount_) external;
    function updateReward(address account_) external;
    function withdraw(uint256 tokenId_) external;
    function lastTimeRewardApplicable(address _rewardToken) external view returns (uint256);
    function lockedBalanceOf(address account_) external view returns (uint256);
}
