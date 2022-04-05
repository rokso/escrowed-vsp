// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/IESVSP.sol";

interface IRewards {
    /// Emitted after reward added
    event RewardAdded(address indexed rewardToken, uint256 reward, uint256 rewardDuration);
    /// Emitted whenever any user claim rewards
    event RewardPaid(address indexed user, address indexed rewardToken, uint256 reward);
    /// Emitted after adding new rewards token into rewardTokens array
    event RewardTokenAdded(address indexed rewardToken, address[] existingRewardTokens);
    /// Emitted when distributor approval is updated
    event RewardDistributorApprovalUpdated(address rewardsToken, address distributor, bool approved);

    function addRewardToken(
        address rewardsToken_,
        address distributor_,
        bool isBoosted_
    ) external;

    function claimRewards(address account_) external;

    function claimableRewards(address account_)
        external
        view
        returns (address[] memory rewardTokens_, uint256[] memory claimableAmounts_);

    function dripRewardAmount(address rewardToken_, uint256 rewardAmount_) external;

    function setRewardDistributorApproval(
        address rewardsToken_,
        address distributor_,
        bool approved_
    ) external;

    function updateReward(address account_) external;

    function lastTimeRewardApplicable(address _rewardToken) external view returns (uint256);
}
